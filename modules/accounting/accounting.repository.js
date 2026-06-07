"use strict";

async function findAccounts(client, { type, active }) {
  const { rows } = await client.query(
    `SELECT account_id, account_code, account_name, account_type,
            account_subtype, parent_account_id, is_system, is_active
     FROM chart_of_accounts
     WHERE ($1::TEXT IS NULL OR account_type=$1)
       AND ($2::BOOLEAN IS NULL OR is_active=$2)
     ORDER BY account_code`,
    [type || null, active !== undefined ? active === "true" : null],
  );
  return rows;
}

async function findAccountById(client, accountId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM chart_of_accounts WHERE account_id = $1`,
    [accountId],
  );
  return row || null;
}

async function findAccountByCode(client, accountCode) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT account_id, account_code, is_system FROM chart_of_accounts
     WHERE account_code = $1 LIMIT 1`,
    [accountCode],
  );
  return row || null;
}

async function insertAccount(
  client,
  {
    accountCode,
    accountName,
    accountType,
    accountSubtype,
    parentAccountId,
    description,
  },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO chart_of_accounts
       (account_code, account_name, account_type, account_subtype,
        parent_account_id, description, is_system)
     VALUES ($1, $2, $3, $4, $5, $6, false)
     RETURNING *`,
    [
      accountCode,
      accountName,
      accountType,
      accountSubtype || null,
      parentAccountId || null,
      description || null,
    ],
  );
  return row;
}

async function updateAccount(client, accountId, fields) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE chart_of_accounts SET
       account_code      = COALESCE($2, account_code),
       account_name      = COALESCE($3, account_name),
       account_type      = COALESCE($4, account_type),
       account_subtype   = COALESCE($5, account_subtype),
       parent_account_id = COALESCE($6, parent_account_id),
       description       = COALESCE($7, description),
       is_active         = COALESCE($8, is_active)
     WHERE account_id = $1
     RETURNING *`,
    [
      accountId,
      fields.accountCode ?? null,
      fields.accountName ?? null,
      fields.accountType ?? null,
      fields.accountSubtype ?? null,
      fields.parentAccountId ?? null,
      fields.description ?? null,
      fields.isActive ?? null,
    ],
  );
  return row || null;
}

async function findJournals(
  client,
  { startDate, endDate, referenceType, limit, offset },
) {
  const { rows } = await client.query(
    `SELECT je.entry_id, je.entry_number, je.entry_date, je.description,
            je.reference_type, je.reference_id, je.is_reversed,
            COALESCE(SUM(jl.debit),0) AS total_debit
     FROM journal_entries je
     LEFT JOIN journal_lines jl ON jl.entry_id=je.entry_id
     WHERE ($1::DATE IS NULL OR je.entry_date>=$1)
       AND ($2::DATE IS NULL OR je.entry_date<=$2)
       AND ($3::TEXT IS NULL OR je.reference_type=$3)
     GROUP BY je.entry_id
     ORDER BY je.entry_date DESC, je.posted_at DESC
     LIMIT $4 OFFSET $5`,
    [startDate || null, endDate || null, referenceType || null, limit, offset],
  );
  return rows;
}

async function findJournalById(client, entryId) {
  const {
    rows: [entry],
  } = await client.query(
    `SELECT je.*,
            json_agg(json_build_object(
              'line_id',jl.line_id,'account_id',jl.account_id,
              'account_code',coa.account_code,
              'account_name',coa.account_name,'account_type',coa.account_type,
              'debit',jl.debit,'credit',jl.credit,'description',jl.description
            ) ORDER BY jl.line_id) AS lines
     FROM journal_entries je
     LEFT JOIN journal_lines jl  ON jl.entry_id=je.entry_id
     LEFT JOIN chart_of_accounts coa ON coa.account_id=jl.account_id
     WHERE je.entry_id=$1 GROUP BY je.entry_id`,
    [entryId],
  );
  return entry || null;
}

async function insertJournalEntry(
  client,
  { entryDate, description, referenceType, referenceId, periodId, postedBy },
) {
  const {
    rows: [entry],
  } = await client.query(
    `INSERT INTO journal_entries
       (entry_number, entry_date, description, reference_type, reference_id, fiscal_period_id, posted_by)
     VALUES ('JE-M-'||to_char(now(),'YYYYMMDD-HH24MISS'), $1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      entryDate,
      description,
      referenceType || "manual",
      referenceId || null,
      periodId || null,
      postedBy,
    ],
  );
  return entry;
}

async function insertJournalLine(
  client,
  { entryId, accountId, debit, credit, description, contactId },
) {
  await client.query(
    `INSERT INTO journal_lines (entry_id, account_id, debit, credit, description, contact_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      entryId,
      accountId,
      debit || 0,
      credit || 0,
      description || null,
      contactId || null,
    ],
  );
}

async function findActivePeriod(client, date) {
  const {
    rows: [p],
  } = await client.query(
    `SELECT period_id FROM fiscal_periods
     WHERE $1 BETWEEN start_date AND end_date AND is_closed=false LIMIT 1`,
    [date],
  );
  return p || null;
}

async function findBankStatements(
  client,
  { bankAccountId, reconciled, limit },
) {
  const { rows } = await client.query(
    `SELECT bs.*, ba.bank_name, ba.account_name
     FROM bank_statements bs
     JOIN shared.bank_accounts ba ON ba.account_id=bs.bank_account_id
     WHERE ($1::UUID IS NULL OR bs.bank_account_id=$1)
       AND ($2::BOOLEAN IS NULL OR bs.is_reconciled=$2)
     ORDER BY bs.transaction_date DESC LIMIT $3`,
    [
      bankAccountId || null,
      reconciled !== undefined ? reconciled === "true" : null,
      limit || 200,
    ],
  );
  return rows;
}

async function reconcileStatement(client, { statementId, paymentId }) {
  await client.query(
    `UPDATE bank_statements
     SET is_reconciled=true, matched_payment_id=$1, matched_at=now()
     WHERE statement_id=$2`,
    [paymentId, statementId],
  );
}

// Added: needed by reconciliation.service.getReconciliationSummary
async function getReconciliationSummary(client, bankAccountId) {
  const {
    rows: [summary],
  } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE is_reconciled=false)            AS unreconciled_count,
       COALESCE(SUM(ABS(amount)) FILTER (WHERE is_reconciled=false), 0) AS unreconciled_value,
       COUNT(*) FILTER (WHERE is_reconciled=true)             AS reconciled_count,
       MAX(transaction_date)                                  AS last_statement_date
     FROM bank_statements
     WHERE bank_account_id=$1`,
    [bankAccountId],
  );
  return summary;
}

async function findFiscalPeriods(client) {
  const { rows } = await client.query(
    `SELECT period_id, name, period_type, start_date, end_date, is_closed
     FROM fiscal_periods ORDER BY start_date DESC`,
  );
  return rows;
}

async function closeFiscalPeriod(client, { periodId, userId }) {
  const {
    rows: [p],
  } = await client.query(
    `UPDATE fiscal_periods SET is_closed=true, closed_by=$1, closed_at=now()
     WHERE period_id=$2 AND is_closed=false RETURNING *`,
    [userId, periodId],
  );
  return p || null;
}

async function getPLData(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT coa.account_type, coa.account_subtype, coa.account_code, coa.account_name,
            COALESCE(SUM(
              CASE WHEN coa.account_type='income'  THEN jl.credit - jl.debit
                   WHEN coa.account_type='expense' THEN jl.debit  - jl.credit
                   ELSE 0 END
            ),0) AS balance
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl.account_id=coa.account_id
     LEFT JOIN journal_entries je ON je.entry_id=jl.entry_id
       AND je.entry_date BETWEEN $1 AND $2
     WHERE coa.account_type IN ('income','expense') AND coa.is_active=true
     GROUP BY coa.account_id,coa.account_type,coa.account_subtype,coa.account_code,coa.account_name
     ORDER BY coa.account_type DESC, coa.account_code`,
    [startDate, endDate],
  );
  return rows;
}

async function getBalanceSheetData(client, { asOfDate }) {
  const { rows } = await client.query(
    `SELECT coa.account_type, coa.account_subtype, coa.account_code, coa.account_name,
            COALESCE(SUM(
              CASE WHEN coa.account_type IN ('asset','expense') THEN jl.debit-jl.credit
                   ELSE jl.credit-jl.debit END
            ),0) AS balance
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl.account_id=coa.account_id
     LEFT JOIN journal_entries je ON je.entry_id=jl.entry_id
       AND je.entry_date<=$1
     WHERE coa.account_type IN ('asset','liability','equity') AND coa.is_active=true
     GROUP BY coa.account_id,coa.account_type,coa.account_subtype,coa.account_code,coa.account_name
     ORDER BY coa.account_type, coa.account_code`,
    [asOfDate],
  );
  return rows;
}

async function getTrialBalanceData(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT coa.account_code, coa.account_name, coa.account_type,
            COALESCE(SUM(jl.debit),0) AS total_debit,
            COALESCE(SUM(jl.credit),0) AS total_credit
     FROM chart_of_accounts coa
     LEFT JOIN journal_lines jl ON jl.account_id=coa.account_id
     LEFT JOIN journal_entries je ON je.entry_id=jl.entry_id
       AND je.entry_date BETWEEN $1 AND $2
     WHERE coa.is_active=true
     GROUP BY coa.account_id,coa.account_code,coa.account_name,coa.account_type
     HAVING COALESCE(SUM(jl.debit),0)!=0 OR COALESCE(SUM(jl.credit),0)!=0
     ORDER BY coa.account_code`,
    [startDate, endDate],
  );
  return rows;
}

// Accounting dashboard: month-to-date P&L, cash position (12xx bank/cash
// accounts), unreconciled bank items, and the current open fiscal period.
async function getDashboardData(client) {
  const {
    rows: [pl],
  } = await client.query(
    `SELECT
       COALESCE(SUM(CASE WHEN coa.account_type='income'  THEN jl.credit-jl.debit ELSE 0 END),0) AS revenue_mtd,
       COALESCE(SUM(CASE WHEN coa.account_type='expense' THEN jl.debit-jl.credit ELSE 0 END),0) AS expenses_mtd
     FROM journal_lines jl
     JOIN journal_entries je    ON je.entry_id=jl.entry_id
     JOIN chart_of_accounts coa ON coa.account_id=jl.account_id
     WHERE coa.account_type IN ('income','expense')
       AND date_trunc('month', je.entry_date) = date_trunc('month', CURRENT_DATE)`,
  );
  const {
    rows: [cash],
  } = await client.query(
    `SELECT COALESCE(SUM(jl.debit-jl.credit),0) AS cash_position
     FROM journal_lines jl
     JOIN chart_of_accounts coa ON coa.account_id=jl.account_id
     WHERE coa.account_type='asset' AND coa.account_code LIKE '12%'`,
  );
  const {
    rows: [recon],
  } = await client.query(
    `SELECT COUNT(*)::int AS unreconciled_count
     FROM bank_statements WHERE is_reconciled = false`,
  );
  const {
    rows: [period],
  } = await client.query(
    `SELECT period_id, name, start_date, end_date
     FROM fiscal_periods
     WHERE is_closed = false AND CURRENT_DATE BETWEEN start_date AND end_date
     ORDER BY start_date DESC LIMIT 1`,
  );
  return { pl, cash, recon, period: period || null };
}

// Cash-flow source data. opening_cash is the cash/bank balance before the
// period; `items` are the period's cash movements grouped by the contra
// account and bucketed into operating / investing / financing. For every
// cash-touching entry, a contra line's effect on cash is (credit − debit),
// because a balanced entry's cash delta equals the negative of its contras.
async function getCashFlowData(client, { startDate, endDate }) {
  const {
    rows: [opening],
  } = await client.query(
    `SELECT COALESCE(SUM(jl.debit-jl.credit),0) AS opening_cash
     FROM journal_lines jl
     JOIN journal_entries je    ON je.entry_id=jl.entry_id
     JOIN chart_of_accounts coa ON coa.account_id=jl.account_id
     WHERE coa.account_type='asset' AND coa.account_code LIKE '12%'
       AND je.entry_date < $1`,
    [startDate],
  );
  const { rows: items } = await client.query(
    `WITH cash_entries AS (
       SELECT DISTINCT je.entry_id
       FROM journal_lines jl
       JOIN chart_of_accounts coa ON coa.account_id=jl.account_id
       JOIN journal_entries je    ON je.entry_id=jl.entry_id
       WHERE coa.account_type='asset' AND coa.account_code LIKE '12%'
         AND je.entry_date BETWEEN $1 AND $2
     )
     SELECT
       CASE
         WHEN coa.account_subtype='fixed_asset' THEN 'investing'
         WHEN coa.account_type='equity'
              OR coa.account_subtype='long_term_liability' THEN 'financing'
         ELSE 'operating'
       END                                       AS category,
       coa.account_name                          AS label,
       COALESCE(SUM(jl.credit - jl.debit),0)::numeric AS amount
     FROM journal_lines jl
     JOIN chart_of_accounts coa ON coa.account_id=jl.account_id
     JOIN cash_entries ce       ON ce.entry_id=jl.entry_id
     WHERE NOT (coa.account_type='asset' AND coa.account_code LIKE '12%')
     GROUP BY category, coa.account_name
     HAVING COALESCE(SUM(jl.credit - jl.debit),0) <> 0
     ORDER BY category, amount DESC`,
    [startDate, endDate],
  );
  return { opening_cash: opening.opening_cash, items };
}

// Per-account general ledger: every journal line that touched the
// account, oldest-first, with a running balance (debit − credit).
async function getAccountLedger(client, { accountId, startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT je.entry_id, je.entry_number, je.entry_date,
            coa.account_code, coa.account_name,
            jl.description,
            jl.debit, jl.credit,
            SUM(jl.debit - jl.credit) OVER (
              ORDER BY je.entry_date, je.posted_at, jl.line_id
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
            ) AS running_balance
     FROM journal_lines jl
     JOIN journal_entries je    ON je.entry_id = jl.entry_id
     JOIN chart_of_accounts coa ON coa.account_id = jl.account_id
     WHERE jl.account_id = $1
       AND ($2::DATE IS NULL OR je.entry_date >= $2)
       AND ($3::DATE IS NULL OR je.entry_date <= $3)
     ORDER BY je.entry_date, je.posted_at, jl.line_id`,
    [accountId, startDate || null, endDate || null],
  );
  return rows;
}

module.exports = {
  findAccounts,
  findAccountById,
  findAccountByCode,
  getAccountLedger,
  getDashboardData,
  getCashFlowData,
  insertAccount,
  updateAccount,
  findJournals,
  findJournalById,
  insertJournalEntry,
  insertJournalLine,
  findActivePeriod,
  findBankStatements,
  reconcileStatement,
  getReconciliationSummary,
  findFiscalPeriods,
  closeFiscalPeriod,
  getPLData,
  getBalanceSheetData,
  getTrialBalanceData,
};
