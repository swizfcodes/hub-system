"use strict";

async function getTerminals(client) {
  const { rows } = await client.query(
    `SELECT t.terminal_id, t.name, t.is_active,
            l.name AS location_name, l.location_type,
            s.session_id, s.status AS session_status,
            s.opened_by, s.opened_at, s.total_revenue
     FROM pos_terminals t
     JOIN stock_locations l ON l.location_id = t.location_id
     LEFT JOIN pos_sessions s ON s.terminal_id = t.terminal_id AND s.status = 'open'
     WHERE t.is_active = true ORDER BY t.name`,
  );
  return rows;
}

async function findTerminalById(client, terminalId) {
  const {
    rows: [row],
  } = await client.query(`SELECT * FROM pos_terminals WHERE terminal_id = $1`, [
    terminalId,
  ]);
  return row || null;
}

async function findLocationForTerminal(client, locationId) {
  // pos_terminals.location_id is NOT NULL with an FK — verify the
  // location exists before insert so we return a friendly 400 rather
  // than a raw FK violation.
  const {
    rows: [row],
  } = await client.query(
    `SELECT location_id, name FROM stock_locations
     WHERE location_id = $1 AND is_active = true`,
    [locationId],
  );
  return row || null;
}

async function insertTerminal(client, { name, locationId }) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO pos_terminals (name, location_id)
     VALUES ($1, $2)
     RETURNING *`,
    [name, locationId],
  );
  return row;
}

async function updateTerminal(
  client,
  terminalId,
  { name, locationId, isActive },
) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE pos_terminals SET
       name        = COALESCE($2, name),
       location_id = COALESCE($3, location_id),
       is_active   = COALESCE($4, is_active),
       updated_at  = now()
     WHERE terminal_id = $1
     RETURNING *`,
    [terminalId, name ?? null, locationId ?? null, isActive ?? null],
  );
  return row || null;
}

async function terminalHasOpenSession(client, terminalId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT EXISTS(
       SELECT 1 FROM pos_sessions
       WHERE terminal_id = $1 AND status = 'open'
     ) AS has_open`,
    [terminalId],
  );
  return row.has_open;
}

async function findOpenSession(client, terminalId) {
  const { rows } = await client.query(
    `SELECT session_id FROM pos_sessions WHERE terminal_id=$1 AND status='open'`,
    [terminalId],
  );
  return rows;
}

async function insertSession(client, { terminal_id, userId, opening_float }) {
  const {
    rows: [session],
  } = await client.query(
    `INSERT INTO pos_sessions (terminal_id, opened_by, opening_float) VALUES ($1,$2,$3) RETURNING *`,
    [terminal_id, userId, opening_float],
  );
  return session;
}

async function findSessionById(client, sessionId) {
  const {
    rows: [session],
  } = await client.query(
    `SELECT s.*, t.name AS terminal_name, u.email AS opened_by_email,
            COUNT(pt.transaction_id) AS transaction_count,
            COALESCE(SUM(pt.total_amount) FILTER (WHERE pt.status='completed'),0) AS session_revenue
     FROM pos_sessions s
     JOIN pos_terminals t ON t.terminal_id = s.terminal_id
     JOIN shared.users u  ON u.user_id = s.opened_by
     LEFT JOIN pos_transactions pt ON pt.session_id = s.session_id
     WHERE s.session_id = $1
     GROUP BY s.session_id, t.name, u.email`,
    [sessionId],
  );
  return session || null;
}

async function getSessionTotals(client, sessionId) {
  const {
    rows: [totals],
  } = await client.query(
    `SELECT
       COALESCE(SUM(ps.amount_ngn) FILTER (WHERE ps.payment_method='cash'),0)          AS cash_total,
       COALESCE(SUM(ps.amount_ngn) FILTER (WHERE ps.payment_method='bank_transfer'),0) AS transfer_total,
       COALESCE(SUM(ps.amount_ngn) FILTER (WHERE ps.payment_method='pos_card'),0)      AS card_total,
       COALESCE(SUM(ps.amount_ngn),0)                                                  AS total_revenue
     FROM pos_transactions pt
     JOIN pos_payment_splits ps ON ps.transaction_id = pt.transaction_id
     WHERE pt.session_id=$1 AND pt.status='completed'`,
    [sessionId],
  );
  return totals;
}

// Per-currency breakdown of any non-NGN tender taken during a session.
// Drives the report drill-down: shows the original foreign amount, the
// exchange rate the system applied, the sale date, and the NGN value it
// was reconciled at — so a "$1,000 cash" line can be traced to the rate
// and day it was booked.
async function getSessionForeignTender(client, sessionId) {
  const { rows } = await client.query(
    `SELECT ps.currency,
            ps.payment_method,
            ps.exchange_rate,
            pt.created_at::date                  AS tender_date,
            SUM(ps.amount)                       AS original_amount,
            SUM(ps.amount_ngn)                   AS ngn_amount,
            COUNT(*)                             AS split_count
     FROM pos_transactions pt
     JOIN pos_payment_splits ps ON ps.transaction_id = pt.transaction_id
     WHERE pt.session_id=$1 AND pt.status='completed'
       AND ps.currency IS NOT NULL AND ps.currency <> 'NGN'
     GROUP BY ps.currency, ps.payment_method, ps.exchange_rate,
              pt.created_at::date
     ORDER BY ps.currency, tender_date`,
    [sessionId],
  );
  return rows.map((r) => ({
    currency: r.currency,
    payment_method: r.payment_method,
    exchange_rate: parseFloat(r.exchange_rate || 0),
    tender_date: r.tender_date,
    original_amount: parseFloat(r.original_amount || 0),
    ngn_amount: parseFloat(r.ngn_amount || 0),
    split_count: parseInt(r.split_count, 10),
  }));
}

async function closeSession(
  client,
  {
    sessionId,
    userId,
    actual_cash,
    expected_cash,
    transfer_total,
    card_total,
    total_revenue,
    reconciliation_notes,
  },
) {
  const {
    rows: [session],
  } = await client.query(
    `UPDATE pos_sessions
     SET status='closed', closed_by=$1, closed_at=now(),
         actual_cash=$2, expected_cash=$3,
         total_transfers=$4, total_card=$5, total_revenue=$6,
         reconciliation_notes=$7
     WHERE session_id=$8 AND status='open' RETURNING *`,
    [
      userId,
      actual_cash,
      expected_cash,
      transfer_total,
      card_total,
      total_revenue,
      reconciliation_notes || null,
      sessionId,
    ],
  );
  return session || null;
}

async function getSessionTxCount(client, sessionId) {
  const {
    rows: [txCount],
  } = await client.query(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='voided') AS voided FROM pos_transactions WHERE session_id=$1`,
    [sessionId],
  );
  return txCount;
}

async function insertSessionSummary(
  client,
  {
    sessionId,
    total,
    voided,
    total_revenue,
    cash_total,
    card_total,
    transfer_total,
  },
) {
  await client.query(
    `INSERT INTO pos_session_summary (session_id, total_transactions, voided_transactions, total_revenue, cash_total, card_total, transfer_total) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      sessionId,
      total,
      voided,
      total_revenue,
      cash_total,
      card_total,
      transfer_total,
    ],
  );
}

async function getProductMinPrice(client, productId) {
  const {
    rows: [prod],
  } = await client.query(
    `SELECT min_selling_price FROM products WHERE product_id=$1`,
    [productId],
  );
  return prod || null;
}

async function insertDiscountApproval(
  client,
  { sessionId, productId, unitPrice, minPrice, userId },
) {
  const {
    rows: [da],
  } = await client.query(
    `INSERT INTO discount_approvals (reference_type, reference_id, product_id, requested_price, min_price, requested_by) VALUES ('pos_transaction', $1, $2, $3, $4, $5) RETURNING approval_id`,
    [sessionId, productId, unitPrice, minPrice, userId],
  );
  return da;
}

async function getManagers(client, business) {
  const { rows } = await client.query(
    `SELECT u.user_id FROM shared.users u JOIN shared.user_roles ur ON ur.user_id=u.user_id JOIN shared.roles r ON r.role_id=ur.role_id WHERE r.role_name IN ('owner','manager') AND (ur.business=$1 OR ur.business='*')`,
    [business],
  );
  return rows;
}

async function validateOpenSession(client, sessionId) {
  const {
    rows: [session],
  } = await client.query(
    `SELECT s.session_id, t.location_id
     FROM pos_sessions s
     JOIN pos_terminals t ON t.terminal_id = s.terminal_id
     WHERE s.session_id = $1 AND s.status = 'open'`,
    [sessionId],
  );
  return session || null;
}

async function insertTransaction(
  client,
  {
    txNumber,
    session_id,
    contact_id,
    userId,
    subtotal,
    discountTotal,
    vatTotal,
    totalAmount,
    totalPaid,
    change,
    fulfilment_type,
    offline_id,
    currency,
    exchange_rate,
    vat_exempt,
  },
) {
  const {
    rows: [tx],
  } = await client.query(
    `INSERT INTO pos_transactions
       (transaction_number, session_id, contact_id, served_by,
        subtotal, discount_total, vat_amount, total_amount, amount_paid,
        change_given, fulfilment_type, status, currency, exchange_rate,
        offline_id, vat_exempt)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'completed',$12,$13,$14,$15)
     RETURNING *`,
    [
      txNumber,
      session_id,
      contact_id || null,
      userId,
      subtotal,
      discountTotal,
      vatTotal,
      totalAmount,
      totalPaid,
      change,
      fulfilment_type || "walk_in",
      currency || "NGN",
      exchange_rate || null,
      offline_id || null,
      vat_exempt || false,
    ],
  );
  return tx;
}

// Idempotency lookup for offline POS sync — has this offline_id already
// been recorded as a transaction?
async function findTransactionByOfflineId(client, offlineId) {
  const {
    rows: [tx],
  } = await client.query(
    `SELECT transaction_id, transaction_number
     FROM pos_transactions WHERE offline_id = $1`,
    [offlineId],
  );
  return tx || null;
}

async function insertTransactionLine(
  client,
  {
    transaction_id,
    product_id,
    description,
    quantity,
    unit_price,
    discount_amount,
    vat,
    lineTotal,
    order,
  },
) {
  await client.query(
    `INSERT INTO pos_transaction_lines (transaction_id, product_id, description, quantity, unit_price, discount_amount, vat_amount, line_total, display_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      transaction_id,
      product_id || null,
      description,
      quantity,
      unit_price,
      discount_amount || 0,
      vat,
      lineTotal,
      order,
    ],
  );
}

async function insertPaymentSplit(
  client,
  {
    transaction_id,
    payment_method,
    amount,
    amount_ngn,
    currency,
    exchange_rate,
    reference,
    paystack_reference,
  },
) {
  await client.query(
    `INSERT INTO pos_payment_splits
       (transaction_id, payment_method, amount, amount_ngn, currency,
        exchange_rate, reference, paystack_reference, confirmed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      transaction_id,
      payment_method,
      amount,
      // Fall back to the tendered amount when no NGN-equivalent is given
      // (NGN sales) so the column is always populated.
      amount_ngn != null ? amount_ngn : amount,
      currency || "NGN",
      exchange_rate || null,
      reference || null,
      paystack_reference || null,
      payment_method !== "bank_transfer",
    ],
  );
}

async function updateSessionTotals(
  client,
  { totalAmount, transferAmt, cardAmt, session_id },
) {
  await client.query(
    `UPDATE pos_sessions SET total_revenue=$1, total_transfers=total_transfers+$2, total_card=total_card+$3 WHERE session_id=$4`,
    [totalAmount, transferAmt, cardAmt, session_id],
  );
}

async function findTransactionById(client, transactionId) {
  const {
    rows: [tx],
  } = await client.query(
    `SELECT pt.*, json_agg(DISTINCT ptl.*) FILTER (WHERE ptl.line_id IS NOT NULL) AS lines, json_agg(DISTINCT pps.*) FILTER (WHERE pps.split_id IS NOT NULL) AS payments, c.display_name AS contact_name, c.primary_phone FROM pos_transactions pt LEFT JOIN pos_transaction_lines ptl ON ptl.transaction_id = pt.transaction_id LEFT JOIN pos_payment_splits pps ON pps.transaction_id = pt.transaction_id LEFT JOIN shared.contacts c ON c.contact_id = pt.contact_id WHERE pt.transaction_id=$1 GROUP BY pt.transaction_id, c.display_name, c.primary_phone`,
    [transactionId],
  );
  return tx || null;
}

async function voidTransaction(client, { transactionId, userId, void_reason }) {
  const {
    rows: [tx],
  } = await client.query(
    `UPDATE pos_transactions SET status='voided', voided_by=$1, void_reason=$2 WHERE transaction_id=$3 AND status='completed' RETURNING *`,
    [userId, void_reason, transactionId],
  );
  return tx || null;
}

async function getTransactionProductLines(client, transactionId) {
  const { rows } = await client.query(
    `SELECT product_id, quantity FROM pos_transaction_lines WHERE transaction_id=$1 AND product_id IS NOT NULL`,
    [transactionId],
  );
  return rows;
}

async function findInvoiceByPosTransactionId(client, transactionId) {
  const {
    rows: [inv],
  } = await client.query(
    `SELECT invoice_id, invoice_number, status, total_amount, amount_paid
     FROM invoices WHERE pos_transaction_id = $1 AND is_deleted = false`,
    [transactionId],
  );
  return inv || null;
}

// Primary bank account for payment instructions on transfer invoices.
async function findPrimaryBankAccount(client, business) {
  const {
    rows: [acct],
  } = await client.query(
    `SELECT bank_name, account_name, account_number
     FROM shared.bank_accounts
     WHERE (business = $1 OR business = '*') AND is_active = true
     ORDER BY is_primary DESC NULLS LAST, created_at ASC
     LIMIT 1`,
    [business],
  );
  return acct || null;
}

module.exports = {
  getTerminals,
  findTerminalById,
  findLocationForTerminal,
  insertTerminal,
  updateTerminal,
  terminalHasOpenSession,
  findOpenSession,
  insertSession,
  findSessionById,
  getSessionTotals,
  getSessionForeignTender,
  closeSession,
  getSessionTxCount,
  insertSessionSummary,
  getProductMinPrice,
  insertDiscountApproval,
  getManagers,
  validateOpenSession,
  insertTransaction,
  findTransactionByOfflineId,
  insertTransactionLine,
  insertPaymentSplit,
  updateSessionTotals,
  findTransactionById,
  voidTransaction,
  getTransactionProductLines,
  findInvoiceByPosTransactionId,
  findPrimaryBankAccount,
};
