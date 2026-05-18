"use strict";

const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const { getVatRate } = require("../../config/businesses");
const { renderToPDF } = require("../../lib/pdf/generator");
const { sendEmail } = require("../../lib/email/sender");
const whatsapp = require("../../integrations/messaging/adapters/whatsapp");
const auditService = require("../../shared/audit/audit.service");
const crmService = require("../crm/crm.service");
const movementsService = require("../stock/movements.service");
const repo = require("./sales.repository");

async function listQuotations(
  business,
  { page = 1, limit = 50, status, contactId } = {},
  user,
  scope,
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.listQuotations(client, {
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

async function createQuotation(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const quoteNumber = await nextDocumentNumber(client, business, "quotation");

    let subtotal = 0,
      discountTotal = 0,
      vatTotal = 0;
    // VAT rate from business_config (cached) — not a hardcode, so a
    // FIRS rate change or a per-business override is picked up.
    const vatRate = getVatRate(business);
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

  // Guard BEFORE doing anything — if the contact has no address for
  // the requested channel, fail loudly. The old code let execution
  // fall through both branches, mark the quotation 'sent', and return
  // success while the customer received nothing.
  if (channel === "email" && !q.email) {
    throw Object.assign(new Error("Contact has no email address on file"), {
      status: 400,
    });
  }
  if (channel === "whatsapp" && !q.whatsapp_number) {
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
    await sendEmail({
      to: q.email,
      subject: `Quotation ${q.quotation_number}`,
      html: `<p>Dear ${q.contact_name}, please find attached your quotation ${q.quotation_number} valid until ${q.valid_until}.</p>`,
      attachments: [
        {
          filename: `${q.quotation_number}.pdf`,
          content: pdf,
          contentType: "application/pdf",
        },
      ],
    });
  } else if (channel === "whatsapp") {
    await whatsapp.sendMessage({
      to: q.whatsapp_number,
      text: `Dear ${q.contact_name}, your quotation ${q.quotation_number} for ₦${Number(q.total_amount).toLocaleString()} is valid until ${q.valid_until}.`,
    });
  }

  // Only mark sent AFTER the send actually succeeded — if sendEmail
  // or sendMessage threw, we never reach this line.
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
      fulfilment_type: q.fulfilment_type,
      total_amount: q.total_amount,
      userId: user.user_id,
    });
    await repo.copyQuotationLinesToOrder(client, {
      orderId: order.order_id,
      quotationId,
    });
    await repo.setQuotationConfirmed(client, quotationId);

    // Reserve stock for each line via movements.service.createReservation.
    // This replaces the previous direct INSERT in sales.repo.reserveStock,
    // which silently swallowed errors. The new path:
    //   - validates availability (throws 409 if short)
    //   - emits a socket event for real-time stock updates
    //   - audit-logs the reservation
    //
    // If any single line can't be reserved, the whole confirmation
    // is rolled back (withBusinessContext is transactional), and the
    // caller sees a clear error message naming the SKU that ran short.
    const lines = await repo.getOrderProductLines(client, order.order_id);
    for (const l of lines) {
      try {
        await movementsService.createReservation(client, {
          business,
          productId: l.product_id,
          quantity: l.quantity,
          reservedFor: q.contact_id,
          // Quotation→Order reservations get a 7-day expiry — same
          // window the old code used.
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          notes: `Reserved for order ${orderNumber} (quotation confirmation)`,
          userId: user.user_id,
        });
      } catch (err) {
        // Surface the product context so the error is actionable.
        // The transaction will roll back automatically.
        throw Object.assign(
          new Error(
            `Cannot confirm quotation — insufficient stock for line item: ${err.message}`,
          ),
          { status: err.status || 409 },
        );
      }
    }

    return order;
  });
}

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

async function generateQuotationPDF(business, quotationId) {
  const q = await getQuotation(business, quotationId);
  return renderToPDF("quotations", q);
}

module.exports = {
  listQuotations,
  createQuotation,
  getQuotation,
  updateQuotation,
  sendQuotation,
  confirmQuotation,
  listOrders,
  getOrder,
  generateQuotationPDF,
};
