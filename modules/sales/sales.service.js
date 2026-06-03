"use strict";

const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const { getVatRate } = require("../../config/businesses");
const { renderToPDF } = require("../../lib/pdf/generator");
const { sendEmail } = require("../../lib/email/sender");
const { renderEmail } = require("../../lib/email/render");
const whatsapp = require("../../integrations/messaging/adapters/whatsapp");
const auditService = require("../../shared/audit/audit.service");
const crmService = require("../crm/crm.service");
const movementsService = require("../stock/movements.service");
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
  const q = await getQuotation(business, quotationId);
  const pdf = await generateQuotationPDF(business, quotationId);
  if (channel === "email" && !q.email)
    throw Object.assign(new Error("Contact has no email address on file"), {
      status: 400,
    });
  if (channel === "whatsapp" && !q.whatsapp_number)
    throw Object.assign(new Error("Contact has no WhatsApp number on file"), {
      status: 400,
    });
  if (channel !== "email" && channel !== "whatsapp")
    throw Object.assign(new Error(`Unsupported channel: ${channel}`), {
      status: 400,
    });
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
  } else {
    await whatsapp.sendMessage({
      to: q.whatsapp_number,
      text: `Dear ${q.contact_name}, your quotation ${q.quotation_number} for ₦${Number(q.total_amount).toLocaleString()} is valid until ${q.valid_until}.`,
    });
  }
  await withBusinessContext(business, async (client) =>
    repo.setQuotationSent(client, quotationId),
  );
  return { message: "Quotation sent" };
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
    quotation_number:       q.quotation_number,
    status:                 (q.status || "draft").toUpperCase(),
    issue_date:             fmtDate(q.created_at),
    valid_until:            fmtDate(q.valid_until),
    contact_name:           esc(q.contact_name || "—"),
    email:                  esc(q.email || "—"),
    primary_phone:          esc(q.primary_phone || "—"),
    payment_terms:          esc(q.payment_terms || "—"),
    notes:                  esc(q.notes || ""),
    terms_conditions:       esc(q.terms_conditions || ""),
    lines_html:             linesHtml,
    subtotal:               fmtAmt(q.subtotal),
    discount_total:         fmtAmt(q.discount_total),
    vat_amount:             fmtAmt(q.vat_amount),
    total_amount:           fmtAmt(q.total_amount),
    // Conditional visibility helpers
    discount_row_style:     showDiscount ? "" : "display:none",
    notes_section_style:    q.notes ? "" : "display:none",
    terms_section_style:    q.terms_conditions ? "" : "display:none",
  };

  return renderToPDF("quotations", templateData);
}

// ─── Sales KPIs ───────────────────────────────────────────────────────────────

async function getSalesKpis(business) {
  return withBusinessContext(business, async (client) => {
    return repo.getSalesKpis(client);
  });
}

// ─── Orders ───────────────────────────────────────────────────────────────────

async function listOrders(business, { page = 1, limit = 50, status } = {}) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.listOrders(client, {
      status,
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
    const invoice = await repo.insertInvoice(client, {
      invoiceNumber,
      order_id: orderId,
      contact_id: order.contact_id,
      deal_id: order.deal_id,
      issue_date: new Date().toISOString().split("T")[0],
      due_date,
      subtotal: order.total_amount,
      discount_total: 0,
      vat_amount: 0,
      total_amount: order.total_amount,
      currency: "NGN",
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
      const email = contact?.email || "noreply@orikaliving.com";
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
      invoice_number:        esc(invoice.invoice_number),
      status:                esc((invoice.status || "draft").toUpperCase()),
      issue_date:            fmtDate(invoice.issue_date),
      due_date:              fmtDate(invoice.due_date),
      contact_name:          esc(fullOrder.contact_name || "—"),
      email:                 esc(fullOrder.email || "—"),
      primary_phone:         esc(fullOrder.primary_phone || "—"),
      order_number:          esc(fullOrder.order_number || "—"),
      payment_instructions:  esc(invoice.payment_instructions || ""),
      paystack_payment_url:  esc(invoice.paystack_payment_url || ""),
      lines_html:            linesHtml,
      subtotal:              fmtAmt(invoice.subtotal),
      vat_amount:            fmtAmt(invoice.vat_amount),
      total_amount:          fmtAmt(invoice.total_amount),
      // Conditional visibility
      payment_instructions_style: invoice.payment_instructions ? "" : "display:none",
      paystack_link_style:        invoice.paystack_payment_url ? "" : "display:none",
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
    receipt_number:   esc(r.receipt_number || r.receipt_id || "—"),
    invoice_number:   esc(r.invoice_number || "—"),
    contact_name:     esc(r.contact_name || "—"),
    issued_at:        fmtDate(r.issued_at),
    payment_method:   esc(r.payment_method || "—"),
    amount:           fmtAmt(r.amount),
    notes:            esc(r.notes || ""),
    notes_style:      r.notes ? "" : "display:none",
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
  listOrders,
  getOrder,
  generateInvoiceFromOrder,
  handToLogistics,
  cancelOrder,
  listReceipts,
  getReceipt,
  generateReceiptPDF,
  listDiscountApprovals,
  approveDiscount,
  rejectDiscount,
};
