"use strict";

// ─────────────────────────────────────────────────────────────
// REPORTS REPOSITORY
//
// Reports are read-only aggregations meant for export to PDF / Excel
// / CSV. Each report type has its own SQL function here that returns
// rows ready for formatting. Per-report formatters live in the
// *.report.js files; this file is the raw data layer.
//
// Why a separate repo from dashboards? Dashboards are short-form,
// interactive widgets that summarise. Reports are detailed, long-form,
// archival; they need different SQL — usually one row per
// transaction/line, with broader date ranges and more columns.
// ─────────────────────────────────────────────────────────────

// ── SALES REPORTS ────────────────────────────────────────────

async function getSalesByPeriod(
  client,
  { startDate, endDate, groupBy = "day" },
) {
  // groupBy: 'day' | 'week' | 'month'
  const truncFn =
    { day: "day", week: "week", month: "month" }[groupBy] || "day";
  const { rows } = await client.query(
    `SELECT date_trunc($3, i.issue_date)::date AS period,
            COUNT(DISTINCT i.invoice_id)::int  AS invoice_count,
            COUNT(DISTINCT i.contact_id)::int  AS customer_count,
            COALESCE(SUM(i.subtotal), 0)       AS subtotal,
            COALESCE(SUM(i.vat_amount), 0)     AS tax,
            COALESCE(SUM(i.total_amount), 0)   AS total
     FROM invoices i
     WHERE i.issue_date BETWEEN $1 AND $2
       AND i.status IN ('paid','partially_paid')
     GROUP BY period
     ORDER BY period ASC`,
    [startDate, endDate, truncFn],
  );
  return rows;
}

async function getSalesByProduct(client, { startDate, endDate, limit = 100 }) {
  const { rows } = await client.query(
    `SELECT p.sku, p.name AS product_name, p.category_id,
            pc.name AS category_name,
            SUM(il.quantity)::int             AS units_sold,
            COALESCE(SUM(il.line_total), 0)   AS revenue,
            COALESCE(AVG(il.unit_price), 0)   AS avg_unit_price
     FROM invoice_lines il
     JOIN invoices i ON i.invoice_id = il.invoice_id
     JOIN products p ON p.product_id = il.product_id
     LEFT JOIN product_categories pc ON pc.category_id = p.category_id
     WHERE i.issue_date BETWEEN $1 AND $2
       AND i.status IN ('paid','partially_paid')
     GROUP BY p.sku, p.name, p.category_id, pc.name
     ORDER BY revenue DESC
     LIMIT $3`,
    [startDate, endDate, limit],
  );
  return rows;
}

async function getSalesByCustomer(client, { startDate, endDate, limit = 100 }) {
  const { rows } = await client.query(
    `SELECT c.contact_id, c.display_name, c.priority_level,
            COUNT(DISTINCT i.invoice_id)::int   AS invoice_count,
            COALESCE(SUM(i.total_amount), 0)    AS total_spend
     FROM invoices i
     JOIN shared.contacts c ON c.contact_id = i.contact_id
     WHERE i.issue_date BETWEEN $1 AND $2
       AND i.status IN ('paid','partially_paid')
     GROUP BY c.contact_id, c.display_name, c.priority_level
     ORDER BY total_spend DESC
     LIMIT $3`,
    [startDate, endDate, limit],
  );
  return rows;
}

// ── FINANCE REPORTS ──────────────────────────────────────────

async function getProfitAndLoss(client, { startDate, endDate }) {
  // Aggregates income (paid invoices) minus expenses for the period.
  const { rows } = await client.query(
    `WITH income AS (
       SELECT COALESCE(SUM(amount_paid), 0) AS total
       FROM invoices
       WHERE issue_date BETWEEN $1 AND $2
         AND status IN ('paid','partially_paid')
     ),
     expenses AS (
       SELECT COALESCE(SUM(amount), 0) AS total
       FROM expenses
       WHERE expense_date BETWEEN $1 AND $2
         AND status IN ('approved','paid')
     )
     SELECT income.total::numeric  AS income,
            expenses.total::numeric AS expense,
            (income.total - expenses.total)::numeric AS net_profit
     FROM income, expenses`,
    [startDate, endDate],
  );
  return rows[0] || { income: 0, expense: 0, net_profit: 0 };
}

async function getOutstandingInvoices(client, { asOfDate }) {
  const { rows } = await client.query(
    `SELECT i.invoice_number, i.issue_date, i.due_date,
            c.display_name AS customer,
            i.total_amount, i.amount_paid, i.amount_outstanding,
            (CURRENT_DATE - i.due_date)::int AS days_overdue,
            i.status
     FROM invoices i
     JOIN shared.contacts c ON c.contact_id = i.contact_id
     WHERE i.status IN ('sent','partially_paid','overdue')
       AND i.issue_date <= $1
     ORDER BY i.due_date ASC`,
    [asOfDate],
  );
  return rows;
}

async function getExpensesByCategory(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT e.category,
            COUNT(*)::int                   AS expense_count,
            COALESCE(SUM(e.amount), 0)      AS total
     FROM expenses e
     WHERE e.expense_date BETWEEN $1 AND $2
       AND e.status IN ('approved','paid')
     GROUP BY e.category
     ORDER BY total DESC`,
    [startDate, endDate],
  );
  return rows;
}

// ── STOCK REPORTS ────────────────────────────────────────────

async function getStockValuation(client) {
  const { rows } = await client.query(
    `WITH product_cost AS (
       SELECT product_id,
         CASE
           WHEN SUM(CASE WHEN direction = 1 AND unit_cost IS NOT NULL AND unit_cost > 0 THEN quantity ELSE 0 END) > 0
             THEN SUM(CASE WHEN direction = 1 AND unit_cost IS NOT NULL AND unit_cost > 0 THEN quantity * unit_cost ELSE 0 END)
                / SUM(CASE WHEN direction = 1 AND unit_cost IS NOT NULL AND unit_cost > 0 THEN quantity ELSE 0 END)
           ELSE NULL
         END AS weighted_avg_cost
       FROM stock_movements GROUP BY product_id
     )
     SELECT p.sku, p.name,
            pc.name AS category,
            COALESCE(SUM(sm.quantity * sm.direction), 0)::int AS current_qty,
            COALESCE(pcost.weighted_avg_cost, p.cost_price)::numeric AS unit_cost,
            (COALESCE(SUM(sm.quantity * sm.direction), 0)
             * COALESCE(pcost.weighted_avg_cost, p.cost_price))::numeric AS cost_value,
            (COALESCE(SUM(sm.quantity * sm.direction), 0)
             * p.selling_price)::numeric AS retail_value
     FROM products p
     LEFT JOIN product_categories pc ON pc.category_id = p.category_id
     LEFT JOIN stock_movements sm ON sm.product_id = p.product_id
     LEFT JOIN product_cost pcost ON pcost.product_id = p.product_id
     WHERE p.is_deleted = false AND p.is_active = true
     GROUP BY p.sku, p.name, pc.name, p.cost_price, p.selling_price, pcost.weighted_avg_cost
     HAVING COALESCE(SUM(sm.quantity * sm.direction), 0) > 0
     ORDER BY cost_value DESC`,
  );
  return rows;
}

async function getStockMovements(
  client,
  { startDate, endDate, productId, movementType },
) {
  const { rows } = await client.query(
    `SELECT sm.performed_at, p.sku, p.name AS product_name,
            sm.movement_type, sm.quantity, sm.direction,
            sm.unit_cost, sm.reference_type, sm.notes,
            u.email AS performed_by_email
     FROM stock_movements sm
     JOIN products p ON p.product_id = sm.product_id
     LEFT JOIN shared.users u ON u.user_id = sm.performed_by
     WHERE sm.performed_at BETWEEN $1 AND $2
       AND ($3::UUID IS NULL OR sm.product_id = $3)
       AND ($4::TEXT IS NULL OR sm.movement_type = $4)
     ORDER BY sm.performed_at DESC
     LIMIT 5000`,
    [startDate, endDate, productId || null, movementType || null],
  );
  return rows;
}

async function getLowStockItems(client) {
  const { rows } = await client.query(
    `SELECT p.sku, p.name, p.reorder_level,
            pc.name AS category,
            COALESCE(SUM(sm.quantity * sm.direction), 0)::int AS current_qty
     FROM products p
     LEFT JOIN product_categories pc ON pc.category_id = p.category_id
     LEFT JOIN stock_movements sm ON sm.product_id = p.product_id
     WHERE p.is_deleted = false AND p.is_active = true
     GROUP BY p.sku, p.name, p.reorder_level, pc.name
     HAVING COALESCE(SUM(sm.quantity * sm.direction), 0) <= p.reorder_level
     ORDER BY (COALESCE(SUM(sm.quantity * sm.direction), 0) - p.reorder_level) ASC`,
  );
  return rows;
}

// ── PAYROLL REPORTS ──────────────────────────────────────────

async function getPayrollSummary(client, { startDate, endDate }) {
  // Schema note: a payroll run is identified by run_id and dated by
  // period_month/period_year (not period_start/period_end). Per-staff
  // figures live in `payslips`, not a "payroll_items" table.
  const { rows } = await client.query(
    `SELECT pr.run_id                                         AS payroll_id,
            pr.run_number,
            make_date(pr.period_year, pr.period_month, 1)     AS period_start,
            (make_date(pr.period_year, pr.period_month, 1)
              + INTERVAL '1 month' - INTERVAL '1 day')::date  AS period_end,
            pr.status,
            COUNT(ps.payslip_id)::int                  AS staff_count,
            COALESCE(SUM(ps.gross_salary), 0)          AS total_gross,
            COALESCE(SUM(ps.paye_deduction), 0)        AS total_paye,
            COALESCE(SUM(ps.pension_employee), 0)      AS total_pension,
            COALESCE(SUM(ps.nhf_deduction), 0)         AS total_nhf,
            COALESCE(SUM(ps.net_salary), 0)            AS total_net
     FROM payroll_runs pr
     LEFT JOIN payslips ps ON ps.run_id = pr.run_id
     WHERE make_date(pr.period_year, pr.period_month, 1) BETWEEN $1 AND $2
     GROUP BY pr.run_id
     ORDER BY pr.period_year DESC, pr.period_month DESC`,
    [startDate, endDate],
  );
  return rows;
}

async function getStaffPayrollDetail(client, { payrollId }) {
  // payrollId is the payroll_runs.run_id. Per-staff figures come from
  // `payslips` joined to staff_profiles → contacts for names.
  const { rows } = await client.query(
    `SELECT c.display_name AS staff_name,
            sp.employee_number, sp.job_title, sp.department,
            ps.gross_salary AS gross_pay,
            (ps.housing_allowance + ps.transport_allowance
              + ps.other_allowances)            AS allowances,
            ps.paye_deduction AS paye,
            ps.pension_employee, ps.pension_employer,
            ps.nhf_deduction AS nhf,
            ps.other_deductions,
            ps.net_salary AS net_pay
     FROM payslips ps
     JOIN shared.staff_profiles sp ON sp.profile_id = ps.profile_id
     JOIN shared.contacts c        ON c.contact_id = sp.contact_id
     WHERE ps.run_id = $1
     ORDER BY c.display_name ASC`,
    [payrollId],
  );
  return rows;
}

// ── DELIVERY REPORTS ─────────────────────────────────────────

async function getDeliveryPerformance(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT d.delivery_number, d.courier, d.status,
            c.display_name AS customer,
            d.created_at, d.dispatched_at, d.delivered_at,
            EXTRACT(EPOCH FROM (d.delivered_at - d.dispatched_at)) / 3600
              AS hours_in_transit,
            d.delivery_fee
     FROM deliveries d
     JOIN shared.contacts c ON c.contact_id = d.contact_id
     WHERE d.created_at BETWEEN $1 AND $2
     ORDER BY d.created_at DESC`,
    [startDate, endDate],
  );
  return rows;
}

async function getDeliveriesByCourier(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT d.courier,
            COUNT(*)::int                                       AS total,
            COUNT(*) FILTER (WHERE d.status = 'delivered')::int AS delivered,
            COUNT(*) FILTER (WHERE d.status = 'failed')::int    AS failed,
            COUNT(*) FILTER (WHERE d.status = 'returned')::int  AS returned,
            AVG(EXTRACT(EPOCH FROM (d.delivered_at - d.dispatched_at)) / 3600)
              AS avg_hours_in_transit,
            COALESCE(SUM(d.delivery_fee), 0)                    AS total_fees
     FROM deliveries d
     WHERE d.created_at BETWEEN $1 AND $2
     GROUP BY d.courier
     ORDER BY total DESC`,
    [startDate, endDate],
  );
  return rows;
}

// ── SAVED REPORTS ────────────────────────────────────────────
// A saved report is a stored report configuration (type + filters +
// columns + sort) that a user can re-run later. Owned by a user;
// optionally shared with the rest of the business via is_shared.

async function listSavedReports(client, userId) {
  // A user sees their own reports plus any shared ones.
  const { rows } = await client.query(
    `SELECT report_id, created_by, report_name, report_type,
            filters, columns, sort_config, is_shared, schedule,
            created_at, updated_at
     FROM saved_reports
     WHERE created_by = $1 OR is_shared = true
     ORDER BY report_name`,
    [userId],
  );
  return rows;
}

async function findSavedReportById(client, reportId) {
  const {
    rows: [row],
  } = await client.query(`SELECT * FROM saved_reports WHERE report_id = $1`, [
    reportId,
  ]);
  return row || null;
}

async function insertSavedReport(
  client,
  {
    createdBy,
    reportName,
    reportType,
    filters,
    columns,
    sortConfig,
    isShared,
    schedule,
  },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO saved_reports
       (created_by, report_name, report_type, filters, columns,
        sort_config, is_shared, schedule)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8::jsonb)
     RETURNING *`,
    [
      createdBy,
      reportName,
      reportType,
      JSON.stringify(filters || {}),
      JSON.stringify(columns || []),
      JSON.stringify(sortConfig || {}),
      !!isShared,
      schedule ? JSON.stringify(schedule) : null,
    ],
  );
  return row;
}

async function updateSavedReport(client, reportId, fields) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE saved_reports SET
       report_name = COALESCE($2, report_name),
       filters     = COALESCE($3::jsonb, filters),
       columns     = COALESCE($4::jsonb, columns),
       sort_config = COALESCE($5::jsonb, sort_config),
       is_shared   = COALESCE($6, is_shared),
       schedule    = COALESCE($7::jsonb, schedule),
       updated_at  = now()
     WHERE report_id = $1
     RETURNING *`,
    [
      reportId,
      fields.reportName ?? null,
      fields.filters ? JSON.stringify(fields.filters) : null,
      fields.columns ? JSON.stringify(fields.columns) : null,
      fields.sortConfig ? JSON.stringify(fields.sortConfig) : null,
      fields.isShared ?? null,
      fields.schedule ? JSON.stringify(fields.schedule) : null,
    ],
  );
  return row || null;
}

async function deleteSavedReport(client, reportId) {
  const {
    rows: [row],
  } = await client.query(
    `DELETE FROM saved_reports WHERE report_id = $1
     RETURNING report_id, created_by`,
    [reportId],
  );
  return row || null;
}

module.exports = {
  // saved reports
  listSavedReports,
  findSavedReportById,
  insertSavedReport,
  updateSavedReport,
  deleteSavedReport,
  // sales
  getSalesByPeriod,
  getSalesByProduct,
  getSalesByCustomer,
  // finance
  getProfitAndLoss,
  getOutstandingInvoices,
  getExpensesByCategory,
  // stock
  getStockValuation,
  getStockMovements,
  getLowStockItems,
  // payroll
  getPayrollSummary,
  getStaffPayrollDetail,
  // delivery
  getDeliveryPerformance,
  getDeliveriesByCourier,
  // saved reports
  listSavedReports,
  findSavedReportById,
  insertSavedReport,
  updateSavedReport,
  deleteSavedReport,
};
