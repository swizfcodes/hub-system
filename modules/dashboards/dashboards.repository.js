"use strict";

async function getSalesRevenue(client, { startDate, endDate }) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT
       COALESCE(SUM(i.total_amount),0)                                    AS total_revenue,
       COALESCE(SUM(i.amount_paid),0)                                     AS total_collected,
       COALESCE(SUM(i.amount_outstanding),0)                              AS total_outstanding,
       COUNT(i.invoice_id)                                                 AS invoice_count,
       COUNT(i.invoice_id) FILTER (WHERE i.status='paid')                AS paid_count,
       COUNT(i.invoice_id) FILTER (WHERE i.status IN ('overdue','partially_paid')) AS unpaid_count,
       COALESCE(AVG(i.total_amount),0)                                    AS avg_order_value
     FROM invoices i
     WHERE i.issue_date BETWEEN $1 AND $2 AND i.is_deleted=false AND i.status != 'voided'`,
    [startDate, endDate],
  );
  return row;
}

async function getTopProducts(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT il.description, il.product_id, SUM(il.line_total) AS revenue, SUM(il.quantity) AS units_sold
     FROM invoice_lines il JOIN invoices i ON i.invoice_id = il.invoice_id
     WHERE i.issue_date BETWEEN $1 AND $2 AND i.status != 'voided' AND i.is_deleted=false
     GROUP BY il.description, il.product_id ORDER BY revenue DESC LIMIT 5`,
    [startDate, endDate],
  );
  return rows;
}

async function getRevenueByDay(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT DATE(i.issue_date) AS date, COALESCE(SUM(i.total_amount),0) AS revenue, COUNT(i.invoice_id) AS orders
     FROM invoices i WHERE i.issue_date BETWEEN $1 AND $2 AND i.status != 'voided' AND i.is_deleted=false
     GROUP BY DATE(i.issue_date) ORDER BY date ASC`,
    [startDate, endDate],
  );
  return rows;
}

async function getQuoteConversion(client, { startDate, endDate }) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE status='confirmed')          AS confirmed,
       COUNT(*) FILTER (WHERE status IN ('sent','viewed')) AS pending,
       COUNT(*) FILTER (WHERE status='expired')            AS expired,
       COUNT(*) FILTER (WHERE status='cancelled')          AS cancelled,
       COUNT(*)                                            AS total,
       ROUND(COUNT(*) FILTER (WHERE status='confirmed')::NUMERIC / NULLIF(COUNT(*),0)*100,1) AS conversion_rate
     FROM quotations WHERE created_at::DATE BETWEEN $1 AND $2 AND is_deleted=false`,
    [startDate, endDate],
  );
  return row;
}

async function getPaymentMethods(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT ip.payment_method, COUNT(*) AS transaction_count, SUM(ip.amount) AS total_amount
     FROM invoice_payments ip JOIN invoices i ON i.invoice_id=ip.invoice_id
     WHERE i.issue_date BETWEEN $1 AND $2
     GROUP BY ip.payment_method ORDER BY total_amount DESC`,
    [startDate, endDate],
  );
  return rows;
}

async function getIncomeVsExpense(client, { startDate, endDate }) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT
       COALESCE(SUM(jl.credit) FILTER (WHERE coa.account_type='income'),0)  AS total_income,
       COALESCE(SUM(jl.debit)  FILTER (WHERE coa.account_type='expense'),0) AS total_expenses,
       COALESCE(SUM(jl.credit) FILTER (WHERE coa.account_type='income'),0) -
       COALESCE(SUM(jl.debit)  FILTER (WHERE coa.account_type='expense'),0) AS net_profit
     FROM journal_lines jl JOIN journal_entries je ON je.entry_id=jl.entry_id
     JOIN chart_of_accounts coa ON coa.account_id=jl.account_id
     WHERE je.entry_date BETWEEN $1 AND $2`,
    [startDate, endDate],
  );
  return row;
}

async function getARAgeing(client) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT
       COALESCE(SUM(amount_outstanding) FILTER (WHERE CURRENT_DATE-due_date BETWEEN 0  AND 30),0)  AS bucket_0_30,
       COALESCE(SUM(amount_outstanding) FILTER (WHERE CURRENT_DATE-due_date BETWEEN 31 AND 60),0)  AS bucket_31_60,
       COALESCE(SUM(amount_outstanding) FILTER (WHERE CURRENT_DATE-due_date BETWEEN 61 AND 90),0)  AS bucket_61_90,
       COALESCE(SUM(amount_outstanding) FILTER (WHERE CURRENT_DATE-due_date > 90),0)               AS bucket_90_plus,
       COALESCE(SUM(amount_outstanding),0)                                                          AS total_outstanding
     FROM invoices WHERE status IN ('overdue','partially_paid','sent') AND is_deleted=false`,
  );
  return row;
}

async function getAPSummary(client) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT
       COALESCE(SUM(amount - amount_paid),0) AS total_ap,
       COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status='approved') AS overdue_count
     FROM supplier_invoices WHERE status IN ('pending','matched','approved')`,
  );
  return row;
}

async function getBankBalances(client, business) {
  const { rows } = await client.query(
    `SELECT ba.account_id, ba.bank_name, ba.account_name, COALESCE(SUM(bs.amount),0) AS running_balance
     FROM shared.bank_accounts ba LEFT JOIN bank_statements bs ON bs.bank_account_id=ba.account_id
     WHERE ba.business=$1 AND ba.is_active=true GROUP BY ba.account_id, ba.bank_name, ba.account_name`,
    [business],
  );
  return rows;
}

async function getTotalStockValue(client) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(DISTINCT p.product_id) AS total_products, COALESCE(SUM(p.cost_price * stock.qty),0) AS total_cost_value, COALESCE(SUM(p.selling_price * stock.qty),0) AS total_retail_value
     FROM products p JOIN (SELECT product_id, COALESCE(SUM(quantity*direction),0) AS qty FROM stock_movements GROUP BY product_id) stock ON stock.product_id=p.product_id
     WHERE p.is_deleted=false AND stock.qty > 0`,
  );
  return row;
}

async function getLowStockCount(client) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(*) AS low_stock_count FROM (SELECT p.product_id FROM products p LEFT JOIN (SELECT product_id, COALESCE(SUM(quantity*direction),0) AS qty FROM stock_movements GROUP BY product_id) s ON s.product_id=p.product_id WHERE p.is_deleted=false AND p.is_active=true AND COALESCE(s.qty,0) <= p.reorder_level) low`,
  );
  return row;
}

async function getTopMovingProducts(client) {
  const { rows } = await client.query(
    `SELECT p.name, p.sku, ABS(SUM(sm.quantity)) AS units_out FROM stock_movements sm JOIN products p ON p.product_id=sm.product_id WHERE sm.direction=-1 AND sm.movement_type IN ('sold','pos_sale') AND sm.performed_at >= now()-INTERVAL '30 days' GROUP BY p.product_id, p.name, p.sku ORDER BY units_out DESC LIMIT 5`,
  );
  return rows;
}

async function getStockByLocation(client) {
  const { rows } = await client.query(
    `SELECT l.name AS location_name, l.location_type, COUNT(DISTINCT sm.product_id) AS product_count, COALESCE(SUM(sm.quantity*sm.direction),0) AS total_units
     FROM stock_locations l LEFT JOIN stock_movements sm ON COALESCE(sm.to_location_id, sm.from_location_id) = l.location_id WHERE l.is_active=true GROUP BY l.location_id, l.name, l.location_type ORDER BY total_units DESC`,
  );
  return rows;
}

async function getCustomerSummary(client, { startDate, endDate, business }) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(DISTINCT c.contact_id) AS total_customers, COUNT(DISTINCT c.contact_id) FILTER (WHERE c.priority_level='vip') AS vip_count, COUNT(DISTINCT c.contact_id) FILTER (WHERE c.created_at::DATE >= $1) AS new_this_period FROM shared.contacts c WHERE 'customer' = ANY(c.contact_type) AND c.is_deleted=false AND $3 = ANY(c.visible_to)`,
    [startDate, endDate, business],
  );
  return row;
}

async function getNewVsReturning(client, { startDate, endDate }) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(DISTINCT i.contact_id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM invoices i2 WHERE i2.contact_id=i.contact_id AND i2.issue_date < $1 AND i2.is_deleted=false)) AS new_customers, COUNT(DISTINCT i.contact_id) FILTER (WHERE EXISTS (SELECT 1 FROM invoices i2 WHERE i2.contact_id=i.contact_id AND i2.issue_date < $1 AND i2.is_deleted=false)) AS returning_customers FROM invoices i WHERE i.issue_date BETWEEN $1 AND $2 AND i.is_deleted=false`,
    [startDate, endDate],
  );
  return row;
}

async function getTopCustomers(client) {
  const { rows } = await client.query(
    `SELECT c.display_name, c.contact_id, c.priority_level, SUM(i.total_amount) AS lifetime_value, COUNT(i.invoice_id) AS order_count, MAX(i.issue_date) AS last_order FROM shared.contacts c JOIN invoices i ON i.contact_id=c.contact_id WHERE i.is_deleted=false GROUP BY c.contact_id, c.display_name, c.priority_level ORDER BY lifetime_value DESC LIMIT 10`,
  );
  return rows;
}

async function getPipelineHealth(client) {
  const { rows } = await client.query(
    `SELECT stage, COUNT(*) AS count, COALESCE(SUM(expected_value),0) AS total_value FROM crm_deals WHERE is_deleted=false AND won_at IS NULL AND lost_at IS NULL GROUP BY stage ORDER BY count DESC`,
  );
  return rows;
}

async function getRetailPartners(client) {
  const { rows } = await client.query(
    `SELECT rp.partner_id, rp.partner_code, rp.current_balance, rp.settlement_cycle, rp.arrangement_type, c.display_name AS partner_name, COUNT(DISTINCT cs.consignment_id) AS active_consignments, COALESCE(SUM(cs.quantity_outstanding),0) AS units_held, COALESCE(SUM(cs.quantity_sold * cs.agreed_price),0) AS consignment_value, MAX(ps.period_end) AS last_settlement FROM retail_partners rp JOIN shared.contacts c ON c.contact_id=rp.contact_id LEFT JOIN consignment_stock cs ON cs.partner_id=rp.partner_id AND cs.status='active' LEFT JOIN partner_settlements ps ON ps.partner_id=rp.partner_id WHERE rp.is_active=true GROUP BY rp.partner_id, rp.partner_code, rp.current_balance, rp.settlement_cycle, rp.arrangement_type, c.display_name ORDER BY rp.current_balance DESC`,
  );
  return rows;
}

async function getLogisticsSummary(client, { startDate, endDate }) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(*) FILTER (WHERE status='pending_dispatch') AS pending, COUNT(*) FILTER (WHERE status IN ('dispatched','picked_up','in_transit')) AS in_transit, COUNT(*) FILTER (WHERE status='delivered') AS delivered, COUNT(*) FILTER (WHERE status='failed') AS failed, COUNT(*) FILTER (WHERE status='returned') AS returned, COALESCE(SUM(delivery_fee),0) AS total_fees, COALESCE(AVG(EXTRACT(EPOCH FROM (delivered_at-dispatched_at))/3600),0) AS avg_delivery_hours FROM deliveries WHERE created_at::DATE BETWEEN $1 AND $2`,
    [startDate, endDate],
  );
  return row;
}

async function getLogisticsByCourier(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT courier, COUNT(*) AS total, COUNT(*) FILTER (WHERE status='delivered') AS delivered, COUNT(*) FILTER (WHERE status='failed') AS failed, ROUND(COUNT(*) FILTER (WHERE status='delivered')::NUMERIC / NULLIF(COUNT(*),0)*100,1) AS success_rate, COALESCE(AVG(delivery_fee),0) AS avg_fee FROM deliveries WHERE created_at::DATE BETWEEN $1 AND $2 GROUP BY courier`,
    [startDate, endDate],
  );
  return rows;
}

async function getActiveDeliveries(client) {
  const { rows } = await client.query(
    `SELECT d.delivery_id, d.delivery_number, d.status, d.courier, d.dispatched_at, c.display_name AS contact_name FROM deliveries d JOIN shared.contacts c ON c.contact_id=d.contact_id WHERE d.status NOT IN ('delivered','returned','failed') ORDER BY d.created_at ASC LIMIT 20`,
  );
  return rows;
}

async function getOverviewRevenue(client, { startDate, endDate }) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COALESCE(SUM(total_amount),0) AS revenue, COUNT(*) AS invoices FROM invoices WHERE issue_date BETWEEN $1 AND $2 AND status != 'voided' AND is_deleted=false`,
    [startDate, endDate],
  );
  return row;
}

async function getOverviewStock(client) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(*) AS low_stock_alerts FROM products p LEFT JOIN (SELECT product_id, COALESCE(SUM(quantity*direction),0) AS qty FROM stock_movements GROUP BY product_id) s ON s.product_id=p.product_id WHERE p.is_deleted=false AND p.is_active=true AND COALESCE(s.qty,0) <= p.reorder_level`,
  );
  return row;
}

async function getOverviewDeliveries(client) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(*) FILTER (WHERE status='pending_dispatch') AS pending_dispatch, COUNT(*) FILTER (WHERE status='failed') AS failed FROM deliveries WHERE created_at::DATE >= CURRENT_DATE - INTERVAL '7 days'`,
  );
  return row;
}

async function getOverviewCRM(client) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(*) AS open_deals, COALESCE(SUM(expected_value),0) AS pipeline_value FROM crm_deals WHERE is_deleted=false AND won_at IS NULL AND lost_at IS NULL`,
  );
  return row;
}

async function getUnreadNotifications(client, userId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(*) AS unread FROM shared.notifications WHERE user_id=$1 AND is_read=false`,
    [userId],
  );
  return row;
}

module.exports = {
  getSalesRevenue,
  getTopProducts,
  getRevenueByDay,
  getQuoteConversion,
  getPaymentMethods,
  getIncomeVsExpense,
  getARAgeing,
  getAPSummary,
  getBankBalances,
  getTotalStockValue,
  getLowStockCount,
  getTopMovingProducts,
  getStockByLocation,
  getCustomerSummary,
  getNewVsReturning,
  getTopCustomers,
  getPipelineHealth,
  getRetailPartners,
  getLogisticsSummary,
  getLogisticsByCourier,
  getActiveDeliveries,
  getOverviewRevenue,
  getOverviewStock,
  getOverviewDeliveries,
  getOverviewCRM,
  getUnreadNotifications,
  // dashboard configs
  listDashboardConfigs,
  findDashboardConfigById,
  insertDashboardConfig,
  updateDashboardConfig,
  clearOtherDefaults,
  deleteDashboardConfig,
};

// ── DASHBOARD CONFIGS ────────────────────────────────────────
// Per-user saved dashboard layouts. Each user can have several named
// dashboards; one is flagged is_default and loads first.

async function listDashboardConfigs(client, userId) {
  const { rows } = await client.query(
    `SELECT config_id, user_id, dashboard_name, layout, widgets,
            is_default, created_at, updated_at
     FROM dashboard_configs
     WHERE user_id = $1
     ORDER BY is_default DESC, dashboard_name`,
    [userId],
  );
  return rows;
}

async function findDashboardConfigById(client, configId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM dashboard_configs WHERE config_id = $1`,
    [configId],
  );
  return row || null;
}

async function insertDashboardConfig(
  client,
  { userId, dashboardName, layout, widgets, isDefault },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO dashboard_configs
       (user_id, dashboard_name, layout, widgets, is_default)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
     RETURNING *`,
    [
      userId,
      dashboardName,
      JSON.stringify(layout || []),
      JSON.stringify(widgets || []),
      !!isDefault,
    ],
  );
  return row;
}

async function updateDashboardConfig(client, configId, fields) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE dashboard_configs SET
       dashboard_name = COALESCE($2, dashboard_name),
       layout         = COALESCE($3::jsonb, layout),
       widgets        = COALESCE($4::jsonb, widgets),
       is_default     = COALESCE($5, is_default),
       updated_at     = now()
     WHERE config_id = $1
     RETURNING *`,
    [
      configId,
      fields.dashboardName ?? null,
      fields.layout ? JSON.stringify(fields.layout) : null,
      fields.widgets ? JSON.stringify(fields.widgets) : null,
      fields.isDefault ?? null,
    ],
  );
  return row || null;
}

async function clearOtherDefaults(client, userId, exceptConfigId) {
  // Only one default dashboard per user — demote any other defaults
  // when one is promoted. Run in the same transaction.
  await client.query(
    `UPDATE dashboard_configs
     SET is_default = false
     WHERE user_id = $1 AND config_id != $2 AND is_default = true`,
    [userId, exceptConfigId],
  );
}

async function deleteDashboardConfig(client, configId) {
  const {
    rows: [row],
  } = await client.query(
    `DELETE FROM dashboard_configs WHERE config_id = $1
     RETURNING config_id, user_id`,
    [configId],
  );
  return row || null;
}
