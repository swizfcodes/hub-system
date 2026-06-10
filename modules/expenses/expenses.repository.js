"use strict";

async function findAll(client, { profileId, status, category, limit, offset }) {
  const { rows } = await client.query(
    `SELECT e.expense_id, e.expense_number, e.expense_type, e.category,
            e.amount, e.amount_paid, (e.amount - e.amount_paid) AS balance,
            e.currency, e.description, e.expense_date, e.status,
            e.vendor_name, e.vendor_contact_id, e.auto_approved,
            e.approved_at, e.paid_at, e.created_at,
            sp.employee_number,
            COALESCE(c.display_name, e.vendor_name) AS staff_name,
            COUNT(*) OVER() AS total_count
     FROM expenses e
     LEFT JOIN shared.staff_profiles sp ON sp.profile_id = e.profile_id
     LEFT JOIN shared.contacts c ON c.contact_id = sp.contact_id
     WHERE ($1::UUID IS NULL OR e.profile_id = $1)
       AND ($2::TEXT IS NULL OR e.status = $2)
       AND ($3::TEXT IS NULL OR e.category = $3)
     ORDER BY e.created_at DESC
     LIMIT $4 OFFSET $5`,
    [profileId || null, status || null, category || null, limit, offset],
  );
  const total = rows.length ? parseInt(rows[0].total_count, 10) : 0;
  return {
    rows: rows.map(({ total_count: _t, ...r }) => r),
    total,
  };
}

async function findById(client, expenseId) {
  const {
    rows: [expense],
  } = await client.query(
    `SELECT e.*,
            (e.amount - e.amount_paid) AS balance,
            sp.employee_number,
            COALESCE(c.display_name, e.vendor_name) AS staff_name
     FROM expenses e
     LEFT JOIN shared.staff_profiles sp ON sp.profile_id = e.profile_id
     LEFT JOIN shared.contacts c ON c.contact_id = sp.contact_id
     WHERE e.expense_id = $1`,
    [expenseId],
  );
  if (!expense) return null;

  const { rows: receipts } = await client.query(
    `SELECT er.receipt_id, er.document_id, er.receipt_date,
            er.merchant_name, er.amount_on_receipt, er.created_at AS uploaded_at,
            d.title AS file_name, d.mime_type, d.file_size_bytes AS file_size
     FROM expense_receipts er
     JOIN shared.documents d ON d.document_id = er.document_id
     WHERE er.expense_id = $1
     ORDER BY er.created_at DESC`,
    [expenseId],
  );

  const { rows: payments } = await client.query(
    `SELECT ep.*, COALESCE(uc.display_name, u.email) AS recorded_by_name
     FROM expense_payments ep
     LEFT JOIN shared.users u ON u.user_id = ep.recorded_by
     LEFT JOIN shared.staff_profiles usp ON usp.profile_id = u.staff_profile_id
     LEFT JOIN shared.contacts uc ON uc.contact_id = usp.contact_id
     WHERE ep.expense_id = $1
     ORDER BY ep.payment_date ASC, ep.created_at ASC`,
    [expenseId],
  );

  return { ...expense, receipts, payments };
}

async function insert(client, data) {
  const {
    rows: [expense],
  } = await client.query(
    `INSERT INTO expenses
       (expense_number, profile_id, expense_type, category, amount,
        currency, description, expense_date, status,
        vendor_name, vendor_contact_id, submitted_by, auto_approved,
        receipt_document_id, linked_advance_id, approved_by, approved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
             CASE WHEN $9 = 'approved' THEN now() ELSE NULL END)
     RETURNING *, (amount - amount_paid) AS balance`,
    [
      data.expense_number,
      data.profile_id || null,
      data.expense_type || "reimbursement",
      data.category,
      data.amount,
      data.currency || "NGN",
      data.description,
      data.expense_date,
      data.status || "pending",
      data.vendor_name || null,
      data.vendor_contact_id || null,
      data.submitted_by || null,
      data.auto_approved || false,
      data.receipt_document_id || null,
      data.linked_advance_id || null,
      data.status === "approved" ? data.submitted_by || null : null,
    ],
  );
  return expense;
}

async function updateStatus(
  client,
  expenseId,
  { status, approvedBy, rejectionReason },
) {
  const {
    rows: [expense],
  } = await client.query(
    `UPDATE expenses
     SET status = $1,
         approved_by      = CASE WHEN $1 IN ('approved','paid') THEN $2 ELSE approved_by END,
         approved_at      = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END,
         rejection_reason = CASE WHEN $1 = 'rejected'  THEN $3 ELSE rejection_reason END,
         paid_at          = CASE WHEN $1 = 'paid'      THEN now() ELSE paid_at END,
         updated_at       = now()
     WHERE expense_id = $4
     RETURNING *, (amount - amount_paid) AS balance`,
    [status, approvedBy || null, rejectionReason || null, expenseId],
  );
  return expense || null;
}

async function insertPayment(client, data) {
  const {
    rows: [payment],
  } = await client.query(
    `INSERT INTO expense_payments
       (expense_id, amount, payment_date, method, reference, notes, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      data.expense_id,
      data.amount,
      data.payment_date || new Date().toISOString().slice(0, 10),
      data.method || "bank_transfer",
      data.reference || null,
      data.notes || null,
      data.recorded_by || null,
    ],
  );
  return payment;
}

async function applyPaymentRollup(client, expenseId) {
  const {
    rows: [expense],
  } = await client.query(
    `UPDATE expenses e
     SET amount_paid = pay.total,
         status  = CASE
                     WHEN pay.total >= e.amount THEN 'paid'
                     WHEN pay.total > 0         THEN 'partially_paid'
                     ELSE e.status
                   END,
         paid_at = CASE WHEN pay.total >= e.amount AND e.paid_at IS NULL THEN now() ELSE e.paid_at END,
         updated_at = now()
     FROM (
       SELECT COALESCE(SUM(amount), 0) AS total
       FROM expense_payments WHERE expense_id = $1
     ) pay
     WHERE e.expense_id = $1
     RETURNING e.*, (e.amount - e.amount_paid) AS balance`,
    [expenseId],
  );
  return expense || null;
}

async function insertReceipt(client, data) {
  const {
    rows: [receipt],
  } = await client.query(
    `INSERT INTO expense_receipts
       (expense_id, document_id, receipt_date, merchant_name, amount_on_receipt)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [
      data.expense_id,
      data.document_id,
      data.receipt_date || null,
      data.merchant_name || null,
      data.amount_on_receipt || null,
    ],
  );
  return receipt;
}

async function kpis(client, { profileId }) {
  const {
    rows: [totals],
  } = await client.query(
    `SELECT
       COALESCE(SUM(amount_paid) FILTER (
         WHERE date_trunc('month', COALESCE(paid_at, updated_at)) = date_trunc('month', now())
           AND status IN ('paid','partially_paid')), 0)          AS paid_this_month,
       COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending_amount,
       COUNT(*)              FILTER (WHERE status = 'pending')    AS pending_count,
       COALESCE(SUM(amount - amount_paid) FILTER (
         WHERE expense_type = 'reimbursement'
           AND status IN ('approved','partially_paid')), 0)       AS reimbursements_outstanding
     FROM expenses
     WHERE ($1::UUID IS NULL OR profile_id = $1)`,
    [profileId || null],
  );

  const { rows: byCategory } = await client.query(
    `SELECT category, SUM(amount)::NUMERIC(14,2) AS total
     FROM expenses
     WHERE status IN ('approved','partially_paid','paid')
       AND date_trunc('month', expense_date) = date_trunc('month', now())
       AND ($1::UUID IS NULL OR profile_id = $1)
     GROUP BY category
     ORDER BY total DESC`,
    [profileId || null],
  );

  return {
    paid_this_month: parseFloat(totals.paid_this_month),
    pending_amount: parseFloat(totals.pending_amount),
    pending_count: parseInt(totals.pending_count, 10),
    reimbursements_outstanding: parseFloat(totals.reimbursements_outstanding),
    top_category_this_month: byCategory[0]?.category || null,
    spend_by_category: byCategory.map((r) => ({
      category: r.category,
      total: parseFloat(r.total),
    })),
  };
}

async function findAdvances(client, { profileId, status }) {
  const { rows } = await client.query(
    `SELECT ca.*, c.display_name AS staff_name
     FROM cash_advances ca
     JOIN shared.staff_profiles sp ON sp.profile_id = ca.profile_id
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     WHERE ($1::UUID IS NULL OR ca.profile_id = $1)
       AND ($2::TEXT IS NULL OR ca.status = $2)
     ORDER BY ca.created_at DESC`,
    [profileId || null, status || null],
  );
  return rows;
}

async function insertAdvance(client, data) {
  const {
    rows: [adv],
  } = await client.query(
    `INSERT INTO cash_advances
       (profile_id, purpose, amount_requested, reason, status, outstanding_balance)
     VALUES ($1,$2,$3,$4,'pending',$3)
     RETURNING *`,
    [data.profile_id, data.purpose, data.amount_requested, data.reason],
  );
  return adv;
}

async function updateAdvanceStatus(
  client,
  advanceId,
  { status, amountApproved, approvedBy },
) {
  const {
    rows: [adv],
  } = await client.query(
    `UPDATE cash_advances
     SET status          = $1,
         amount_approved = COALESCE($2, amount_approved),
         approved_by     = COALESCE($3, approved_by),
         approved_at     = CASE WHEN $1 IN ('approved','disbursed') AND approved_at IS NULL THEN now() ELSE approved_at END,
         disbursed_at    = CASE WHEN $1 = 'disbursed'  THEN now() ELSE disbursed_at END,
         outstanding_balance = CASE WHEN $1 = 'disbursed' THEN COALESCE($2, amount_requested)
                                    ELSE outstanding_balance END
     WHERE advance_id = $4 RETURNING *`,
    [status, amountApproved || null, approvedBy || null, advanceId],
  );
  return adv || null;
}

// Dashboard KPIs for the expenses landing page.
async function getKpis(client) {
  const {
    rows: [totals],
  } = await client.query(
    `SELECT
       COALESCE(SUM(amount) FILTER (
         WHERE status = 'paid'
           AND date_trunc('month', COALESCE(paid_at::date, expense_date))
               = date_trunc('month', CURRENT_DATE)), 0)          AS paid_this_month,
       COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending_amount,
       COUNT(*) FILTER (WHERE status = 'pending')::int           AS pending_count,
       COALESCE(SUM(amount) FILTER (
         WHERE expense_type = 'reimbursement' AND status = 'approved'), 0)
                                                                 AS reimbursements_outstanding
     FROM expenses`,
  );

  const { rows: byCategory } = await client.query(
    `SELECT category, COALESCE(SUM(amount), 0) AS total
     FROM expenses
     WHERE status IN ('approved', 'paid')
       AND date_trunc('month', expense_date) = date_trunc('month', CURRENT_DATE)
     GROUP BY category
     ORDER BY total DESC`,
  );

  return { totals, byCategory };
}

module.exports = {
  findAll,
  findById,
  insert,
  updateStatus,
  insertPayment,
  applyPaymentRollup,
  insertReceipt,
  kpis,
  findAdvances,
  insertAdvance,
  updateAdvanceStatus,
  getKpis,
};
