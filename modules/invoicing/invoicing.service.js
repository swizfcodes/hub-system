"use strict";

const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const { getVatRate } = require("../../config/businesses");
const notifService = require("../../shared/notifications/notifications.service");
const auditService = require("../../shared/audit/audit.service");
const journalService = require("../accounting/journal.service");
const stockService = require("../stock/stock.service");
const { renderToPDF } = require("../../lib/pdf/generator");
const { sendWithAttachment } = require("../../lib/email/sender");
const whatsapp = require("../../integrations/messaging/adapters/whatsapp");
const logger = require("../../config/logger");
const repo = require("./invoicing.repository");
const loyaltyService = require("../loyalty/loyalty.service");

async function list(
  business,
  { page = 1, limit = 50, status, contactId },
  scope,
  user,
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.list(client, {
      status,
      contactId,
      scope,
      userId: user.user_id,
      limit: parseInt(limit),
      offset,
    });
    return { data: rows };
  });
}

async function getById(business, invoiceId) {
  return withBusinessContext(business, async (client) =>
    repo.findById(client, invoiceId),
  );
}

async function create(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const invoiceNumber = await nextDocumentNumber(client, business, "invoice");

    let subtotal = 0,
      vatTotal = 0;
    // Per-line vat_rate is honoured if supplied (lets a VAT-exempt
    // line pass vat_rate: 0); otherwise fall back to the business's
    // configured rate rather than a hardcoded 7.5%.
    const defaultVatRate = getVatRate(business);
    for (const line of data.lines) {
      const lineTotal =
        line.unit_price * line.quantity - (line.discount_amount || 0);
      const rate = line.vat_rate != null ? line.vat_rate : defaultVatRate;
      const vatAmt = lineTotal * rate;
      subtotal += lineTotal;
      vatTotal += vatAmt;
    }
    const total = subtotal + vatTotal - (data.discount_total || 0);

    const inv = await repo.insert(client, {
      invoiceNumber,
      invoice_type: data.invoice_type,
      contact_id: data.contact_id,
      order_id: data.order_id,
      due_date: data.due_date,
      subtotal,
      discount_total: data.discount_total,
      vatTotal,
      total,
      currency: data.currency,
      notes: data.notes,
      payment_instructions: data.payment_instructions,
      userId: user.user_id,
    });

    for (let i = 0; i < data.lines.length; i++) {
      const l = data.lines[i];
      const lineTotal = l.unit_price * l.quantity - (l.discount_amount || 0);
      const rate = l.vat_rate != null ? l.vat_rate : defaultVatRate;
      const vatAmt = lineTotal * rate;
      await repo.insertLine(client, {
        invoice_id: inv.invoice_id,
        product_id: l.product_id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_amount: l.discount_amount,
        vat_rate: l.vat_rate,
        vatAmt,
        lineTotal: lineTotal + vatAmt,
        order: i,
      });
    }

    await postInvoiceJournal(client, business, inv);

    // Post the cost-of-goods-sold journal — relieves Inventory and books
    // the cost side of the sale to COGS. Without this step the P&L
    // would show every sale as 100% margin and the Balance Sheet
    // inventory line would never reduce.
    //
    // Skip for credit notes and any non-sale invoice types — there's
    // no stock movement (and therefore no COGS) on a refund/credit.
    if (data.invoice_type === "sale" || !data.invoice_type) {
      await postSaleCOGSJournal(client, business, inv, data.lines);
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "invoicing",
      action: "create",
      table: "invoices",
      recordId: inv.invoice_id,
      after: inv,
    });

    return inv;
  });
}

async function postInvoiceJournal(client, business, invoice) {
  // Resolve account IDs through the canonical accounting helper so the
  // codes are looked up consistently across modules (payroll uses the
  // same path).
  //
  // Chart-of-accounts codes (Nigerian SME convention):
  //   1310 — Accounts Receivable (asset)
  //   4100 — Sales Revenue (income)
  //   2210 — VAT Payable (liability)
  const ar = await journalService.getAccountId(client, "1310");
  const rev = await journalService.getAccountId(client, "4100");
  const vat = await journalService.getAccountId(client, "2210");

  // Refuse silently if the COA is mis-seeded — the AR/Revenue pair is
  // the minimum we need to produce a balanced entry. (VAT is optional;
  // a zero-VAT invoice still produces a valid two-line entry.)
  if (!ar || !rev) {
    logger.warn(
      `[invoicing] postInvoiceJournal skipped — missing COA accounts: ` +
        `ar=${ar ? "ok" : "missing 1310"} rev=${rev ? "ok" : "missing 4100"}`,
    );
    return;
  }

  // Build the journal:
  //   DR Accounts Receivable    total_amount
  //     CR Sales Revenue        subtotal
  //     CR VAT Payable          vat_amount   (only if VAT present)
  //
  // journalService.postEntry validates DR=CR with a 0.01 tolerance and
  // stamps the active fiscal period — neither of which the old direct-
  // insert path did. If the numbers don't balance (e.g. a future bug
  // changes how subtotal/vat are computed), the post throws and the
  // surrounding withBusinessContext rolls back the invoice creation.
  const lines = [
    { account_id: ar, debit: invoice.total_amount, credit: 0 },
    { account_id: rev, debit: 0, credit: invoice.subtotal },
  ];
  if (vat && parseFloat(invoice.vat_amount || 0) > 0) {
    lines.push({ account_id: vat, debit: 0, credit: invoice.vat_amount });
  }

  await journalService.postEntry(client, {
    description: `Invoice ${invoice.invoice_number}`,
    referenceType: "invoice",
    referenceId: invoice.invoice_id,
    postedBy: invoice.created_by,
    lines,
  });
}

async function postSaleCOGSJournal(client, business, invoice, invoiceLines) {
  // Compute total COGS across all line items at the moment of sale.
  // calculateSaleCOGS uses weighted-average unit cost from inbound stock
  // movements (received_from_supplier, transferred_in) and falls back
  // to products.cost_price when no inbound movements have been recorded.
  const { total_cost } = await stockService.calculateSaleCOGS(
    client,
    invoiceLines.map((l) => ({
      product_id: l.product_id,
      quantity: l.quantity,
    })),
  );

  // If the catalogue has no cost data at all (every product has
  // cost_price = 0 and no inbound movements with unit_cost), total
  // comes back as zero. Skip the entry rather than post a useless
  // zero-amount journal.
  if (!total_cost || total_cost <= 0) {
    logger.warn(
      `[invoicing] COGS journal skipped for invoice ${invoice.invoice_number}: ` +
        `no cost data on any line item`,
    );
    return;
  }

  // Chart-of-accounts codes (Nigerian SME convention):
  //   5000 — Cost of Goods Sold (expense)
  //   1410 — Stock (current asset) — per-business "Jewelry Stock" /
  //          "Diffuser Stock" / etc. — the account NAME differs per
  //          business but the CODE is the same.
  const cogsAcc = await journalService.getAccountId(client, "5000");
  const inventoryAcc = await journalService.getAccountId(client, "1410");

  if (!cogsAcc || !inventoryAcc) {
    logger.warn(
      `[invoicing] COGS journal skipped for invoice ${invoice.invoice_number}: ` +
        `missing COA accounts cogs=${cogsAcc ? "ok" : "missing 5000"} ` +
        `inventory=${inventoryAcc ? "ok" : "missing 1410"}`,
    );
    return;
  }

  //   DR Cost of Goods Sold   total_cost
  //     CR Stock              total_cost
  await journalService.postEntry(client, {
    description: `COGS for Invoice ${invoice.invoice_number}`,
    referenceType: "invoice_cogs",
    referenceId: invoice.invoice_id,
    postedBy: invoice.created_by,
    lines: [
      { account_id: cogsAcc, debit: total_cost, credit: 0 },
      { account_id: inventoryAcc, debit: 0, credit: total_cost },
    ],
  });
}

async function recordPayment(business, invoiceId, data, user) {
  let contactId = null;

  const payment = await withBusinessContext(business, async (client) => {
    const inv = await repo.getInvoiceNumberAndContact(client, invoiceId);
    contactId = inv?.contact_id || null;

    const p = await repo.insertPayment(client, {
      invoiceId,
      payment_date: data.payment_date,
      amount: data.amount,
      payment_method: data.payment_method,
      reference: data.reference,
      paystack_reference: data.paystack_reference,
      is_confirmed: data.is_confirmed,
      userId: user.user_id,
      notes: data.notes,
    });

    // Recalculate invoice amount_paid and status.
    await repo.updateAmountPaid(client, invoiceId);

    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "invoicing",
      action: "create",
      table: "invoice_payments",
      recordId: p.payment_id,
      after: p,
    });

    return p;
  });

  if (contactId && data.is_confirmed !== false) {
    loyaltyService
      .awardPoints(
        business,
        contactId,
        data.amount,
        "invoice_payment",
        payment.payment_id,
        user,
      )
      .catch((err) =>
        logger.error("[loyalty] award failed after invoice payment", err),
      );
  }

  return payment;
}

async function send(business, invoiceId, { channel = "email" }, user) {
  const inv = await getById(business, invoiceId);
  if (!inv)
    throw Object.assign(new Error("Invoice not found"), { status: 404 });

  const pdf = await generatePDF(business, invoiceId);

  // Guard before sending — don't mark an invoice 'sent' if the
  // contact has no address for the channel.
  if (channel === "email" && !inv.email) {
    throw Object.assign(new Error("Contact has no email address on file"), {
      status: 400,
    });
  }
  if (channel === "whatsapp" && !inv.whatsapp_number) {
    throw Object.assign(new Error("Contact has no WhatsApp number on file"), {
      status: 400,
    });
  }
  if (channel !== "email" && channel !== "whatsapp") {
    throw Object.assign(new Error(`Unsupported channel: ${channel}`), {
      status: 400,
    });
  }

  if (channel === "email") {
    await sendWithAttachment({
      to: inv.email,
      subject: `Invoice ${inv.invoice_number}`,
      html: `<p>Dear ${inv.contact_name}, please find attached your invoice ${inv.invoice_number} for ₦${Number(inv.total_amount).toLocaleString()}. Due: ${inv.due_date}.</p>`,
      filename: `${inv.invoice_number}.pdf`,
      pdfBuffer: pdf,
    });
  } else if (channel === "whatsapp") {
    await whatsapp.sendMessage({
      to: inv.whatsapp_number,
      text: `Dear ${inv.contact_name}, your invoice ${inv.invoice_number} of ₦${Number(inv.total_amount).toLocaleString()} is due on ${inv.due_date}. Please make payment to our bank account.`,
    });
  }

  // Mark sent only after a successful send.
  await withBusinessContext(business, async (client) =>
    repo.setSent(client, invoiceId),
  );
}

async function voidInvoice(business, invoiceId, user) {
  return withBusinessContext(business, async (client) => {
    const inv = await repo.setVoided(client, invoiceId);
    if (!inv)
      throw Object.assign(new Error("Cannot void this invoice"), {
        status: 400,
      });

    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "invoicing",
      action: "delete",
      table: "invoices",
      recordId: invoiceId,
      before: inv,
    });
  });
}

async function generatePDF(business, invoiceId) {
  const inv = await getById(business, invoiceId);
  if (!inv)
    throw Object.assign(new Error("Invoice not found"), { status: 404 });
  return renderToPDF("invoices", inv);
}

// ─────────────────────────────────────────────────────────────
// CREDIT NOTES
//
// A credit note reverses all or part of an invoice — the refund /
// return document. Lifecycle: draft → issued → applied | refunded.
//
// Issuing a credit note posts a REVERSING journal:
//   DR Sales Revenue   (net)      — income reduced
//   DR VAT Payable     (vat)      — VAT liability reduced
//     CR Accounts Receivable (total) — customer owes less
// This is the mirror of postInvoiceJournal. Posted via the canonical
// journalService.postEntry so it gets DR=CR validation and a fiscal
// period stamp.
// ─────────────────────────────────────────────────────────────

async function listCreditNotes(business, query) {
  return withBusinessContext(business, async (client) => {
    const data = await repo.listCreditNotes(client, {
      invoiceId: query.invoice_id,
      status: query.status,
      limit: query.limit ? parseInt(query.limit) : 50,
      offset: query.page
        ? (parseInt(query.page) - 1) * (parseInt(query.limit) || 50)
        : 0,
    });
    return { data };
  });
}

async function getCreditNote(business, creditNoteId) {
  return withBusinessContext(business, async (client) => {
    const cn = await repo.findCreditNoteById(client, creditNoteId);
    if (!cn) {
      throw Object.assign(new Error("Credit note not found"), { status: 404 });
    }
    return cn;
  });
}

async function createCreditNote(business, data, user) {
  if (!data.invoice_id) {
    throw Object.assign(new Error("invoice_id is required"), { status: 400 });
  }
  if (!data.reason || !data.reason.trim()) {
    throw Object.assign(new Error("reason is required"), { status: 400 });
  }
  if (!Array.isArray(data.lines) || data.lines.length === 0) {
    throw Object.assign(new Error("At least one line is required"), {
      status: 400,
    });
  }
  return withBusinessContext(business, async (client) => {
    const invoice = await repo.findById(client, data.invoice_id);
    if (!invoice) {
      throw Object.assign(new Error("Invoice not found"), { status: 404 });
    }

    let totalAmount = 0;
    for (const l of data.lines) {
      const lineTotal = l.unit_price * l.quantity;
      totalAmount += lineTotal;
    }
    // A credit note cannot exceed the invoice it credits.
    if (totalAmount > parseFloat(invoice.total_amount)) {
      throw Object.assign(
        new Error(
          `Credit note total (${totalAmount}) exceeds invoice total ` +
            `(${invoice.total_amount})`,
        ),
        { status: 400 },
      );
    }

    const creditNoteNumber = await nextDocumentNumber(
      client,
      business,
      "credit_note",
    );
    const cn = await repo.insertCreditNote(client, {
      creditNoteNumber,
      invoiceId: data.invoice_id,
      contactId: invoice.contact_id,
      reason: data.reason.trim(),
      totalAmount,
      createdBy: user.user_id,
    });

    for (const l of data.lines) {
      await repo.insertCreditNoteLine(client, {
        creditNoteId: cn.credit_note_id,
        productId: l.product_id,
        description: l.description || "Credit note line",
        quantity: l.quantity,
        unitPrice: l.unit_price,
        lineTotal: l.unit_price * l.quantity,
      });
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "invoicing",
      action: "create",
      table: "credit_notes",
      recordId: cn.credit_note_id,
      after: cn,
    });

    return repo.findCreditNoteById(client, cn.credit_note_id);
  });
}

async function issueCreditNote(business, creditNoteId, user) {
  return withBusinessContext(business, async (client) => {
    const cn = await repo.findCreditNoteById(client, creditNoteId);
    if (!cn) {
      throw Object.assign(new Error("Credit note not found"), { status: 404 });
    }
    if (cn.status !== "draft") {
      throw Object.assign(new Error(`Credit note is already ${cn.status}`), {
        status: 400,
      });
    }

    const updated = await repo.setCreditNoteStatus(
      client,
      creditNoteId,
      "issued",
    );

    // Post the reversing journal. The VAT portion is backed out of the
    // total at the business rate (the invoice charged VAT, so the
    // credit reverses it).
    const vatRate = getVatRate(business);
    const total = parseFloat(cn.total_amount);
    const net = parseFloat((total / (1 + vatRate)).toFixed(2));
    const vat = parseFloat((total - net).toFixed(2));

    const ar = await journalService.getAccountId(client, "1310");
    const rev = await journalService.getAccountId(client, "4100");
    const vatAcc = await journalService.getAccountId(client, "2210");

    if (ar && rev) {
      const lines = [
        { account_id: rev, debit: net, credit: 0 },
        { account_id: ar, debit: 0, credit: total },
      ];
      if (vatAcc && vat > 0) {
        lines.splice(1, 0, { account_id: vatAcc, debit: vat, credit: 0 });
      }
      await journalService.postEntry(client, {
        description: `Credit Note ${cn.credit_note_number} (Invoice ${cn.invoice_number})`,
        referenceType: "credit_note",
        referenceId: creditNoteId,
        postedBy: user.user_id,
        lines,
      });
    } else {
      logger.warn(
        `[invoicing] credit note ${cn.credit_note_number} issued without ` +
          `journal — missing COA accounts`,
      );
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "invoicing",
      action: "edit",
      table: "credit_notes",
      recordId: creditNoteId,
      before: { status: "draft" },
      after: { status: "issued" },
    });

    return updated;
  });
}

async function setCreditNoteApplied(business, creditNoteId, status, user) {
  // Transition an issued credit note to 'applied' (offset against a
  // future invoice) or 'refunded' (cash returned to the customer).
  if (!["applied", "refunded"].includes(status)) {
    throw Object.assign(new Error("status must be 'applied' or 'refunded'"), {
      status: 400,
    });
  }
  return withBusinessContext(business, async (client) => {
    const cn = await repo.findCreditNoteById(client, creditNoteId);
    if (!cn) {
      throw Object.assign(new Error("Credit note not found"), { status: 404 });
    }
    if (cn.status !== "issued") {
      throw Object.assign(
        new Error(
          `Only an issued credit note can be ${status} (currently ${cn.status})`,
        ),
        { status: 400 },
      );
    }
    const updated = await repo.setCreditNoteStatus(
      client,
      creditNoteId,
      status,
    );
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "invoicing",
      action: "edit",
      table: "credit_notes",
      recordId: creditNoteId,
      before: { status: "issued" },
      after: { status },
    });
    return updated;
  });
}

async function getKpis(business) {
  return withBusinessContext(business, async (client) => {
    const {
      rows: [kpis],
    } = await client.query(
      `SELECT
         COALESCE(SUM(amount_outstanding) FILTER (
           WHERE status NOT IN ('paid','voided') AND is_deleted = false
         ), 0) AS total_outstanding,

         COALESCE(SUM(amount_outstanding) FILTER (
           WHERE status = 'overdue' AND is_deleted = false
         ), 0) AS total_overdue,

         (SELECT COALESCE(SUM(ip.amount), 0)
          FROM invoice_payments ip
          JOIN invoices i ON i.invoice_id = ip.invoice_id
          WHERE ip.is_confirmed = true
            AND date_trunc('month', ip.created_at) = date_trunc('month', now())
            AND i.is_deleted = false
         ) AS collected_this_month,

         COALESCE(SUM(amount_outstanding) FILTER (
           WHERE status NOT IN ('paid','voided')
             AND due_date >= CURRENT_DATE
             AND is_deleted = false
         ), 0) AS bucket_current,

         COALESCE(SUM(amount_outstanding) FILTER (
           WHERE status NOT IN ('paid','voided')
             AND due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1
             AND is_deleted = false
         ), 0) AS bucket_1_30,

         COALESCE(SUM(amount_outstanding) FILTER (
           WHERE status NOT IN ('paid','voided')
             AND due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31
             AND is_deleted = false
         ), 0) AS bucket_31_60,

         COALESCE(SUM(amount_outstanding) FILTER (
           WHERE status NOT IN ('paid','voided')
             AND due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61
             AND is_deleted = false
         ), 0) AS bucket_61_90,

         COALESCE(SUM(amount_outstanding) FILTER (
           WHERE status NOT IN ('paid','voided')
             AND due_date < CURRENT_DATE - 90
             AND is_deleted = false
         ), 0) AS bucket_90_plus

       FROM invoices`,
    );
    return kpis;
  });
}

async function writeOff(business, invoiceId, { reason }, user) {
  return withBusinessContext(business, async (client) => {
    const inv = await repo.findById(client, invoiceId);
    if (!inv)
      throw Object.assign(new Error("Invoice not found"), { status: 404 });
    if (["paid", "voided"].includes(inv.status))
      throw Object.assign(
        new Error(`Cannot write off a ${inv.status} invoice`),
        { status: 400 },
      );

    const outstanding = parseFloat(inv.amount_outstanding || 0);
    if (outstanding <= 0)
      throw Object.assign(new Error("No outstanding balance to write off"), {
        status: 400,
      });

    // Void the invoice
    await repo.setVoided(client, invoiceId);

    // Post bad debt journal:
    //   DR Bad Debt Expense (6000)  outstanding
    //   CR Accounts Receivable (1310)  outstanding
    const badDebtAcc = await journalService.getAccountId(client, "6000");
    const arAcc = await journalService.getAccountId(client, "1310");

    if (badDebtAcc && arAcc) {
      await journalService.postEntry(client, {
        description: `Write-off Invoice ${inv.invoice_number} — ${reason}`,
        referenceType: "invoice_write_off",
        referenceId: invoiceId,
        postedBy: user.user_id,
        lines: [
          { account_id: badDebtAcc, debit: outstanding, credit: 0 },
          { account_id: arAcc, debit: 0, credit: outstanding },
        ],
      });
    } else {
      logger.warn(
        `[invoicing] write-off journal skipped for ${inv.invoice_number}: ` +
          `missing COA 6000 (bad debt) or 1310 (AR)`,
      );
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "manager",
      business,
      module: "invoicing",
      action: "write_off",
      table: "invoices",
      recordId: invoiceId,
      before: { status: inv.status, amount_outstanding: outstanding },
      after: { status: "voided", reason },
      metadata: { sensitive: true, reason },
    });

    return {
      invoice_id: invoiceId,
      status: "voided",
      amount_written_off: outstanding,
    };
  });
}

module.exports = {
  list,
  getById,
  create,
  recordPayment,
  send,
  voidInvoice,
  generatePDF,
  getKpis,
  writeOff,
  // credit notes
  listCreditNotes,
  getCreditNote,
  createCreditNote,
  issueCreditNote,
  setCreditNoteApplied,
};
