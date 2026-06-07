"use strict";

// ─────────────────────────────────────────────────────────────
// RETAIL PARTNERS REPOSITORY
//
// Three tables in scope (all in the per-business schema):
//   - retail_partners       — partner master record (consignment, wholesale, or both)
//   - consignment_stock     — what's currently sitting with each partner
//   - consignment_sales     — what each partner has reported as sold
//   - partner_settlements   — periodic settlement statements
//
// Note: the per-business schema is set by the businessContext middleware
// via SET LOCAL search_path. So unqualified `retail_partners` resolves to
// jewelry.retail_partners or diffusers.retail_partners automatically.
// ─────────────────────────────────────────────────────────────

// ── PARTNERS ─────────────────────────────────────────────────

async function listPartners(
  client,
  { search, arrangementType, isActive, limit, offset },
) {
  const { rows } = await client.query(
    `SELECT rp.partner_id, rp.partner_code, rp.arrangement_type,
            rp.consignment_margin_pct, rp.wholesale_discount_pct,
            rp.payment_terms_days, rp.settlement_cycle,
            rp.credit_limit, rp.current_balance, rp.is_active,
            rp.created_at, rp.updated_at,
            c.contact_id, c.display_name, c.company_name,
            c.primary_phone, c.email
     FROM retail_partners rp
     JOIN shared.contacts c ON c.contact_id = rp.contact_id
     WHERE ($1::TEXT IS NULL OR rp.partner_code ILIKE $1 OR c.display_name ILIKE $1 OR c.company_name ILIKE $1)
       AND ($2::TEXT IS NULL OR rp.arrangement_type = $2)
       AND ($3::BOOLEAN IS NULL OR rp.is_active = $3)
     ORDER BY c.display_name ASC
     LIMIT $4 OFFSET $5`,
    [
      search ? `%${search}%` : null,
      arrangementType || null,
      isActive,
      limit,
      offset,
    ],
  );
  return rows;
}

async function countPartners(client, { search, arrangementType, isActive }) {
  const {
    rows: [{ count }],
  } = await client.query(
    `SELECT COUNT(*) FROM retail_partners rp
     JOIN shared.contacts c ON c.contact_id = rp.contact_id
     WHERE ($1::TEXT IS NULL OR rp.partner_code ILIKE $1 OR c.display_name ILIKE $1 OR c.company_name ILIKE $1)
       AND ($2::TEXT IS NULL OR rp.arrangement_type = $2)
       AND ($3::BOOLEAN IS NULL OR rp.is_active = $3)`,
    [search ? `%${search}%` : null, arrangementType || null, isActive],
  );
  return parseInt(count, 10);
}

async function findPartnerById(client, partnerId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT rp.*,
            c.display_name, c.company_name, c.primary_phone, c.email,
            c.whatsapp_number
     FROM retail_partners rp
     JOIN shared.contacts c ON c.contact_id = rp.contact_id
     WHERE rp.partner_id = $1`,
    [partnerId],
  );
  return row || null;
}

async function findPartnerByCode(client, partnerCode) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM retail_partners WHERE partner_code = $1`,
    [partnerCode],
  );
  return row || null;
}

async function insertPartner(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO retail_partners
       (contact_id, partner_code, arrangement_type,
        consignment_margin_pct, wholesale_discount_pct,
        payment_terms_days, settlement_cycle,
        credit_limit, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      data.contact_id,
      data.partner_code,
      data.arrangement_type,
      data.consignment_margin_pct ?? 0,
      data.wholesale_discount_pct ?? 0,
      data.payment_terms_days ?? 30,
      data.settlement_cycle || "monthly",
      data.credit_limit ?? 0,
      data.notes || null,
    ],
  );
  return row;
}

async function updatePartner(client, partnerId, fields) {
  const allowed = [
    "arrangement_type",
    "consignment_margin_pct",
    "wholesale_discount_pct",
    "payment_terms_days",
    "settlement_cycle",
    "credit_limit",
    "notes",
    "is_active",
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = $${i++}`);
    values.push(fields[key]);
  }
  if (!sets.length) return findPartnerById(client, partnerId);
  sets.push(`updated_at = now()`);
  values.push(partnerId);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE retail_partners SET ${sets.join(", ")} WHERE partner_id = $${i} RETURNING *`,
    values,
  );
  return row || null;
}

async function deactivatePartner(client, partnerId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE retail_partners SET is_active = false, updated_at = now()
     WHERE partner_id = $1 RETURNING partner_id, is_active`,
    [partnerId],
  );
  return row || null;
}

// ── CONSIGNMENT STOCK ────────────────────────────────────────

/**
 * What this partner currently holds. Returns one row per consignment
 * batch (a "send"), with calculated outstanding quantities.
 */
async function listConsignmentStock(client, { partnerId, status, productId }) {
  const { rows } = await client.query(
    `SELECT cs.consignment_id, cs.partner_id, cs.product_id,
            cs.quantity_sent, cs.quantity_sold, cs.quantity_returned,
            cs.quantity_outstanding, cs.agreed_price, cs.sent_date,
            cs.status, cs.created_at, cs.updated_at,
            p.sku, p.name AS product_name, p.selling_price
     FROM consignment_stock cs
     JOIN products p ON p.product_id = cs.product_id
     WHERE ($1::UUID IS NULL OR cs.partner_id = $1)
       AND ($2::TEXT IS NULL OR cs.status = $2)
       AND ($3::UUID IS NULL OR cs.product_id = $3)
     ORDER BY cs.sent_date DESC, p.name ASC`,
    [partnerId || null, status || null, productId || null],
  );
  return rows;
}

async function findConsignmentById(client, consignmentId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT cs.*, p.sku, p.name AS product_name, p.selling_price
     FROM consignment_stock cs
     JOIN products p ON p.product_id = cs.product_id
     WHERE cs.consignment_id = $1`,
    [consignmentId],
  );
  return row || null;
}

async function insertConsignment(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO consignment_stock
       (partner_id, product_id, quantity_sent, agreed_price, sent_date, status)
     VALUES ($1,$2,$3,$4,$5,'active')
     RETURNING *`,
    [
      data.partner_id,
      data.product_id,
      data.quantity_sent,
      data.agreed_price,
      data.sent_date || new Date().toISOString().slice(0, 10),
    ],
  );
  return row;
}

async function incrementConsignmentSold(client, consignmentId, quantity) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE consignment_stock
     SET quantity_sold = quantity_sold + $2,
         status = CASE
           WHEN (quantity_sold + $2 + quantity_returned) >= quantity_sent THEN 'fully_settled'
           ELSE status
         END,
         updated_at = now()
     WHERE consignment_id = $1
     RETURNING *`,
    [consignmentId, quantity],
  );
  return row || null;
}

async function incrementConsignmentReturned(client, consignmentId, quantity) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE consignment_stock
     SET quantity_returned = quantity_returned + $2,
         status = CASE
           WHEN (quantity_sold + quantity_returned + $2) >= quantity_sent THEN 'partially_returned'
           ELSE status
         END,
         updated_at = now()
     WHERE consignment_id = $1
     RETURNING *`,
    [consignmentId, quantity],
  );
  return row || null;
}

async function recallConsignment(client, consignmentId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE consignment_stock
     SET status = 'recalled', updated_at = now()
     WHERE consignment_id = $1
     RETURNING *`,
    [consignmentId],
  );
  return row || null;
}

// ── CONSIGNMENT SALES (reported by the partner) ──────────────

async function listConsignmentSales(
  client,
  { partnerId, periodStart, periodEnd },
) {
  const { rows } = await client.query(
    `SELECT cs.sale_id, cs.consignment_id, cs.partner_id,
            cs.quantity_sold, cs.sale_price, cs.sale_date, cs.notes, cs.recorded_at,
            con.product_id, p.sku, p.name AS product_name
     FROM consignment_sales cs
     JOIN consignment_stock con ON con.consignment_id = cs.consignment_id
     JOIN products p ON p.product_id = con.product_id
     WHERE ($1::UUID IS NULL OR cs.partner_id = $1)
       AND ($2::DATE IS NULL OR cs.sale_date >= $2)
       AND ($3::DATE IS NULL OR cs.sale_date <= $3)
     ORDER BY cs.sale_date DESC`,
    [partnerId || null, periodStart || null, periodEnd || null],
  );
  return rows;
}

async function insertConsignmentSale(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO consignment_sales
       (consignment_id, partner_id, quantity_sold, sale_price, sale_date, notes)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      data.consignment_id,
      data.partner_id,
      data.quantity_sold,
      data.sale_price,
      data.sale_date,
      data.notes || null,
    ],
  );
  return row;
}

// ── PARTNER SETTLEMENTS ──────────────────────────────────────

async function listSettlements(client, { partnerId, status }) {
  const { rows } = await client.query(
    `SELECT ps.settlement_id, ps.settlement_number, ps.partner_id,
            ps.period_start, ps.period_end,
            ps.total_sales_value, ps.partner_commission, ps.amount_due_to_us,
            ps.status, ps.invoice_id, ps.document_id, ps.created_at,
            c.display_name AS partner_name
     FROM partner_settlements ps
     JOIN retail_partners rp ON rp.partner_id = ps.partner_id
     JOIN shared.contacts c ON c.contact_id = rp.contact_id
     WHERE ($1::UUID IS NULL OR ps.partner_id = $1)
       AND ($2::TEXT IS NULL OR ps.status = $2)
     ORDER BY ps.period_end DESC`,
    [partnerId || null, status || null],
  );
  return rows;
}

async function findSettlementById(client, settlementId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT ps.*, c.display_name AS partner_name
     FROM partner_settlements ps
     JOIN retail_partners rp ON rp.partner_id = ps.partner_id
     JOIN shared.contacts c ON c.contact_id = rp.contact_id
     WHERE ps.settlement_id = $1`,
    [settlementId],
  );
  return row || null;
}

async function insertSettlement(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO partner_settlements
       (settlement_number, partner_id, period_start, period_end,
        total_sales_value, partner_commission, amount_due_to_us, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft')
     RETURNING *`,
    [
      data.settlement_number,
      data.partner_id,
      data.period_start,
      data.period_end,
      data.total_sales_value,
      data.partner_commission,
      data.amount_due_to_us,
    ],
  );
  return row;
}

async function updateSettlementStatus(
  client,
  settlementId,
  { status, invoiceId, documentId },
) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE partner_settlements
     SET status = $2,
         invoice_id = COALESCE($3, invoice_id),
         document_id = COALESCE($4, document_id),
         updated_at = now()
     WHERE settlement_id = $1
     RETURNING *`,
    [settlementId, status, invoiceId || null, documentId || null],
  );
  return row || null;
}

// ── PARTNER BALANCE / AGGREGATES ─────────────────────────────

/**
 * Computes the running balance the partner currently owes us, derived
 * from consignment_sales that have happened but not yet been settled.
 * Independent of retail_partners.current_balance, which is a cached
 * value for quick reads — this one is the source of truth.
 */
async function calculatePartnerBalance(client, partnerId) {
  const {
    rows: [row],
  } = await client.query(
    `WITH sales AS (
       SELECT COALESCE(SUM(cs.quantity_sold * cs.sale_price), 0) AS total_sales
       FROM consignment_sales cs
       WHERE cs.partner_id = $1
     ),
     settled AS (
       SELECT COALESCE(SUM(amount_due_to_us), 0) AS total_settled
       FROM partner_settlements
       WHERE partner_id = $1 AND status IN ('sent', 'paid')
     )
     SELECT sales.total_sales::numeric AS gross_sales,
            settled.total_settled::numeric AS already_settled,
            (sales.total_sales - settled.total_settled)::numeric AS outstanding_balance
     FROM sales, settled`,
    [partnerId],
  );
  return {
    gross_sales: parseFloat(row.gross_sales || 0),
    already_settled: parseFloat(row.already_settled || 0),
    outstanding_balance: parseFloat(row.outstanding_balance || 0),
  };
}

async function updatePartnerCachedBalance(client, partnerId, balance) {
  await client.query(
    `UPDATE retail_partners SET current_balance = $2, updated_at = now()
     WHERE partner_id = $1`,
    [partnerId, balance],
  );
}

/**
 * Dashboard data per partner — used by the "partner overview" widget.
 */
async function getPartnerDashboard(client, partnerId) {
  const {
    rows: [row],
  } = await client.query(
    `WITH current_stock AS (
       SELECT COALESCE(SUM(quantity_outstanding), 0) AS units_held,
              COALESCE(SUM(quantity_outstanding * agreed_price), 0) AS value_held
       FROM consignment_stock
       WHERE partner_id = $1 AND status IN ('active', 'partially_returned')
     ),
     month_sales AS (
       SELECT COALESCE(SUM(quantity_sold), 0) AS units,
              COALESCE(SUM(quantity_sold * sale_price), 0) AS value
       FROM consignment_sales
       WHERE partner_id = $1
         AND sale_date >= date_trunc('month', now())
     ),
     last_settle AS (
       SELECT MAX(period_end) AS last_settled_to,
              MAX(updated_at)  AS last_settled_at
       FROM partner_settlements
       WHERE partner_id = $1 AND status = 'paid'
     )
     SELECT
       current_stock.units_held::int        AS units_held,
       current_stock.value_held::numeric    AS value_held,
       month_sales.units::int               AS this_month_units,
       month_sales.value::numeric           AS this_month_value,
       last_settle.last_settled_to,
       last_settle.last_settled_at
     FROM current_stock, month_sales, last_settle`,
    [partnerId],
  );
  return {
    units_held: parseInt(row?.units_held || 0, 10),
    value_held: parseFloat(row?.value_held || 0),
    this_month_units: parseInt(row?.this_month_units || 0, 10),
    this_month_value: parseFloat(row?.this_month_value || 0),
    last_settled_to: row?.last_settled_to || null,
    last_settled_at: row?.last_settled_at || null,
  };
}

/**
 * Find the partner's "retail_partner" stock location — created lazily
 * when the first consignment to that partner is dispatched.
 */
async function findPartnerLocation(client, partnerId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT location_id FROM stock_locations
     WHERE location_type = 'retail_partner' AND partner_id = $1
     LIMIT 1`,
    [partnerId],
  );
  return row || null;
}

async function insertPartnerLocation(client, { partnerId, name }) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO stock_locations (name, location_type, partner_id)
     VALUES ($1, 'retail_partner', $2)
     RETURNING *`,
    [name, partnerId],
  );
  return row;
}

module.exports = {
  // partners
  listPartners,
  countPartners,
  findPartnerById,
  findPartnerByCode,
  insertPartner,
  updatePartner,
  deactivatePartner,
  // consignment stock
  listConsignmentStock,
  findConsignmentById,
  insertConsignment,
  incrementConsignmentSold,
  incrementConsignmentReturned,
  recallConsignment,
  // consignment sales (partner-reported)
  listConsignmentSales,
  insertConsignmentSale,
  // settlements
  listSettlements,
  findSettlementById,
  insertSettlement,
  updateSettlementStatus,
  // balance / dashboard
  calculatePartnerBalance,
  updatePartnerCachedBalance,
  getPartnerDashboard,
  // locations
  findPartnerLocation,
  insertPartnerLocation,
};
