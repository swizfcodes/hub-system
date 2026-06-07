"use strict";

async function findAll(client, { profileId, status, limit, offset }) {
  const { rows } = await client.query(
    `SELECT e.expense_id, e.expense_number, e.expense_type, e.category,
            e.amount, e.currency, e.description, e.expense_date, e.status,
            e.approved_at, e.paid_at, e.created_at,
            sp.employee_number,
            c.display_name AS staff_name
     FROM expenses e
     JOIN shared.staff_profiles sp ON sp.profile_id = e.profile_id
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     WHERE ($1::UUID IS NULL OR e.profile_id = $1)
       AND ($2::TEXT IS NULL OR e.status = $2)
     ORDER BY e.created_at DESC
     LIMIT $3 OFFSET $4`,
    [profileId || null, status || null, limit, offset],
  );
  return rows;
}

async function findById(client, expenseId) {
  const {
    rows: [expense],
  } = await client.query(
    `SELECT e.*,
            sp.employee_number,
            c.display_name AS staff_name,
            json_agg(er.*) FILTER (WHERE er.receipt_id IS NOT NULL) AS receipts
     FROM expenses e
     JOIN shared.staff_profiles sp ON sp.profile_id = e.profile_id
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     LEFT JOIN expense_receipts er ON er.expense_id = e.expense_id
     WHERE e.expense_id = $1
     GROUP BY e.expense_id, sp.employee_number, c.display_name`,
    [expenseId],
  );
  return expense || null;
}

async function insert(client, data) {
  const {
    rows: [expense],
  } = await client.query(
    `INSERT INTO expenses
       (expense_number, profile_id, expense_type, category, amount,
        currency, description, expense_date, status, receipt_document_id, linked_advance_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10)
     RETURNING *`,
    [
      data.expense_number,
      data.profile_id,
      data.expense_type || "reimbursement",
      data.category,
      data.amount,
      data.currency || "NGN",
      data.description,
      data.expense_date,
      data.receipt_document_id || null,
      data.linked_advance_id || null,
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
     WHERE expense_id = $4 RETURNING *`,
    [status, approvedBy || null, rejectionReason || null, expenseId],
  );
  return expense || null;
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
         approved_at     = CASE WHEN $1 = 'approved'   THEN now() ELSE approved_at END,
         disbursed_at    = CASE WHEN $1 = 'disbursed'  THEN now() ELSE disbursed_at END,
         outstanding_balance = CASE WHEN $1 = 'disbursed' THEN COALESCE($2, amount_requested)
                                    ELSE outstanding_balance END
     WHERE advance_id = $4 RETURNING *`,
    [status, amountApproved || null, approvedBy || null, advanceId],
  );
  return adv || null;
}

module.exports = {
  findAll,
  findById,
  insert,
  updateStatus,
  findAdvances,
  insertAdvance,
  updateAdvanceStatus,
};
