"use strict";

// ── SUPPLIERS ────────────────────────────────────────────────

async function listSuppliers(client, { search, limit, offset }) {
  const { rows } = await client.query(
    `SELECT s.supplier_id, s.supplier_code, s.payment_terms_days,
            s.preferred_currency, s.rating, s.is_active,
            c.display_name, c.email, c.primary_phone
     FROM suppliers s
     JOIN shared.contacts c ON c.contact_id = s.contact_id
     WHERE s.is_active = true
       AND ($1::TEXT IS NULL OR c.display_name ILIKE $1)
     ORDER BY c.display_name
     LIMIT $2 OFFSET $3`,
    [search ? `%${search}%` : null, limit, offset],
  );
  return rows;
}

async function getSupplierCount(client) {
  const {
    rows: [count],
  } = await client.query(`SELECT COUNT(*)+1 AS n FROM suppliers`);
  return count.n;
}

async function insertSupplier(
  client,
  { contact_id, code, payment_terms_days, preferred_currency, notes },
) {
  const {
    rows: [s],
  } = await client.query(
    `INSERT INTO suppliers (contact_id, supplier_code, payment_terms_days, preferred_currency, notes)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [
      contact_id,
      code,
      payment_terms_days || 30,
      preferred_currency || "USD",
      notes || null,
    ],
  );
  return s;
}

async function findSupplierById(client, supplierId) {
  const {
    rows: [s],
  } = await client.query(
    `SELECT s.*, c.display_name, c.email, c.primary_phone, c.addresses
     FROM suppliers s
     JOIN shared.contacts c ON c.contact_id = s.contact_id
     WHERE s.supplier_id = $1`,
    [supplierId],
  );
  return s || null;
}

async function upsertSupplierPortalToken(
  client,
  { supplierId, token, expiresAt },
) {
  await client.query(
    `UPDATE suppliers SET portal_access_token = $2 WHERE supplier_id = $1`,
    [supplierId, token],
  );
}

// ── RFQs ─────────────────────────────────────────────────────

async function listRFQs(client, { status, limit, offset }) {
  const { rows } = await client.query(
    `SELECT rfq_id, rfq_number, title, status, response_deadline, created_at
     FROM rfqs
     WHERE ($1::TEXT IS NULL OR status=$1)
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [status || null, limit, offset],
  );
  return rows;
}

async function findRFQById(client, rfqId) {
  const {
    rows: [rfq],
  } = await client.query(
    `SELECT r.*,
            json_agg(
              json_build_object(
                'line_id', rl.line_id,
                'product_id', rl.product_id,
                'description', rl.description,
                'quantity_needed', rl.quantity_needed,
                'target_price', rl.target_price,
                'notes', rl.notes
              ) ORDER BY rl.line_id
            ) AS lines
     FROM rfqs r
     LEFT JOIN rfq_lines rl ON rl.rfq_id = r.rfq_id
     WHERE r.rfq_id = $1
     GROUP BY r.rfq_id`,
    [rfqId],
  );
  return rfq || null;
}

async function insertRFQ(
  client,
  { rfqNumber, title, response_deadline, notes, userId },
) {
  const {
    rows: [rfq],
  } = await client.query(
    `INSERT INTO rfqs (rfq_number, title, response_deadline, notes, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [rfqNumber, title, response_deadline || null, notes || null, userId],
  );
  return rfq;
}

async function insertRFQLine(
  client,
  { rfq_id, product_id, description, quantity_needed, target_price },
) {
  await client.query(
    `INSERT INTO rfq_lines (rfq_id, product_id, description, quantity_needed, target_price)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      rfq_id,
      product_id || null,
      description || "",
      quantity_needed,
      target_price || null,
    ],
  );
}

async function updateRFQStatus(client, rfqId, status) {
  const {
    rows: [rfq],
  } = await client.query(
    `UPDATE rfqs SET status = $2 WHERE rfq_id = $1 RETURNING *`,
    [rfqId, status],
  );
  return rfq || null;
}

async function insertSupplierQuote(
  client,
  {
    rfq_id,
    supplier_id,
    rfq_line_id,
    unit_price,
    currency,
    lead_time_days,
    valid_until,
    notes,
  },
) {
  const {
    rows: [q],
  } = await client.query(
    `INSERT INTO supplier_quotes (rfq_id, supplier_id, rfq_line_id, unit_price, currency, lead_time_days, valid_until, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      rfq_id,
      supplier_id,
      rfq_line_id || null,
      unit_price,
      currency || "USD",
      lead_time_days || null,
      valid_until || null,
      notes || null,
    ],
  );
  return q;
}

async function findSupplierQuoteById(client, quoteId) {
  const {
    rows: [q],
  } = await client.query(
    `SELECT sq.*, rl.rfq_id, rl.product_id, rl.quantity_needed
     FROM supplier_quotes sq
     JOIN rfq_lines rl ON rl.line_id = sq.rfq_line_id
     WHERE sq.quote_id = $1`,
    [quoteId],
  );
  return q || null;
}

async function listQuoteLinesByRFQAndSupplier(client, { rfqId, supplierId }) {
  const { rows } = await client.query(
    `SELECT sq.*, rl.product_id, rl.quantity_needed, rl.description
     FROM supplier_quotes sq
     JOIN rfq_lines rl ON rl.line_id = sq.rfq_line_id
     WHERE sq.rfq_id = $1 AND sq.supplier_id = $2`,
    [rfqId, supplierId],
  );
  return rows;
}

async function updateSupplierQuoteStatus(client, quoteId, status) {
  await client.query(
    `UPDATE supplier_quotes SET status = $2 WHERE quote_id = $1`,
    [quoteId, status],
  );
}

// ── PURCHASE ORDERS ──────────────────────────────────────────

async function listPOs(client, { status, supplierId, limit, offset }) {
  const { rows } = await client.query(
    `SELECT po.po_id, po.po_number, po.status, po.total_amount, po.currency,
            po.order_date, po.expected_delivery,
            c.display_name AS supplier_name
     FROM purchase_orders po
     JOIN suppliers s ON s.supplier_id = po.supplier_id
     JOIN shared.contacts c ON c.contact_id = s.contact_id
     WHERE po.is_deleted = false
       AND ($1::TEXT IS NULL OR po.status=$1)
       AND ($2::UUID IS NULL OR po.supplier_id=$2)
     ORDER BY po.order_date DESC LIMIT $3 OFFSET $4`,
    [status || null, supplierId || null, limit, offset],
  );
  return rows;
}

async function insertPO(
  client,
  {
    poNumber,
    supplier_id,
    expected_delivery,
    subtotal,
    shipping_cost,
    import_duty,
    other_charges,
    total,
    currency,
    exchange_rate,
    ngn_equivalent,
    notes,
    userId,
  },
) {
  const {
    rows: [po],
  } = await client.query(
    `INSERT INTO purchase_orders
       (po_number, supplier_id, status, order_date, expected_delivery,
        subtotal, shipping_cost, import_duty, other_charges, total_amount,
        currency, exchange_rate, ngn_equivalent, notes, created_by)
     VALUES ($1,$2,'draft',CURRENT_DATE,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      poNumber,
      supplier_id,
      expected_delivery || null,
      subtotal,
      shipping_cost || 0,
      import_duty || 0,
      other_charges || 0,
      total,
      currency || "USD",
      exchange_rate || null,
      ngn_equivalent || null,
      notes || null,
      userId,
    ],
  );
  return po;
}

async function insertPOLine(
  client,
  { po_id, product_id, quantity_ordered, unit_price },
) {
  await client.query(
    `INSERT INTO po_lines (po_id, product_id, quantity_ordered, quantity_received, unit_price, line_total)
     VALUES ($1,$2,$3,0,$4,$5)`,
    [
      po_id,
      product_id,
      quantity_ordered,
      unit_price,
      unit_price * quantity_ordered,
    ],
  );
}

async function findPOById(client, poId) {
  const {
    rows: [po],
  } = await client.query(
    `SELECT po.*, c.display_name AS supplier_name,
            json_agg(pl.* ORDER BY pl.line_id) AS lines
     FROM purchase_orders po
     JOIN suppliers s ON s.supplier_id = po.supplier_id
     JOIN shared.contacts c ON c.contact_id = s.contact_id
     LEFT JOIN po_lines pl ON pl.po_id = po.po_id
     WHERE po.po_id = $1 AND po.is_deleted = false
     GROUP BY po.po_id, c.display_name`,
    [poId],
  );
  return po || null;
}

async function updatePOFields(
  client,
  poId,
  { expected_delivery, notes, currency },
) {
  const {
    rows: [po],
  } = await client.query(
    `UPDATE purchase_orders SET
       expected_delivery = COALESCE($2, expected_delivery),
       notes             = COALESCE($3, notes),
       currency          = COALESCE($4, currency)
     WHERE po_id = $1 AND is_deleted = false
     RETURNING *`,
    [poId, expected_delivery ?? null, notes ?? null, currency ?? null],
  );
  return po || null;
}

async function updatePOStatusDirect(client, poId, status) {
  const {
    rows: [po],
  } = await client.query(
    `UPDATE purchase_orders SET status = $2 WHERE po_id = $1 RETURNING *`,
    [poId, status],
  );
  return po || null;
}

async function updatePOStatus(client, poId) {
  await client.query(
    `UPDATE purchase_orders SET status =
       CASE WHEN (SELECT SUM(quantity_ordered - quantity_received) FROM po_lines WHERE po_id=$1) = 0
            THEN 'received' ELSE 'partially_received' END
     WHERE po_id=$1`,
    [poId],
  );
}

async function listReceiptsByPO(client, poId) {
  const { rows } = await client.query(
    `SELECT gr.receipt_id, gr.po_id, gr.received_date, gr.notes, gr.created_at,
            u.email AS received_by_email,
            json_agg(grl.* ORDER BY grl.gr_line_id) AS lines
     FROM goods_received gr
     JOIN shared.users u ON u.user_id = gr.received_by
     LEFT JOIN goods_received_lines grl ON grl.receipt_id = gr.receipt_id
     WHERE gr.po_id = $1
     GROUP BY gr.receipt_id, u.email
     ORDER BY gr.received_date DESC`,
    [poId],
  );
  return rows;
}

// ── GOODS RECEIPT ─────────────────────────────────────────────

async function insertGoodsReceipt(client, { poId, userId, notes }) {
  const {
    rows: [receipt],
  } = await client.query(
    `INSERT INTO goods_received (po_id, received_by, notes) VALUES ($1,$2,$3) RETURNING *`,
    [poId, userId, notes || null],
  );
  return receipt;
}

async function insertGoodsReceiptLine(
  client,
  {
    receipt_id,
    po_line_id,
    quantity_received,
    quantity_accepted,
    quantity_rejected,
    rejection_reason,
  },
) {
  await client.query(
    `INSERT INTO goods_received_lines
       (receipt_id, po_line_id, quantity_received, quantity_accepted,
        quantity_rejected, rejection_reason, quality_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      receipt_id,
      po_line_id,
      quantity_received,
      quantity_accepted,
      quantity_rejected || 0,
      rejection_reason || null,
      quantity_rejected > 0 ? "partially_rejected" : "accepted",
    ],
  );
}

async function updatePOLineReceived(client, { po_line_id, quantity_accepted }) {
  await client.query(
    `UPDATE po_lines SET quantity_received = quantity_received + $1 WHERE line_id = $2`,
    [quantity_accepted, po_line_id],
  );
}

async function getPOLineProduct(client, po_line_id) {
  const {
    rows: [poLine],
  } = await client.query(
    `SELECT pl.product_id, po.supplier_id
     FROM po_lines pl
     JOIN purchase_orders po ON po.po_id = pl.po_id
     WHERE pl.line_id = $1`,
    [po_line_id],
  );
  return poLine || null;
}

// ── BILLS (supplier_invoices) ────────────────────────────────

async function listBills(client, { status, supplierId, limit, offset }) {
  const { rows } = await client.query(
    `SELECT si.sup_invoice_id, si.supplier_invoice_number, si.invoice_date,
            si.due_date, si.amount, si.currency, si.status, si.amount_paid,
            si.created_at, c.display_name AS supplier_name
     FROM supplier_invoices si
     JOIN suppliers s ON s.supplier_id = si.supplier_id
     JOIN shared.contacts c ON c.contact_id = s.contact_id
     WHERE ($1::TEXT IS NULL OR si.status = $1)
       AND ($2::UUID IS NULL OR si.supplier_id = $2)
     ORDER BY si.invoice_date DESC
     LIMIT $3 OFFSET $4`,
    [status || null, supplierId || null, limit, offset],
  );
  return rows;
}

async function findBillById(client, billId) {
  const {
    rows: [bill],
  } = await client.query(
    `SELECT si.*, c.display_name AS supplier_name
     FROM supplier_invoices si
     JOIN suppliers s ON s.supplier_id = si.supplier_id
     JOIN shared.contacts c ON c.contact_id = s.contact_id
     WHERE si.sup_invoice_id = $1`,
    [billId],
  );
  return bill || null;
}

async function insertBill(
  client,
  {
    supplier_id,
    po_id,
    supplier_invoice_number,
    invoice_date,
    due_date,
    amount,
    currency,
    amount_ngn,
    notes,
    document_id,
    status,
  },
) {
  const {
    rows: [bill],
  } = await client.query(
    `INSERT INTO supplier_invoices
       (supplier_id, po_id, supplier_invoice_number, invoice_date, due_date,
        amount, currency, amount_ngn, notes, document_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      supplier_id,
      po_id || null,
      supplier_invoice_number,
      invoice_date,
      due_date,
      amount,
      currency,
      amount_ngn || null,
      notes || null,
      document_id || null,
      status || "pending",
    ],
  );
  return bill;
}

async function updateBillStatus(client, billId, status, extra = {}) {
  const {
    rows: [bill],
  } = await client.query(
    `UPDATE supplier_invoices
     SET status = $2,
         notes  = COALESCE($3, notes)
     WHERE sup_invoice_id = $1
     RETURNING *`,
    [billId, status, extra.notes ?? null],
  );
  return bill || null;
}

async function recordBillPayment(
  client,
  billId,
  { amount, newAmountPaid, fullyPaid },
) {
  const {
    rows: [bill],
  } = await client.query(
    `UPDATE supplier_invoices
     SET amount_paid = $2,
         status      = CASE WHEN $3 THEN 'paid' ELSE status END,
         paid_at     = CASE WHEN $3 THEN NOW() ELSE paid_at END
     WHERE sup_invoice_id = $1
     RETURNING *`,
    [billId, newAmountPaid, fullyPaid],
  );
  return bill || null;
}

module.exports = {
  // suppliers
  listSuppliers,
  getSupplierCount,
  insertSupplier,
  findSupplierById,
  upsertSupplierPortalToken,
  // rfqs
  listRFQs,
  findRFQById,
  insertRFQ,
  insertRFQLine,
  updateRFQStatus,
  insertSupplierQuote,
  findSupplierQuoteById,
  listQuoteLinesByRFQAndSupplier,
  updateSupplierQuoteStatus,
  // purchase orders
  listPOs,
  insertPO,
  insertPOLine,
  findPOById,
  updatePOFields,
  updatePOStatusDirect,
  updatePOStatus,
  listReceiptsByPO,
  // goods receipt
  insertGoodsReceipt,
  insertGoodsReceiptLine,
  updatePOLineReceived,
  getPOLineProduct,
  // bills
  listBills,
  findBillById,
  insertBill,
  updateBillStatus,
  recordBillPayment,
};
