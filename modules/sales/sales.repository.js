"use strict";

const storage = require("../../lib/storage");

// ─── Quotations ──────────────────────────────────────────────────────────────

async function listQuotations(
  client,
  { status, contactId, dealId, scope, userId, limit, offset },
) {
  const { rows } = await client.query(
    `SELECT q.quotation_id, q.quotation_number, q.status, q.valid_until,
            q.total_amount, q.created_at, q.deal_id,
            c.display_name AS contact_name
     FROM quotations q
     JOIN shared.contacts c ON c.contact_id = q.contact_id
     WHERE q.is_deleted = false
       AND ($1::TEXT IS NULL OR q.status = $1)
       AND ($2::UUID IS NULL OR q.contact_id = $2)
       AND ($3::UUID IS NULL OR q.deal_id = $3)
       AND ($4 = 'all' OR q.assigned_to = $5)
     ORDER BY q.created_at DESC LIMIT $6 OFFSET $7`,
    [
      status || null,
      contactId || null,
      dealId || null,
      scope,
      userId,
      limit,
      offset,
    ],
  );
  return rows;
}

async function insertQuotation(
  client,
  {
    quoteNumber,
    contact_id,
    deal_id,
    assigned_to,
    valid_until,
    subtotal,
    discountTotal,
    vatTotal,
    total,
    payment_terms,
    notes,
    terms_conditions,
    userId,
  },
) {
  const {
    rows: [q],
  } = await client.query(
    `INSERT INTO quotations
       (quotation_number, contact_id, deal_id, assigned_to, status,
        valid_until, subtotal, discount_total, vat_amount, total_amount,
        payment_terms, notes, terms_conditions, created_by)
     VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      quoteNumber,
      contact_id,
      deal_id || null,
      assigned_to,
      valid_until,
      subtotal,
      discountTotal,
      vatTotal,
      total,
      payment_terms || null,
      notes || null,
      terms_conditions || null,
      userId,
    ],
  );
  return q;
}

async function insertQuotationLine(
  client,
  {
    quotation_id,
    product_id,
    description,
    quantity,
    unit_price,
    discount_pct,
    disc,
    lineTotal,
    order,
  },
) {
  await client.query(
    `INSERT INTO quotation_lines
       (quotation_id, product_id, description, quantity, unit_price,
        discount_pct, discount_amount, line_total, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      quotation_id,
      product_id || null,
      description,
      quantity,
      unit_price,
      discount_pct || 0,
      disc,
      lineTotal,
      order,
    ],
  );
}

async function findQuotationById(client, quotationId) {
  const {
    rows: [q],
  } = await client.query(
    `SELECT q.*,
            c.display_name AS contact_name, c.email, c.whatsapp_number, c.primary_phone,
            json_agg(ql.* ORDER BY ql.display_order) AS lines
     FROM quotations q
     JOIN shared.contacts c ON c.contact_id = q.contact_id
     LEFT JOIN quotation_lines ql ON ql.quotation_id = q.quotation_id
     WHERE q.quotation_id = $1 AND q.is_deleted = false
     GROUP BY q.quotation_id, c.display_name, c.email, c.whatsapp_number, c.primary_phone`,
    [quotationId],
  );
  return q || null;
}

async function getQuotationStatus(client, quotationId) {
  const {
    rows: [q],
  } = await client.query(
    `SELECT status FROM quotations WHERE quotation_id = $1`,
    [quotationId],
  );
  return q || null;
}

async function updateQuotation(client, quotationId, sets, vals) {
  const {
    rows: [updated],
  } = await client.query(
    `UPDATE quotations SET ${sets.join(", ")}, updated_at = now()
     WHERE quotation_id = $${vals.length} RETURNING *`,
    vals,
  );
  return updated;
}

async function setQuotationSent(client, quotationId) {
  await client.query(
    `UPDATE quotations SET status='sent', sent_at=now()
     WHERE quotation_id=$1 AND status='draft'`,
    [quotationId],
  );
}

async function setQuotationConfirmed(client, quotationId) {
  await client.query(
    `UPDATE quotations SET status='confirmed', confirmed_at=now()
     WHERE quotation_id=$1`,
    [quotationId],
  );
}

async function setQuotationCancelled(client, quotationId) {
  const {
    rows: [q],
  } = await client.query(
    `UPDATE quotations SET status='cancelled', updated_at=now()
     WHERE quotation_id=$1 RETURNING *`,
    [quotationId],
  );
  return q;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

async function insertOrder(
  client,
  {
    orderNumber,
    quotationId,
    contact_id,
    deal_id,
    fulfilment_type,
    total_amount,
    userId,
  },
) {
  const {
    rows: [order],
  } = await client.query(
    `INSERT INTO sales_orders
       (order_number, quotation_id, contact_id, deal_id, status,
        fulfilment_type, total_amount, amount_paid, created_by)
     VALUES ($1,$2,$3,$4,'confirmed',$5,$6,0,$7) RETURNING *`,
    [
      orderNumber,
      quotationId,
      contact_id,
      deal_id || null,
      fulfilment_type || "walk_in",
      total_amount,
      userId,
    ],
  );
  return order;
}

async function copyQuotationLinesToOrder(client, { orderId, quotationId }) {
  await client.query(
    `INSERT INTO order_lines
       (order_id, product_id, description, quantity, unit_price, line_total, status)
     SELECT $1, product_id, description, quantity, unit_price, line_total, 'pending'
     FROM quotation_lines WHERE quotation_id = $2`,
    [orderId, quotationId],
  );
}

async function getOrderProductLines(client, orderId) {
  const { rows } = await client.query(
    `SELECT product_id, quantity FROM order_lines
     WHERE order_id=$1 AND product_id IS NOT NULL`,
    [orderId],
  );
  return rows;
}

async function listOrders(client, { status, limit, offset }) {
  const { rows } = await client.query(
    `SELECT o.order_id, o.order_number, o.status, o.total_amount,
            o.amount_paid, o.amount_outstanding, o.created_at,
            o.fulfilment_type, o.deal_id,
            c.display_name AS contact_name,
            i.invoice_id, i.invoice_number, i.status AS invoice_status
     FROM sales_orders o
     JOIN shared.contacts c ON c.contact_id = o.contact_id
     LEFT JOIN invoices i ON i.order_id = o.order_id AND i.is_deleted = false
     WHERE ($1::TEXT IS NULL OR o.status = $1)
     ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
    [status || null, limit, offset],
  );
  return rows;
}

async function findOrderById(client, orderId) {
  const {
    rows: [order],
  } = await client.query(
    `SELECT o.*, c.display_name AS contact_name, c.primary_phone, c.email,
            i.invoice_id, i.invoice_number, i.status AS invoice_status,
            q.quotation_number,
            json_agg(ol.* ORDER BY ol.line_id) AS lines
     FROM sales_orders o
     JOIN shared.contacts c ON c.contact_id = o.contact_id
     LEFT JOIN invoices i ON i.order_id = o.order_id AND i.is_deleted = false
     LEFT JOIN quotations q ON q.quotation_id = o.quotation_id
     LEFT JOIN order_lines ol ON ol.order_id = o.order_id
     WHERE o.order_id = $1
     GROUP BY o.order_id, c.display_name, c.primary_phone, c.email,
              i.invoice_id, i.invoice_number, i.status, q.quotation_number`,
    [orderId],
  );
  return order || null;
}

async function setOrderDispatch(
  client,
  orderId,
  { delivery_address, delivery_notes, courier_preference },
) {
  const {
    rows: [order],
  } = await client.query(
    `UPDATE sales_orders
        SET status='awaiting_dispatch',
            delivery_address=$2,
            delivery_notes=$3,
            courier_preference=$4,
            updated_at=now()
      WHERE order_id=$1
      RETURNING *`,
    [orderId, delivery_address, delivery_notes || null, courier_preference],
  );
  return order;
}

async function setOrderCancelled(client, orderId, userId) {
  const {
    rows: [order],
  } = await client.query(
    `UPDATE sales_orders SET status='cancelled', updated_at=now()
     WHERE order_id=$1 RETURNING *`,
    [orderId],
  );
  return order;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

async function findInvoiceByOrderId(client, orderId) {
  const {
    rows: [inv],
  } = await client.query(
    `SELECT * FROM invoices
     WHERE order_id = $1 AND is_deleted = false LIMIT 1`,
    [orderId],
  );
  return inv || null;
}

async function insertInvoice(
  client,
  {
    invoiceNumber,
    order_id,
    contact_id,
    deal_id,
    issue_date,
    due_date,
    subtotal,
    discount_total,
    vat_amount,
    total_amount,
    currency,
    payment_instructions,
    userId,
  },
) {
  const {
    rows: [inv],
  } = await client.query(
    `INSERT INTO invoices
       (invoice_number, contact_id, order_id, deal_id, status,
        issue_date, due_date,
        subtotal, discount_total, vat_amount, total_amount, amount_paid,
        currency, payment_instructions, created_by)
     VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,0,$11,$12,$13)
     RETURNING *`,
    [
      invoiceNumber,
      contact_id,
      order_id,
      deal_id || null,
      issue_date,
      due_date,
      subtotal,
      discount_total,
      vat_amount,
      total_amount,
      currency || "NGN",
      payment_instructions || null,
      userId,
    ],
  );
  return inv;
}

async function copyOrderLinesToInvoice(client, { invoiceId, orderId }) {
  await client.query(
    `INSERT INTO invoice_lines
       (invoice_id, product_id, description, quantity, unit_price,
        discount_amount, vat_rate, vat_amount, line_total, display_order)
     SELECT $1, product_id, description, quantity, unit_price,
            0, 0.075, 0, line_total,
            ROW_NUMBER() OVER (ORDER BY line_id)
     FROM order_lines WHERE order_id = $2`,
    [invoiceId, orderId],
  );
}

async function updateInvoicePaymentLinks(
  client,
  invoiceId,
  {
    paystack_payment_url,
    paystack_reference,
    stripe_payment_url,
    stripe_payment_intent_id,
  },
) {
  const {
    rows: [inv],
  } = await client.query(
    `UPDATE invoices SET
        paystack_payment_url      = COALESCE($2, paystack_payment_url),
        paystack_reference        = COALESCE($3, paystack_reference),
        stripe_payment_url        = COALESCE($4, stripe_payment_url),
        stripe_payment_intent_id  = COALESCE($5, stripe_payment_intent_id),
        updated_at = now()
      WHERE invoice_id = $1
      RETURNING *`,
    [
      invoiceId,
      paystack_payment_url || null,
      paystack_reference || null,
      stripe_payment_url || null,
      stripe_payment_intent_id || null,
    ],
  );
  return inv;
}

// ─── Receipts ─────────────────────────────────────────────────────────────────

async function listReceipts(client, { invoice_id, limit, offset }) {
  const { rows } = await client.query(
    `SELECT r.*, i.invoice_number, c.display_name AS contact_name
     FROM receipts r
     JOIN invoices i ON i.invoice_id = r.invoice_id
     JOIN shared.contacts c ON c.contact_id = r.contact_id
     WHERE ($1::UUID IS NULL OR r.invoice_id = $1)
     ORDER BY r.issued_at DESC LIMIT $2 OFFSET $3`,
    [invoice_id || null, limit, offset],
  );
  return rows;
}

async function findReceiptById(client, receiptId) {
  const {
    rows: [r],
  } = await client.query(
    `SELECT r.*, i.invoice_number, c.display_name AS contact_name
     FROM receipts r
     JOIN invoices i ON i.invoice_id = r.invoice_id
     JOIN shared.contacts c ON c.contact_id = r.contact_id
     WHERE r.receipt_id = $1`,
    [receiptId],
  );
  return r || null;
}

// ─── Discount approvals ───────────────────────────────────────────────────────

async function listDiscountApprovals(client, { status, quotation_id }) {
  const { rows } = await client.query(
    `SELECT da.*, p.product_name, u.display_name AS requested_by_name
     FROM discount_approvals da
     LEFT JOIN products p ON p.product_id = da.product_id
     LEFT JOIN shared.users u ON u.user_id = da.requested_by
     WHERE ($1::TEXT IS NULL OR da.status = $1)
       AND ($2::UUID IS NULL OR (da.reference_type = 'quotation' AND da.reference_id = $2))
     ORDER BY da.created_at DESC`,
    [status || null, quotation_id || null],
  );
  return rows;
}

async function setDiscountApprovalStatus(
  client,
  approvalId,
  { status, notes, reviewedBy },
) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE discount_approvals
        SET status = $2,
            review_notes = $3,
            reviewed_by = $4,
            reviewed_at = now()
      WHERE approval_id = $1
      RETURNING *`,
    [approvalId, status, notes || null, reviewedBy],
  );
  return row || null;
}

// ─── Sales KPIs ───────────────────────────────────────────────────────────────

async function getSalesKpis(client) {
  // One query per KPI keeps things readable and lets each one short-circuit
  // independently. Wrap the lot in COALESCE so an empty business returns 0
  // rather than NULL.
  const {
    rows: [pipeline],
  } = await client.query(
    `SELECT COALESCE(SUM(total_amount), 0)::NUMERIC AS v
       FROM quotations
      WHERE status IN ('draft','sent','viewed') AND is_deleted = false`,
  );
  const {
    rows: [openQ],
  } = await client.query(
    `SELECT COUNT(*)::INT AS v FROM quotations
      WHERE status NOT IN ('confirmed','expired','cancelled') AND is_deleted = false`,
  );
  const {
    rows: [confirmedM],
  } = await client.query(
    `SELECT COUNT(*)::INT AS v FROM sales_orders
      WHERE created_at >= date_trunc('month', now())`,
  );
  const {
    rows: [overdue],
  } = await client.query(
    `SELECT COUNT(*)::INT AS v FROM invoices
      WHERE (status = 'overdue'
             OR (due_date < CURRENT_DATE AND status NOT IN ('paid','voided')))
        AND is_deleted = false`,
  );
  const {
    rows: [revenueM],
  } = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::NUMERIC AS v FROM receipts
      WHERE issued_at >= date_trunc('month', now()) AND is_voided = false`,
  );
  const {
    rows: [aov],
  } = await client.query(
    `SELECT COALESCE(AVG(total_amount), 0)::NUMERIC AS v FROM sales_orders
      WHERE created_at >= date_trunc('month', now())`,
  );

  return {
    pipeline_value: Number(pipeline.v),
    open_quotes: openQ.v,
    confirmed_this_month: confirmedM.v,
    overdue_invoices: overdue.v,
    revenue_this_month: Number(revenueM.v),
    avg_order_value: Number(aov.v),
  };
}

// ─── Document archival ────────────────────────────────────────────────────────

async function archiveDocument(
  client,
  { business, document_type, reference_type, reference_id, content },
) {
  const filename = `${document_type}-${reference_id}.pdf`;
  const { filePath, fileSize, sha256 } = await storage.save(
    content,
    filename,
    `${business}/${document_type}`,
  );
  const {
    rows: [doc],
  } = await client.query(
    `INSERT INTO shared.documents
       (document_number, business, document_type, title,
        file_path, file_size_bytes, mime_type, content_hash,
        reference_type, reference_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'application/pdf', $7, $8, $9)
     RETURNING *`,
    [
      filename,
      business,
      document_type,
      filename,
      filePath,
      fileSize,
      sha256,
      reference_type,
      reference_id,
    ],
  );
  return doc;
}

module.exports = {
  // Quotations
  listQuotations,
  insertQuotation,
  insertQuotationLine,
  findQuotationById,
  getQuotationStatus,
  updateQuotation,
  setQuotationSent,
  setQuotationConfirmed,
  setQuotationCancelled,
  // Orders
  insertOrder,
  copyQuotationLinesToOrder,
  getOrderProductLines,
  listOrders,
  findOrderById,
  setOrderDispatch,
  setOrderCancelled,
  // Invoices
  findInvoiceByOrderId,
  insertInvoice,
  copyOrderLinesToInvoice,
  updateInvoicePaymentLinks,
  // Receipts
  listReceipts,
  findReceiptById,
  // Discount approvals
  listDiscountApprovals,
  setDiscountApprovalStatus,
  // KPIs
  getSalesKpis,
  // Documents
  archiveDocument,
};
