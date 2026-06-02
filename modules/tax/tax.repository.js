"use strict";

// ── tax.repository.js ─────────────────────────────────────────────────────────
// All reads run inside withBusinessContext, so unqualified table names resolve
// to the active business schema (jewelry / diffusers). Tax figures are derived
// ONLY from posted, non-reversed journal lines — the ledger is the single source
// of truth, so what the finance person verifies always ties back to the books.

// Net debit/credit totals per account code over a date range.
async function getAccountFlows(client, codes, start, end) {
  const { rows } = await client.query(
    `SELECT coa.account_code,
            coa.account_name,
            COALESCE(SUM(jl.debit), 0)  AS debit,
            COALESCE(SUM(jl.credit), 0) AS credit
       FROM journal_lines jl
       JOIN journal_entries je   ON je.entry_id   = jl.entry_id
       JOIN chart_of_accounts coa ON coa.account_id = jl.account_id
      WHERE je.entry_date BETWEEN $1 AND $2
        AND je.is_reversed = false
        AND coa.account_code = ANY($3)
      GROUP BY coa.account_code, coa.account_name`,
    [start, end, codes],
  );
  return rows;
}

// Entry-level detail for the workpaper (drill-down).
async function getAccountLines(client, codes, start, end) {
  const { rows } = await client.query(
    `SELECT je.entry_date, je.entry_number, je.description, je.reference_type,
            coa.account_code, coa.account_name,
            jl.debit, jl.credit
       FROM journal_lines jl
       JOIN journal_entries je   ON je.entry_id   = jl.entry_id
       JOIN chart_of_accounts coa ON coa.account_id = jl.account_id
      WHERE je.entry_date BETWEEN $1 AND $2
        AND je.is_reversed = false
        AND coa.account_code = ANY($3)
      ORDER BY je.entry_date, je.entry_number`,
    [start, end, codes],
  );
  return rows;
}

// Income/expense grouped by subtype — the basis for the CIT computation.
async function getPnlBySubtype(client, start, end) {
  const { rows } = await client.query(
    `SELECT coa.account_type,
            coa.account_subtype,
            coa.account_code,
            coa.account_name,
            COALESCE(SUM(jl.credit - jl.debit), 0) AS net_credit
       FROM journal_lines jl
       JOIN journal_entries je   ON je.entry_id   = jl.entry_id
       JOIN chart_of_accounts coa ON coa.account_id = jl.account_id
      WHERE je.entry_date BETWEEN $1 AND $2
        AND je.is_reversed = false
        AND coa.account_type IN ('income','expense')
      GROUP BY coa.account_type, coa.account_subtype, coa.account_code, coa.account_name
      ORDER BY coa.account_code`,
    [start, end],
  );
  return rows;
}

// Count campaign/store orders in the period that never produced a journal —
// surfaced as a data-quality warning so figures aren't silently understated.
async function countUnpostedCampaignOrders(client, start, end) {
  try {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM campaign_orders co
        WHERE co.status IN ('confirmed','completed')
          AND co.created_at::date BETWEEN $1 AND $2
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries je
             WHERE je.reference_id = co.order_id
               AND je.reference_type IN ('campaign_order','campaign_sale')
          )`,
      [start, end],
    );
    return rows[0]?.n || 0;
  } catch {
    return 0; // table may not exist in every schema — non-fatal
  }
}

// ── Tax profile ───────────────────────────────────────────────────────────────

async function getProfile(client) {
  const {
    rows: [p],
  } = await client.query(`SELECT * FROM tax_profile LIMIT 1`);
  return p || null;
}

async function updateProfile(client, fields) {
  const allowed = [
    "legal_name",
    "tin",
    "tax_state",
    "vat_registered",
    "fiscal_year_end_month",
    "is_small_company",
    "small_co_turnover_cap",
    "cit_rate",
    "dev_levy_rate",
  ];
  const sets = [],
    values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }
  if (!sets.length) return getProfile(client);
  sets.push(`updated_at = now()`);
  const {
    rows: [p],
  } = await client.query(
    `UPDATE tax_profile SET ${sets.join(", ")} RETURNING *`,
    values,
  );
  return p;
}

// ── Filings ───────────────────────────────────────────────────────────────────

async function findFilingByTypePeriod(client, taxType, periodLabel) {
  const {
    rows: [f],
  } = await client.query(
    `SELECT * FROM tax_filings WHERE tax_type = $1 AND period_label = $2`,
    [taxType, periodLabel],
  );
  return f || null;
}

async function insertFiling(client, d) {
  const {
    rows: [f],
  } = await client.query(
    `INSERT INTO tax_filings
       (filing_number, tax_type, period_label, period_start, period_end,
        status, computed_amount, adjustment_amount, final_amount, workpaper,
        notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      d.filing_number,
      d.tax_type,
      d.period_label,
      d.period_start,
      d.period_end,
      d.status || "draft",
      d.computed_amount || 0,
      d.adjustment_amount || 0,
      d.final_amount || 0,
      d.workpaper ? JSON.stringify(d.workpaper) : null,
      d.notes || null,
      d.created_by || null,
    ],
  );
  return f;
}

async function updateFiling(client, filingId, fields) {
  const allowed = [
    "status",
    "computed_amount",
    "adjustment_amount",
    "final_amount",
    "workpaper",
    "notes",
    "filing_reference",
    "filed_at",
    "filed_by",
    "settlement_entry_id",
    "paid_at",
  ];
  const sets = [],
    values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(
        key === "workpaper" ? JSON.stringify(fields[key]) : fields[key],
      );
      sets.push(`${key} = $${values.length}`);
    }
  }
  if (!sets.length) return findFilingById(client, filingId);
  sets.push(`updated_at = now()`);
  values.push(filingId);
  const {
    rows: [f],
  } = await client.query(
    `UPDATE tax_filings SET ${sets.join(", ")} WHERE filing_id = $${values.length} RETURNING *`,
    values,
  );
  return f || null;
}

async function findFilingById(client, filingId) {
  const {
    rows: [f],
  } = await client.query(`SELECT * FROM tax_filings WHERE filing_id = $1`, [
    filingId,
  ]);
  return f || null;
}

async function listFilings(client, { taxType, year } = {}) {
  const { rows } = await client.query(
    `SELECT filing_id, filing_number, tax_type, period_label, period_start,
            period_end, status, computed_amount, adjustment_amount, final_amount,
            filing_reference, filed_at, paid_at, created_at
       FROM tax_filings
      WHERE ($1::TEXT IS NULL OR tax_type = $1)
        AND ($2::INT  IS NULL OR EXTRACT(YEAR FROM period_end) = $2)
      ORDER BY period_end DESC, tax_type`,
    [taxType || null, year || null],
  );
  return rows;
}

async function addAdjustment(client, d) {
  const {
    rows: [a],
  } = await client.query(
    `INSERT INTO tax_filing_adjustments (filing_id, label, amount, reason, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [d.filing_id, d.label, d.amount, d.reason || null, d.created_by || null],
  );
  return a;
}

async function listAdjustments(client, filingId) {
  const { rows } = await client.query(
    `SELECT * FROM tax_filing_adjustments WHERE filing_id = $1 ORDER BY created_at`,
    [filingId],
  );
  return rows;
}

async function sumAdjustments(client, filingId) {
  const {
    rows: [r],
  } = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM tax_filing_adjustments WHERE filing_id = $1`,
    [filingId],
  );
  return parseFloat(r.total);
}

module.exports = {
  getAccountFlows,
  getAccountLines,
  getPnlBySubtype,
  countUnpostedCampaignOrders,
  getProfile,
  updateProfile,
  findFilingByTypePeriod,
  insertFiling,
  updateFiling,
  findFilingById,
  listFilings,
  addAdjustment,
  listAdjustments,
  sumAdjustments,
};
