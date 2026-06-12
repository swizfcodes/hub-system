"use strict";

const config = require("../../config/config");

const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const { getVatRate } = require("../../config/businesses");
const { renderToPDF } = require("../../lib/pdf/generator");
const { sendEmail } = require("../../lib/email/sender");
const { renderEmail } = require("../../lib/email/render");
// EXTERNAL-COMMS-DISABLED: WhatsApp adapter needs Meta API access.
// const whatsapp = require("../../integrations/messaging/adapters/whatsapp");
const auditService = require("../../shared/audit/audit.service");
const crmService = require("../crm/crm.service");
const movementsService = require("../stock/movements.service");
const stockService = require("../stock/stock.service");
const journalService = require("../accounting/journal.service");
const loyaltyService = require("../loyalty/loyalty.service");
const invoicingSvc = require("../invoicing/invoicing.service");
const { getRate } = require("../../lib/currency/converter");
const { emitToBusiness } = require("../../config/sockets");
const logger = require("../../config/logger");
const repo = require("./sales.repository");

// ─── Quotations ──────────────────────────────────────────────────────────────

async function listQuotations(
  business,
  { page = 1, limit = 50, status, contactId, contact_id, deal_id } = {},
  user,
  scope,
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.listQuotations(client, {
      status,
      contactId: contactId || contact_id || null,
      dealId: deal_id || null,
      scope,
      userId: user.user_id,
      limit: parseInt(limit),
      offset,
    });
    return { data: rows };
  });
}

async function createQuotation(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const quoteNumber = await nextDocumentNumber(client, business, "quotation");
    let subtotal = 0,
      discountTotal = 0,
      vatTotal = 0;
    const vatRate = data.apply_vat === false ? 0 : getVatRate(business);
    for (const l of data.lines) {
      const lt = l.unit_price * l.quantity;
      const disc = l.discount_amount || (lt * (l.discount_pct || 0)) / 100;
      const net = lt - disc;
      subtotal += net;
      discountTotal += disc;
      vatTotal += net * vatRate;
    }
    const q = await repo.insertQuotation(client, {
      quoteNumber,
      contact_id: data.contact_id,
      deal_id: data.deal_id,
      assigned_to: data.assigned_to || user.user_id,
      valid_until: data.valid_until,
      subtotal,
      discountTotal,
      vatTotal,
      total: subtotal + vatTotal,
      payment_terms: data.payment_terms,
      notes: data.notes,
      terms_conditions: data.terms_conditions,
      userId: user.user_id,
    });
    for (let i = 0; i < data.lines.length; i++) {
      const l = data.lines[i];
      const lt = l.unit_price * l.quantity;
      const disc = l.discount_amount || (lt * (l.discount_pct || 0)) / 100;
      await repo.insertQuotationLine(client, {
        quotation_id: q.quotation_id,
        product_id: l.product_id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_pct: l.discount_pct,
        disc,
        lineTotal: lt - disc,
        order: i,
      });
    }
    // M10 fix: audit log on quotation creation
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "sales",
      action: "create",
      table: "quotations",
      recordId: q.quotation_id,
      after: q,
    });
    if (data.deal_id) {
      await crmService.logActivity(
        business,
        data.deal_id,
        {
          activity_type: "quotation_sent",
          summary: `Quotation ${quoteNumber} created`,
          is_auto: true,
        },
        user,
        client,
      );
    }
    return q;
  });
}

async function getQuotation(business, quotationId) {
  return withBusinessContext(business, async (client) => {
    const q = await repo.findQuotationById(client, quotationId);
    if (!q)
      throw Object.assign(new Error("Quotation not found"), { status: 404 });
    return q;
  });
}

async function updateQuotation(business, quotationId, data, user) {
  return withBusinessContext(business, async (client) => {
    const q = await repo.getQuotationStatus(client, quotationId);
    if (!q) throw Object.assign(new Error("Not found"), { status: 404 });
    if (!["draft"].includes(q.status))
      throw Object.assign(new Error("Only draft quotations can be edited"), {
        status: 400,
      });
    const allowed = [
      "valid_until",
      "payment_terms",
      "notes",
      "terms_conditions",
    ];
    const sets = [],
      vals = [];
    for (const f of allowed) {
      if (data[f] !== undefined) {
        vals.push(data[f]);
        sets.push(`${f} = $${vals.length}`);
      }
    }
    if (!sets.length) return q;
    vals.push(quotationId);
    return repo.updateQuotation(client, quotationId, sets, vals);
  });
}

async function sendQuotation(
  business,
  quotationId,
  { channel = "email" },
  user,
) {
  // H5 fix: single atomic transaction — fetch, validate, send, and update status together
  return withBusinessContext(business, async (client) => {
    const q = await repo.findQuotationById(client, quotationId);
    if (!q)
      throw Object.assign(new Error("Quotation not found"), { status: 404 });

    if (channel === "email" && !q.email)
      throw Object.assign(new Error("Contact has no email address on file"), {
        status: 400,
      });
    // EXTERNAL-COMMS-DISABLED: WhatsApp sending requires Meta API access.
    // Re-enable the whatsapp branch below (and the adapter require at the
    // top of this file) once credentials are available.
    if (channel === "whatsapp")
      throw Object.assign(
        new Error("WhatsApp sending is temporarily disabled — use email"),
        { status: 400 },
      );
    if (channel !== "email")
      throw Object.assign(new Error(`Unsupported channel: ${channel}`), {
        status: 400,
      });

    // Mark as sent BEFORE delivering so a send failure rolls back the status change
    await repo.setQuotationSent(client, quotationId);

    const pdf = await generateQuotationPDF(business, quotationId);

    if (channel === "email") {
      const { subject: subj, html: body } = renderEmail("quotation", business, {
        quotation_number: q.quotation_number,
        contact_name: q.contact_name,
        valid_until: q.valid_until,
      });
      await sendEmail({
        to: q.email,
        subject: subj,
        html: body,
        business,
        attachments: [
          {
            filename: `${q.quotation_number}.pdf`,
            content: pdf,
            contentType: "application/pdf",
          },
        ],
      });
    }
    // EXTERNAL-COMMS-DISABLED: WhatsApp delivery path.
    // else {
    //   await whatsapp.sendMessage({
    //     to: q.whatsapp_number,
    //     text: `Dear ${q.contact_name}, your quotation ${q.quotation_number} for ₦${Number(q.total_amount).toLocaleString()} is valid until ${q.valid_until}.`,
    //   });
    // }

    return { message: "Quotation sent" };
  });
}

async function confirmQuotation(business, quotationId, user) {
  return withBusinessContext(business, async (client) => {
    const q = await getQuotation(business, quotationId);
    if (!["sent", "viewed", "draft"].includes(q.status))
      throw Object.assign(new Error("Quotation cannot be confirmed"), {
        status: 400,
      });
    const orderNumber = await nextDocumentNumber(
      client,
      business,
      "sales_order",
    );
    const order = await repo.insertOrder(client, {
      orderNumber,
      quotationId,
      contact_id: q.contact_id,
      deal_id: q.deal_id,
      fulfilment_type: q.fulfilment_type || "walk_in",
      total_amount: q.total_amount,
      userId: user.user_id,
    });
    await repo.copyQuotationLinesToOrder(client, {
      orderId: order.order_id,
      quotationId,
    });
    await repo.setQuotationConfirmed(client, quotationId);
    const lines = await repo.getOrderProductLines(client, order.order_id);
    for (const l of lines) {
      try {
        await movementsService.createReservation(client, {
          business,
          productId: l.product_id,
          quantity: l.quantity,
          reservedFor: q.contact_id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          notes: `Reserved for order ${orderNumber}`,
          userId: user.user_id,
        });
      } catch (err) {
        throw Object.assign(
          new Error(`Cannot confirm — insufficient stock: ${err.message}`),
          { status: err.status || 409 },
        );
      }
    }
    if (q.deal_id) {
      await crmService.moveDealStage(business, q.deal_id, null, user, client);
      await crmService.logActivity(
        business,
        q.deal_id,
        {
          activity_type: "order_confirmed",
          summary: `Order ${orderNumber} created from ${q.quotation_number}`,
          is_auto: true,
        },
        user,
        client,
      );
    }
    return order;
  });
}

async function cancelQuotation(business, quotationId, user) {
  return withBusinessContext(business, async (client) => {
    const q = await repo.getQuotationStatus(client, quotationId);
    if (!q) throw Object.assign(new Error("Not found"), { status: 404 });
    if (["confirmed", "cancelled"].includes(q.status))
      throw Object.assign(
        new Error("Cannot cancel a confirmed or already-cancelled quotation"),
        { status: 400 },
      );
    return repo.setQuotationCancelled(client, quotationId);
  });
}

async function generateQuotationPDF(business, quotationId) {
  const q = await getQuotation(business, quotationId);

  const currency = q.currency || "NGN";
  const fmtAmt = (n) =>
    `${currency} ${Number(n || 0).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const fmtDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "—";
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const lines = Array.isArray(q.lines) ? q.lines.filter(Boolean) : [];
  const linesHtml = lines
    .map(
      (l, i) => `
    <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
      <td class="c-num">${i + 1}</td>
      <td class="c-desc">${esc(l.description)}</td>
      <td class="c-qty">${l.quantity}</td>
      <td class="c-price">${fmtAmt(l.unit_price)}</td>
      <td class="c-disc">${l.discount_pct > 0 ? l.discount_pct + "%" : "—"}</td>
      <td class="c-total">${fmtAmt(l.line_total)}</td>
    </tr>`,
    )
    .join("");

  const showDiscount = Number(q.discount_total) > 0;

  const templateData = {
    quotation_number: q.quotation_number,
    status: (q.status || "draft").toUpperCase(),
    issue_date: fmtDate(q.created_at),
    valid_until: fmtDate(q.valid_until),
    contact_name: esc(q.contact_name || "—"),
    email: esc(q.email || "—"),
    primary_phone: esc(q.primary_phone || "—"),
    payment_terms: esc(q.payment_terms || "—"),
    notes: esc(q.notes || ""),
    terms_conditions: esc(q.terms_conditions || ""),
    lines_html: linesHtml,
    subtotal: fmtAmt(q.subtotal),
    discount_total: fmtAmt(q.discount_total),
    vat_amount: fmtAmt(q.vat_amount),
    total_amount: fmtAmt(q.total_amount),
    // Conditional visibility helpers
    discount_row_style: showDiscount ? "" : "display:none",
    notes_section_style: q.notes ? "" : "display:none",
    terms_section_style: q.terms_conditions ? "" : "display:none",
  };

  return renderToPDF("quotations", templateData);
}

// ─── Sales KPIs ───────────────────────────────────────────────────────────────

async function getSalesKpis(business) {
  return withBusinessContext(business, async (client) => {
    return repo.getSalesKpis(client);
  });
}

// ─── Direct Order (Quick Sale) ────────────────────────────────────────────────

/**
 * Creates a sales order directly — no quotation required.
 * Handles: split payments, multi-currency, optional VAT toggle,
 * pickup/delivery, discount with min-price hard floor, stock deduction,
 * accounting journals, auto-invoice, loyalty points.
 *
 * Modelled after POS createTransaction but for the Sales module.
 */
async function createDirectOrder(business, data, user) {
  // ── Validate up front ──────────────────────────────────────────────
  if (!data.contact_id) {
    throw Object.assign(new Error("contact_id is required"), { status: 400 });
  }
  if (!Array.isArray(data.lines) || data.lines.length === 0) {
    throw Object.assign(new Error("At least one line item is required"), { status: 400 });
  }
  if (!Array.isArray(data.payments) || data.payments.length === 0) {
    throw Object.assign(new Error("At least one payment is required"), { status: 400 });
  }

  // Normalise: frontend sends "method", backend uses "payment_method"
  for (const p of data.payments) {
    if (p.method && !p.payment_method) p.payment_method = p.method;
  }

  // ── Currency handling ──────────────────────────────────────────────
  const currency = data.currency || "NGN";
  let exchangeRate = 1;
  if (currency !== "NGN") {
    if (data.exchange_rate && data.exchange_rate > 0) {
      // Manual override (e.g. negotiated rate)
      exchangeRate = parseFloat(data.exchange_rate);
    } else {
      // Auto-fetch from stored rates
      const stored = await getRate(currency, "NGN");
      if (!stored) {
        throw Object.assign(
          new Error(`No exchange rate found for ${currency}. Sync rates first.`),
          { status: 400 },
        );
      }
      exchangeRate = parseFloat(stored.rate);
    }
  }

  const result = await withBusinessContext(business, async (client) => {
    // ── Validate lines & min-price floor ─────────────────────────────
    for (const line of data.lines) {
      // Coerce string numerics (pg driver returns NUMERIC as strings)
      line.quantity = Number(line.quantity);
      line.unit_price = Number(line.unit_price);
      line.discount_amount = Number(line.discount_amount || 0);

      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw Object.assign(
          new Error(`Invalid quantity for ${line.description || line.product_id}`),
          { status: 400 },
        );
      }
      if (!Number.isFinite(line.unit_price) || line.unit_price < 0) {
        throw Object.assign(
          new Error(`Invalid price for ${line.description || line.product_id}`),
          { status: 400 },
        );
      }
      if (line.product_id) {
        const { rows: [prod] } = await client.query(
          `SELECT min_selling_price, name AS product_name FROM products WHERE product_id = $1`,
          [line.product_id],
        );
        if (!prod) {
          throw Object.assign(new Error(`Product not found: ${line.product_id}`), { status: 400 });
        }
        // Hard floor — never below minimum price. No approval, just blocked.
        if (
          prod.min_selling_price &&
          parseFloat(line.unit_price) < parseFloat(prod.min_selling_price)
        ) {
          throw Object.assign(
            new Error(
              `Price ₦${line.unit_price} is below minimum ₦${prod.min_selling_price} for "${prod.product_name}". Cannot proceed.`,
            ),
            { status: 400 },
          );
        }
      }
    }

    // ── Calculate totals ─────────────────────────────────────────────
    // VAT: applied only if toggled on by the user
    const vatRate = data.apply_vat ? getVatRate(business) : 0;

    let subtotal = 0;
    let discountTotal = 0;
    let vatTotal = 0;

    for (const l of data.lines) {
      const lineGross = l.unit_price * l.quantity;
      const disc = l.discount_amount || 0;
      const net = Math.round((lineGross - disc) * 100) / 100;
      discountTotal = Math.round((discountTotal + disc) * 100) / 100;
      subtotal = Math.round((subtotal + net) * 100) / 100;
      vatTotal = Math.round((vatTotal + Math.round(net * vatRate * 100) / 100) * 100) / 100;
    }

    const totalAmount = Math.round((subtotal + vatTotal) * 100) / 100;

    // Catalogue prices and payment amounts are always in NGN.
    // Foreign currency selection is informational — records that the customer
    // paid in FC, with amount_foreign = totalAmount / exchangeRate.
    const totalPaid = Math.round(
      data.payments.reduce((s, p) => s + parseFloat(p.amount), 0) * 100,
    ) / 100;
    if (totalPaid < totalAmount) {
      throw Object.assign(
        new Error(
          `Payments (${totalPaid}) do not cover total (${totalAmount}). Short by ${(totalAmount - totalPaid).toFixed(2)}.`,
        ),
        { status: 400 },
      );
    }

    // Everything is already in NGN — no conversion needed
    const totalAmountNGN = totalAmount;
    const subtotalNGN = subtotal;
    const vatTotalNGN = vatTotal;

    // ── Resolve default stock location for outbound movements ──────
    const { rows: [defaultLoc] } = await client.query(
      `SELECT location_id FROM stock_locations
       WHERE is_active = true
       ORDER BY location_type = 'warehouse' DESC, created_at ASC
       LIMIT 1`,
    );
    const defaultLocationId = defaultLoc?.location_id || null;

    // ── Create order ─────────────────────────────────────────────────
    const orderNumber = await nextDocumentNumber(client, business, "sales_order");
    const fulfilmentType = data.fulfilment_type || "walk_in";

    const { rows: [order] } = await client.query(
      `INSERT INTO sales_orders
         (order_number, contact_id, status, fulfilment_type,
          source, currency, exchange_rate, amount_foreign,
          subtotal, discount_total, vat_amount,
          total_amount, amount_paid,
          delivery_address, courier_preference, created_by)
       VALUES ($1, $2, 'confirmed', $3,
               'direct', $4, $5, $6,
               $7, $8, $9,
               $10, $11,
               $12, $13, $14)
       RETURNING *`,
      [
        orderNumber,
        data.contact_id,
        fulfilmentType,
        currency,
        exchangeRate,
        currency !== "NGN" ? Math.round(totalAmount / exchangeRate * 100) / 100 : null,
        subtotalNGN,
        discountTotal,
        vatTotalNGN,
        totalAmountNGN,
        totalAmountNGN, // fully paid at creation
        data.delivery_address || null,
        data.courier_preference || null,
        user.user_id,
      ],
    );

    // ── Insert order lines ───────────────────────────────────────────
    for (let i = 0; i < data.lines.length; i++) {
      const l = data.lines[i];
      const lineGross = l.unit_price * l.quantity;
      const disc = l.discount_amount || 0;
      const net = lineGross - disc;

      await client.query(
        `INSERT INTO order_lines
           (order_id, product_id, description, quantity, unit_price, line_total, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'fulfilled')`,
        [
          order.order_id,
          l.product_id || null,
          l.description,
          l.quantity,
          l.unit_price,
          net,
        ],
      );

      // ── Stock deduction ────────────────────────────────────────────
      if (l.product_id) {
        await stockService.recordMovement(client, {
          business,
          productId: l.product_id,
          movementType: "sold",
          quantity: l.quantity,
          direction: -1,
          fromLocationId: defaultLocationId,
          referenceType: "sales_order",
          referenceId: order.order_id,
          performedBy: user.user_id,
        });
      }
    }

    // ── Revenue journal (DR Cash/Bank, CR Sales Revenue + VAT) ───────
    const paymentMethodToCOA = (method) => {
      switch (method) {
        case "cash": return "1100";
        case "bank_transfer": return "1210";
        case "pos_card": return "1210";
        case "paystack": return "1210";
        default: return "1310";
      }
    };

    const debitsByAccount = new Map();
    for (const p of data.payments) {
      const code = paymentMethodToCOA(p.payment_method);
      const accId = await journalService.getAccountId(client, code);
      if (!accId) continue;
      // Payments are already in NGN — no conversion needed
      const amt = parseFloat(p.amount);
      debitsByAccount.set(accId, (debitsByAccount.get(accId) || 0) + amt);
    }

    const revAcc = await journalService.getAccountId(client, "4100");
    const vatAcc = await journalService.getAccountId(client, "2210");

    if (!revAcc) {
      throw Object.assign(
        new Error("COA account 4100 (Sales Revenue) not found. Contact administrator."),
        { status: 500 },
      );
    }

    const journalLines = [];
    for (const [accId, amount] of debitsByAccount.entries()) {
      if (amount > 0) journalLines.push({ account_id: accId, debit: parseFloat(amount.toFixed(2)), credit: 0 });
    }
    journalLines.push({ account_id: revAcc, debit: 0, credit: subtotalNGN });
    if (vatAcc && vatTotalNGN > 0) {
      journalLines.push({ account_id: vatAcc, debit: 0, credit: vatTotalNGN });
    }

    await journalService.postEntry(client, {
      description: `Direct Sale ${orderNumber}`,
      referenceType: "sales_order",
      referenceId: order.order_id,
      postedBy: user.user_id,
      lines: journalLines,
    });

    // ── COGS journal (DR COGS, CR Inventory) ─────────────────────────
    const costableLines = data.lines.filter((l) => l.product_id);
    if (costableLines.length > 0) {
      const { total_cost } = await stockService.calculateSaleCOGS(
        client,
        costableLines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
      );

      if (total_cost && total_cost > 0) {
        const cogsAcc = await journalService.getAccountId(client, "5000");
        const inventoryAcc = await journalService.getAccountId(client, "1410");
        if (cogsAcc && inventoryAcc) {
          await journalService.postEntry(client, {
            description: `COGS for Direct Sale ${orderNumber}`,
            referenceType: "sales_order_cogs",
            referenceId: order.order_id,
            postedBy: user.user_id,
            lines: [
              { account_id: cogsAcc, debit: total_cost, credit: 0 },
              { account_id: inventoryAcc, debit: 0, credit: total_cost },
            ],
          });
        }
      }
    }

    // ── Auto-create invoice ──────────────────────────────────────────
    const invoiceNumber = await nextDocumentNumber(client, business, "invoice");
    const { rows: [invoice] } = await client.query(
      `INSERT INTO invoices
         (invoice_number, contact_id, order_id, status,
          issue_date, due_date,
          subtotal, discount_total, vat_amount, total_amount, amount_paid,
          currency, created_by)
       VALUES ($1, $2, $3, 'paid',
               CURRENT_DATE, CURRENT_DATE,
               $4, $5, $6, $7, $8,
               'NGN', $9)
       RETURNING *`,
      [
        invoiceNumber,
        data.contact_id,
        order.order_id,
        subtotalNGN,
        discountTotal,
        vatTotalNGN,
        totalAmountNGN,
        totalAmountNGN,
        user.user_id,
      ],
    );

    // Copy lines to invoice_lines
    await client.query(
      `INSERT INTO invoice_lines
         (invoice_id, product_id, description, quantity, unit_price,
          discount_amount, vat_rate, vat_amount, line_total, display_order)
       SELECT $1, product_id, description, quantity, unit_price,
              0, $2, 0, line_total, ROW_NUMBER() OVER (ORDER BY line_id)
       FROM order_lines WHERE order_id = $3`,
      [invoice.invoice_id, vatRate, order.order_id],
    );

    // ── Record payment splits on the invoice ─────────────────────────
    for (const p of data.payments) {
      await client.query(
        `INSERT INTO invoice_payments
           (invoice_id, payment_date, amount, payment_method, reference,
            is_confirmed, recorded_by, notes)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, true, $5, $6)`,
        [
          invoice.invoice_id,
          parseFloat(p.amount),
          p.payment_method,
          p.reference || null,
          user.user_id,
          currency !== "NGN" ? `${currency} @ ${exchangeRate}` : null,
        ],
      );
    }

    // ── Audit log ────────────────────────────────────────────────────
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "sales",
      action: "create",
      table: "sales_orders",
      recordId: order.order_id,
      after: { ...order, source: "direct", invoice_id: invoice.invoice_id },
    });

    emitToBusiness(business, "sales:order_created", {
      orderId: order.order_id,
      orderNumber,
      source: "direct",
    });

    return {
      ...order,
      invoice_id: invoice.invoice_id,
      invoice_number: invoiceNumber,
      currency,
      exchange_rate: exchangeRate,
    };
  });

  // ── Loyalty points (outside transaction — non-fatal) ───────────────
  try {
    const totalForLoyalty = parseFloat(result.total_amount);
    await loyaltyService.awardPoints(
      business,
      data.contact_id,
      totalForLoyalty,
      "sales_order",
      result.order_id,
      user,
    );
  } catch (err) {
    logger.error(
      `[loyalty] award failed for direct order ${result.order_id}: ${err.message}`,
    );
  }

  // ── Auto-push delivery to logistics ────────────────────────────────
  if (data.fulfilment_type === "delivery" && data.delivery_address) {
    try {
      const logisticsService = require("../logistics/logistics.service");
      await logisticsService.createDelivery(
        business,
        {
          reference_type: "sales_order",
          reference_id: result.order_id,
          contact_id: data.contact_id,
          delivery_address: data.delivery_address,
          courier: data.courier_preference || "manual",
          delivery_fee: data.delivery_fee || 0,
        },
        user,
      );
    } catch (err) {
      logger.error(`[logistics] auto-create delivery failed for order ${result.order_id}: ${err.message}`);
    }
  }

  // ── Auto-send receipt by email ─────────────────────────────────────
  // The receipt template renders a full itemised receipt: line items,
  // subtotal, VAT, total, and payment methods. Read the totals back
  // from the invoice we just created (the recorded figures, not a
  // recomputation) so the email always matches the books.
  let receiptSent = false;
  try {
    const { rows: [contact] } = await require("../../config/db").pool.query(
      `SELECT email, display_name FROM shared.contacts WHERE contact_id = $1`,
      [data.contact_id],
    );
    if (contact?.email) {
      const { invoice, lines } = await withBusinessContext(business, async (client) => {
        const { rows: [inv] } = await client.query(
          `SELECT subtotal, discount_total, vat_amount, total_amount
             FROM invoices WHERE invoice_id = $1`,
          [result.invoice_id],
        );
        const { rows: invLines } = await client.query(
          `SELECT description, quantity, unit_price, line_total
             FROM invoice_lines WHERE invoice_id = $1
            ORDER BY display_order`,
          [result.invoice_id],
        );
        return { invoice: inv, lines: invLines };
      });

      const paymentMethods = (data.payments || [])
        .map((p) => paymentMethodLabel(p.payment_method))
        .filter(Boolean)
        .filter((label, i, all) => all.indexOf(label) === i)
        .join(" • ");

      const { subject, html } = renderEmail("receipt", business, {
        contact_name: contact.display_name,
        transaction_number: result.order_number,
        transaction_date: new Date().toLocaleString("en-NG", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        lines,
        subtotal: invoice?.subtotal,
        discount_total: invoice?.discount_total,
        vat_amount: invoice?.vat_amount,
        total_amount: invoice?.total_amount ?? result.total_amount,
        payment_methods: paymentMethods,
        invoice_number: result.invoice_number,
      });
      await sendEmail({
        to: contact.email,
        subject,
        html,
        business,
      });
      receiptSent = true;
    }
  } catch (err) {
    logger.error(`[sales] receipt email failed for order ${result.order_id}: ${err.message}`);
  }

  return { ...result, receipt_sent: receiptSent };
}

/** Human label for a payment method code, e.g. "bank_transfer" → "Bank Transfer". */
function paymentMethodLabel(method) {
  return (
    {
      cash: "Cash",
      bank_transfer: "Bank Transfer",
      pos_card: "POS Card",
      mobile_money: "Mobile Money",
      paystack: "Paystack",
      loyalty_redemption: "Loyalty",
      credit: "Credit",
    }[method] ||
    String(method || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// ─── Orders ───────────────────────────────────────────────────────────────────

async function listOrders(
  business,
  { page = 1, limit = 50, status, source, fulfilment_type } = {},
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.listOrders(client, {
      status,
      source: source || null,
      fulfilment_type: fulfilment_type || null,
      limit: parseInt(limit),
      offset,
    });
    return { data: rows };
  });
}

async function getOrder(business, orderId) {
  return withBusinessContext(business, async (client) => {
    const order = await repo.findOrderById(client, orderId);
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });
    return order;
  });
}

async function generateInvoiceFromOrder(
  business,
  orderId,
  { due_date, payment_instructions },
  user,
) {
  return withBusinessContext(business, async (client) => {
    const order = await repo.findOrderById(client, orderId);
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });
    if (!["confirmed", "partially_fulfilled"].includes(order.status))
      throw Object.assign(
        new Error("Order must be confirmed before generating invoice"),
        { status: 400 },
      );
    const existingInvoice = await repo.findInvoiceByOrderId(client, orderId);
    if (existingInvoice)
      throw Object.assign(new Error("Invoice already exists for this order"), {
        status: 409,
      });

    const invoiceNumber = await nextDocumentNumber(client, business, "invoice");
    // C4 fix: carry VAT and discount from the order instead of hardcoding 0
    const orderSubtotal = parseFloat(order.subtotal || order.total_amount);
    const orderDiscount = parseFloat(order.discount_total || 0);
    const orderVat = parseFloat(order.vat_amount || 0);
    const invoiceTotal = Math.round((orderSubtotal - orderDiscount + orderVat) * 100) / 100;

    const invoice = await repo.insertInvoice(client, {
      invoiceNumber,
      order_id: orderId,
      contact_id: order.contact_id,
      deal_id: order.deal_id,
      issue_date: new Date().toISOString().split("T")[0],
      due_date,
      subtotal: orderSubtotal,
      discount_total: orderDiscount,
      vat_amount: orderVat,
      total_amount: invoiceTotal,
      currency: order.currency || "NGN",
      payment_instructions,
      userId: user.user_id,
    });
    await repo.copyOrderLinesToInvoice(client, {
      invoiceId: invoice.invoice_id,
      orderId,
    });

    // Generate Paystack payment link (fire-and-forget — link is optional).
    // The invoice is still valid without it.
    try {
      const paystackService = require("../../integrations/paystack/paystack.service");
      const {
        rows: [contact],
      } = await client.query(
        `SELECT email FROM shared.contacts WHERE contact_id = $1`,
        [order.contact_id],
      );
      const email =
        contact?.email || config.smtp.fromEmail || "noreply@localhost";
      const { authorizationUrl, reference } =
        await paystackService.initializePayment({
          email,
          amount: order.total_amount,
          reference: invoiceNumber,
          callbackUrl: `${process.env.APP_URL || ""}/sales/invoices/${invoice.invoice_id}`,
          metadata: { invoice_id: invoice.invoice_id, business },
        });
      await repo.updateInvoicePaymentLinks(client, invoice.invoice_id, {
        paystack_payment_url: authorizationUrl,
        paystack_reference: reference,
      });
      invoice.paystack_payment_url = authorizationUrl;
      invoice.paystack_reference = reference;
    } catch (e) {
      require("../../config/logger").warn(
        `[sales] Paystack link failed for ${invoiceNumber}: ${e.message}`,
      );
    }

    // Fetch full order data (has contact_name and lines)
    const fullOrder = order; // already fetched above via repo.findOrderById
    const currency = invoice.currency || "NGN";
    const fmtAmt = (n) =>
      `${currency} ${Number(n || 0).toLocaleString("en-NG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    const fmtDate = (d) =>
      d
        ? new Date(d).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "—";
    const esc = (s) =>
      String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const orderLines = Array.isArray(fullOrder.lines)
      ? fullOrder.lines.filter(Boolean)
      : [];
    const linesHtml = orderLines
      .map(
        (l, i) => `
      <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
        <td class="c-num">${i + 1}</td>
        <td class="c-desc">${esc(l.description)}</td>
        <td class="c-qty">${Number(l.quantity || 0)}</td>
        <td class="c-price">${fmtAmt(l.unit_price)}</td>
        <td class="c-total">${fmtAmt(l.line_total)}</td>
      </tr>`,
      )
      .join("");

    const invoiceTemplateData = {
      invoice_number: esc(invoice.invoice_number),
      status: esc((invoice.status || "draft").toUpperCase()),
      issue_date: fmtDate(invoice.issue_date),
      due_date: fmtDate(invoice.due_date),
      contact_name: esc(fullOrder.contact_name || "—"),
      email: esc(fullOrder.email || "—"),
      primary_phone: esc(fullOrder.primary_phone || "—"),
      order_number: esc(fullOrder.order_number || "—"),
      payment_instructions: esc(invoice.payment_instructions || ""),
      paystack_payment_url: esc(invoice.paystack_payment_url || ""),
      lines_html: linesHtml,
      subtotal: fmtAmt(invoice.subtotal),
      vat_amount: fmtAmt(invoice.vat_amount),
      total_amount: fmtAmt(invoice.total_amount),
      // Conditional visibility
      payment_instructions_style: invoice.payment_instructions
        ? ""
        : "display:none",
      paystack_link_style: invoice.paystack_payment_url ? "" : "display:none",
    };

    const pdf = await renderToPDF("invoice", invoiceTemplateData);
    await repo.archiveDocument(client, {
      business,
      document_type: "invoice",
      reference_type: "invoice",
      reference_id: invoice.invoice_id,
      content: pdf,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "sales",
      action: "create",
      table: "invoices",
      recordId: invoice.invoice_id,
      after: invoice,
    });
    return invoice;
  });
}

async function handToLogistics(business, orderId, data, user) {
  const result = await withBusinessContext(business, async (client) => {
    const order = await repo.findOrderById(client, orderId);
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });
    const updated = await repo.setOrderDispatch(client, orderId, {
      delivery_address: data.delivery_address,
      delivery_notes: data.delivery_notes,
      courier_preference: data.courier_preference,
    });
    return { message: "Order handed to logistics", order: updated };
  });

  const logisticsService = require("../logistics/logistics.service");
  await logisticsService.createDelivery(
    business,
    {
      reference_type: "sales_order",
      reference_id: orderId,
      contact_id: result.order.contact_id,
      delivery_address: data.delivery_address,
      courier: data.courier_preference,
      delivery_fee: data.delivery_fee || 0,
    },
    user,
  );

  return result;
}

async function cancelOrder(business, orderId, user) {
  return withBusinessContext(business, async (client) => {
    const order = await repo.findOrderById(client, orderId);
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });
    if (order.status === "cancelled")
      throw Object.assign(new Error("Order already cancelled"), {
        status: 400,
      });
    return repo.setOrderCancelled(client, orderId, user.user_id);
  });
}

// ─── Receipts ─────────────────────────────────────────────────────────────────

async function listReceipts(
  business,
  { invoice_id, page = 1, limit = 50 } = {},
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.listReceipts(client, {
      invoice_id,
      limit: parseInt(limit),
      offset,
    });
    return { data: rows };
  });
}

async function getReceipt(business, receiptId) {
  return withBusinessContext(business, async (client) => {
    const r = await repo.findReceiptById(client, receiptId);
    if (!r)
      throw Object.assign(new Error("Receipt not found"), { status: 404 });
    return r;
  });
}

async function generateReceiptPDF(business, receiptId) {
  const r = await getReceipt(business, receiptId);

  const currency = r.currency || "NGN";
  const fmtAmt = (n) =>
    `${currency} ${Number(n || 0).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const fmtDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "—";
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const templateData = {
    receipt_number: esc(r.receipt_number || r.receipt_id || "—"),
    invoice_number: esc(r.invoice_number || "—"),
    contact_name: esc(r.contact_name || "—"),
    issued_at: fmtDate(r.issued_at),
    payment_method: esc(r.payment_method || "—"),
    amount: fmtAmt(r.amount),
    notes: esc(r.notes || ""),
    notes_style: r.notes ? "" : "display:none",
  };

  return renderToPDF("receipt", templateData);
}

// ─── Discount approvals ───────────────────────────────────────────────────────

async function listDiscountApprovals(business, { status, quotation_id } = {}) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.listDiscountApprovals(client, {
      status,
      quotation_id,
    });
    return { data: rows };
  });
}

async function approveDiscount(business, approvalId, { notes }, user) {
  return withBusinessContext(business, async (client) => {
    const row = await repo.setDiscountApprovalStatus(client, approvalId, {
      status: "approved",
      notes,
      reviewedBy: user.user_id,
    });
    if (!row)
      throw Object.assign(new Error("Approval not found"), { status: 404 });
    return row;
  });
}

async function rejectDiscount(business, approvalId, { notes }, user) {
  return withBusinessContext(business, async (client) => {
    const row = await repo.setDiscountApprovalStatus(client, approvalId, {
      status: "rejected",
      notes,
      reviewedBy: user.user_id,
    });
    if (!row)
      throw Object.assign(new Error("Approval not found"), { status: 404 });
    return row;
  });
}

// ─── Campaign Proof Approval (from unified Orders view) ──────────────────────

/**
 * Approve a campaign order's payment proof from the Sales → Orders list.
 * Finds the campaign_order linked to this sales_order (via hub_order_id)
 * and delegates to the campaign admin's confirmOrder function.
 */
async function approveCampaignProof(business, salesOrderId, user) {
  // Find the campaign_order linked to this sales_order
  const { pool } = require("../../config/db");
  const { rows } = await pool.query(
    `SELECT co.order_id AS campaign_order_id
     FROM ${business}.campaign_orders co
     WHERE co.hub_order_id = $1
       AND co.status = 'proof_submitted'
     LIMIT 1`,
    [salesOrderId],
  );

  if (!rows.length) {
    throw Object.assign(
      new Error("No pending campaign proof found for this order"),
      { status: 404 },
    );
  }

  // Delegate to the campaign admin service
  const campaignAdmin = require("../sales_campaigns/admin.service");
  return campaignAdmin.confirmOrder(business, rows[0].campaign_order_id, user);
}

module.exports = {
  listQuotations,
  createQuotation,
  getQuotation,
  updateQuotation,
  sendQuotation,
  confirmQuotation,
  cancelQuotation,
  generateQuotationPDF,
  getSalesKpis,
  createDirectOrder,
  listOrders,
  getOrder,
  generateInvoiceFromOrder,
  handToLogistics,
  cancelOrder,
  approveCampaignProof,
  listReceipts,
  getReceipt,
  generateReceiptPDF,
  listDiscountApprovals,
  approveDiscount,
  rejectDiscount,
};
