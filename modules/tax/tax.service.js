"use strict";

// ── tax.service.js ────────────────────────────────────────────────────────────
// The tax engine. Every figure is derived from posted journal lines so a finance
// person can verify it against the books, adjust if needed, export the schedule,
// record the filing reference, then settle it (which auto-posts the remittance
// journal that clears the liability). Covers Nigeria 2026: VAT, WHT, PAYE, CIT.

const { withBusinessContext } = require("../../config/db");
const journalService = require("../accounting/journal.service");
const auditService = require("../../shared/audit/audit.service");
const repo = require("./tax.repository");
const logger = require("../../config/logger");

const VAT_DEFAULT_RATE = 0.075; // 7.5% — retained under the Nigeria Tax Act 2025

// ── Period helpers ──────────────────────────────────────────────────────────
function derivePeriod(periodLabel) {
  if (/^\d{4}-\d{2}$/.test(periodLabel)) {
    const [y, m] = periodLabel.split("-").map(Number);
    if (m < 1 || m > 12) throw bad("Invalid month in period");
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // last day
    return { start, end, kind: "month" };
  }
  if (/^\d{4}$/.test(periodLabel)) {
    return {
      start: `${periodLabel}-01-01`,
      end: `${periodLabel}-12-31`,
      kind: "year",
    };
  }
  throw bad("period must be 'YYYY-MM' (monthly) or 'YYYY' (annual)");
}
function bad(msg) {
  return Object.assign(new Error(msg), { status: 400 });
}
const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ── Compute (read-only) ─────────────────────────────────────────────────────

async function computeForType(client, business, taxType, periodLabel) {
  const { start, end } = derivePeriod(periodLabel);
  const base = {
    tax_type: taxType,
    period_label: periodLabel,
    period_start: start,
    period_end: end,
    currency: "NGN",
  };

  if (taxType === "VAT") return computeVat(client, business, base, start, end);
  if (taxType === "WHT") return computeWht(client, base, start, end);
  if (taxType === "PAYE") return computePaye(client, base, start, end);
  if (taxType === "CIT") return computeCit(client, base, start, end);
  throw bad(`Unsupported tax_type '${taxType}'`);
}

async function computeVat(client, business, base, start, end) {
  const flows = await repo.getAccountFlows(
    client,
    ["2210", "2220"],
    start,
    end,
  );
  const out = flows.find((f) => f.account_code === "2210");
  const inp = flows.find((f) => f.account_code === "2220");
  const output = money(out ? out.credit - out.debit : 0); // liability, credit-normal
  const input = money(inp ? inp.debit - inp.credit : 0); // recoverable, debit-normal
  const net = money(output - input);

  const lines = await repo.getAccountLines(
    client,
    ["2210", "2220"],
    start,
    end,
  );
  const warnings = await dataWarnings(client, start, end);
  if (input === 0) {
    warnings.push(
      "No input VAT recorded — purchases aren't splitting recoverable VAT (account 2220). Net VAT may be overstated.",
    );
  }

  return {
    ...base,
    computed_amount: Math.max(0, net),
    summary: {
      output_vat: output,
      input_vat: input,
      net_payable: net,
      note:
        net < 0
          ? `Net credit of ₦${Math.abs(net).toLocaleString()} carries forward`
          : null,
    },
    meta: {
      rate: VAT_DEFAULT_RATE,
      deadline: "21st of next month (NRS portal)",
    },
    lines: lines.map(fmtLine),
    warnings,
  };
}

async function computeWht(client, base, start, end) {
  const flows = await repo.getAccountFlows(
    client,
    ["2340", "1340"],
    start,
    end,
  );
  const pay = flows.find((f) => f.account_code === "2340");
  const rec = flows.find((f) => f.account_code === "1340");
  const withheld = money(pay ? pay.credit - pay.debit : 0); // we withheld → remit
  const suffered = money(rec ? rec.debit - rec.credit : 0); // suffered → CIT credit
  const lines = await repo.getAccountLines(
    client,
    ["2340", "1340"],
    start,
    end,
  );
  const warnings = [];
  if (withheld === 0) {
    warnings.push(
      "No WHT withheld this period — supplier payments aren't deducting WHT (account 2340). Required for vendors above the SME threshold.",
    );
  }
  return {
    ...base,
    computed_amount: withheld,
    summary: {
      wht_withheld_to_remit: withheld,
      wht_suffered_creditable: suffered,
    },
    meta: { deadline: "21st of next month (NRS portal)" },
    lines: lines.map(fmtLine),
    warnings,
  };
}

async function computePaye(client, base, start, end) {
  const flows = await repo.getAccountFlows(client, ["2310"], start, end);
  const paye = flows.find((f) => f.account_code === "2310");
  const amount = money(paye ? paye.credit - paye.debit : 0);
  const lines = await repo.getAccountLines(client, ["2310"], start, end);
  return {
    ...base,
    computed_amount: amount,
    summary: { paye_payable: amount },
    meta: {
      deadline: "10th of next month (Lagos LIRS e-Tax)",
      jurisdiction: "Lagos State",
    },
    lines: lines.map(fmtLine),
    warnings: [],
  };
}

async function computeCit(client, base, start, end) {
  const profile = (await repo.getProfile(client)) || {};
  const pnl = await repo.getPnlBySubtype(client, start, end);

  let revenue = 0,
    expenses = 0,
    depreciation = 0;
  const breakdown = [];
  for (const r of pnl) {
    const net = Number(r.net_credit);
    if (r.account_type === "income") revenue += net;
    else expenses += -net; // expense net_credit is negative
    if (["6700", "6710"].includes(r.account_code)) depreciation += -net; // book depreciation
    breakdown.push({
      code: r.account_code,
      name: r.account_name,
      type: r.account_type,
      amount: money(r.account_type === "income" ? net : -net),
    });
  }
  revenue = money(revenue);
  expenses = money(expenses);
  depreciation = money(depreciation);
  const accountingProfit = money(revenue - expenses);

  const cap = Number(profile.small_co_turnover_cap || 100000000);
  const smallCompany = profile.is_small_company !== false && revenue <= cap;
  const citRate = smallCompany ? 0 : Number(profile.cit_rate || 0.3);
  const levyRate = smallCompany ? 0 : Number(profile.dev_levy_rate || 0.04);

  // Assessable profit = accounting profit + book depreciation add-back − capital
  // allowances. Capital allowances are entered as a manual adjustment (we don't
  // hold a fixed-asset register yet), so we surface the add-back and flag it.
  const assessableProfitBeforeCA = money(accountingProfit + depreciation);
  const cit = money(assessableProfitBeforeCA * citRate);
  const devLevy = money(assessableProfitBeforeCA * levyRate);

  const warnings = await dataWarnings(client, start, end);
  if (depreciation > 0) {
    warnings.push(
      "Book depreciation added back; enter capital allowances as an adjustment (no fixed-asset register yet).",
    );
  }

  return {
    ...base,
    computed_amount: cit,
    summary: {
      turnover: revenue,
      accounting_profit: accountingProfit,
      depreciation_addback: depreciation,
      assessable_profit_before_capital_allowances: assessableProfitBeforeCA,
      small_company: smallCompany,
      cit_rate: citRate,
      company_income_tax: cit,
      development_levy: devLevy,
      status_note: smallCompany
        ? `Exempt — small company (turnover ₦${revenue.toLocaleString()} ≤ ₦${cap.toLocaleString()}). File a nil CIT return.`
        : `Standard company — CIT 30% + 4% development levy.`,
    },
    meta: {
      deadline: "Within 6 months of financial year-end",
      entity: profile.legal_name,
      tin: profile.tin,
    },
    lines: breakdown,
    warnings,
  };
}

function fmtLine(r) {
  return {
    date: r.entry_date,
    entry: r.entry_number,
    description: r.description,
    source: r.reference_type,
    account: `${r.account_code} ${r.account_name}`,
    debit: money(r.debit),
    credit: money(r.credit),
  };
}

async function dataWarnings(client, start, end) {
  const w = [];
  const n = await repo.countUnpostedCampaignOrders(client, start, end);
  if (n > 0)
    w.push(
      `${n} confirmed campaign order(s) in this period have no journal entry — revenue, VAT and COGS are understated until the storefront posts to the ledger.`,
    );
  return w;
}

// ── Public service (wrapped in business context) ────────────────────────────

async function preview(business, taxType, periodLabel) {
  return withBusinessContext(business, (client) =>
    computeForType(client, business, taxType, periodLabel),
  );
}

async function getProfile(business) {
  return withBusinessContext(business, (client) => repo.getProfile(client));
}

async function updateProfile(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const p = await repo.updateProfile(client, data);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "tax",
      action: "edit",
      table: "tax_profile",
      recordId: p?.profile_id || null,
      after: p,
    });
    return p;
  });
}

// Compute + persist a draft (or refresh an existing draft) for a period.
async function saveDraft(business, taxType, periodLabel, user) {
  return withBusinessContext(business, async (client) => {
    const wp = await computeForType(client, business, taxType, periodLabel);
    const existing = await repo.findFilingByTypePeriod(
      client,
      taxType,
      periodLabel,
    );
    if (existing && ["filed", "paid"].includes(existing.status)) {
      throw bad(
        `This ${taxType} return for ${periodLabel} is already ${existing.status} and cannot be recomputed.`,
      );
    }

    const adjustments = existing
      ? await repo.sumAdjustments(client, existing.filing_id)
      : 0;
    const computed = money(wp.computed_amount);
    const final = money(computed + adjustments);
    const fields = {
      computed_amount: computed,
      adjustment_amount: adjustments,
      final_amount: final,
      workpaper: wp,
      status: existing
        ? existing.status
        : taxType === "CIT" && wp.summary?.small_company
          ? "exempt"
          : "draft",
    };

    let filing;
    if (existing) {
      filing = await repo.updateFiling(client, existing.filing_id, fields);
    } else {
      filing = await repo.insertFiling(client, {
        ...fields,
        filing_number: `${taxType}-${periodLabel}`,
        tax_type: taxType,
        period_label: periodLabel,
        period_start: wp.period_start,
        period_end: wp.period_end,
        created_by: user.user_id,
      });
    }
    return { ...filing, workpaper: wp };
  });
}

async function getFiling(business, filingId) {
  return withBusinessContext(business, async (client) => {
    const filing = await repo.findFilingById(client, filingId);
    if (!filing)
      throw Object.assign(new Error("Filing not found"), { status: 404 });
    const adjustments = await repo.listAdjustments(client, filingId);
    return { ...filing, adjustments };
  });
}

async function listFilings(business, query) {
  return withBusinessContext(business, async (client) => {
    const data = await repo.listFilings(client, {
      taxType: query.tax_type || null,
      year: query.year ? parseInt(query.year) : null,
    });
    return { data };
  });
}

async function addAdjustment(business, filingId, data, user) {
  return withBusinessContext(business, async (client) => {
    const filing = await repo.findFilingById(client, filingId);
    if (!filing)
      throw Object.assign(new Error("Filing not found"), { status: 404 });
    if (["filed", "paid"].includes(filing.status)) {
      throw bad("Cannot adjust a filing that is already filed or paid.");
    }
    await repo.addAdjustment(client, {
      filing_id: filingId,
      label: data.label,
      amount: money(data.amount),
      reason: data.reason,
      created_by: user.user_id,
    });
    const adjustments = await repo.sumAdjustments(client, filingId);
    const final = money(Number(filing.computed_amount) + adjustments);
    const updated = await repo.updateFiling(client, filingId, {
      adjustment_amount: adjustments,
      final_amount: final,
    });
    return {
      ...updated,
      adjustments: await repo.listAdjustments(client, filingId),
    };
  });
}

async function confirm(business, filingId, user) {
  return withBusinessContext(business, async (client) => {
    const filing = await repo.findFilingById(client, filingId);
    if (!filing)
      throw Object.assign(new Error("Filing not found"), { status: 404 });
    if (filing.status !== "draft" && filing.status !== "exempt") {
      throw bad(
        `Only a draft can be confirmed (current status: ${filing.status}).`,
      );
    }
    const updated = await repo.updateFiling(client, filingId, {
      status: "reviewed",
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "tax",
      action: "approve",
      table: "tax_filings",
      recordId: filingId,
      after: { status: "reviewed" },
    });
    return updated;
  });
}

async function markFiled(business, filingId, { filing_reference }, user) {
  return withBusinessContext(business, async (client) => {
    const filing = await repo.findFilingById(client, filingId);
    if (!filing)
      throw Object.assign(new Error("Filing not found"), { status: 404 });
    if (filing.status === "paid") throw bad("Filing already settled.");
    const updated = await repo.updateFiling(client, filingId, {
      status: "filed",
      filing_reference: filing_reference || null,
      filed_at: new Date().toISOString(),
      filed_by: user.user_id,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "tax",
      action: "edit",
      table: "tax_filings",
      recordId: filingId,
      after: { status: "filed", filing_reference },
    });
    return updated;
  });
}

// Settle = pay the authority and post the remittance journal that clears the
// liability. After this the period's tax account nets to zero in the ledger.
async function settle(
  business,
  filingId,
  { bank_account_code, payment_date },
  user,
) {
  return withBusinessContext(business, async (client) => {
    const filing = await repo.findFilingById(client, filingId);
    if (!filing)
      throw Object.assign(new Error("Filing not found"), { status: 404 });
    if (filing.status === "paid") throw bad("Filing already settled.");
    if (filing.status === "exempt")
      throw bad("Nothing to settle — this return is exempt/nil.");

    const bankCode = bank_account_code || "1210";
    const bank = await journalService.getAccountId(client, bankCode);
    if (!bank)
      throw bad(`Bank account ${bankCode} not found in the chart of accounts.`);
    const date = payment_date || new Date().toISOString().slice(0, 10);
    const wp = filing.workpaper || {};
    let lines;

    if (filing.tax_type === "VAT") {
      const output = money(wp.summary?.output_vat || 0);
      const input = money(wp.summary?.input_vat || 0);
      const net = money(output - input);
      if (net <= 0)
        throw bad("Net VAT is a credit — nothing to remit. Carry it forward.");
      const outAcc = await journalService.getAccountId(client, "2210");
      const inAcc = await journalService.getAccountId(client, "2220");
      lines = [{ account_id: outAcc, debit: output, credit: 0 }];
      if (input > 0 && inAcc)
        lines.push({ account_id: inAcc, debit: 0, credit: input });
      lines.push({ account_id: bank, debit: 0, credit: net });
    } else {
      const codeByType = {
        PAYE: "2310",
        WHT: "2340",
        CIT: "2350",
        DEV_LEVY: "2360",
      };
      const liabAcc = await journalService.getAccountId(
        client,
        codeByType[filing.tax_type],
      );
      const amount = money(filing.final_amount);
      if (!liabAcc)
        throw bad(
          `Liability account ${codeByType[filing.tax_type]} not found.`,
        );
      if (amount <= 0) throw bad("Nothing to settle — amount is zero.");
      lines = [
        { account_id: liabAcc, debit: amount, credit: 0 },
        { account_id: bank, debit: 0, credit: amount },
      ];
    }

    const entry = await journalService.postEntry(client, {
      entryDate: date,
      description: `${filing.tax_type} remittance — ${filing.period_label}`,
      referenceType: "tax_remittance",
      referenceId: filingId,
      postedBy: user.user_id,
      lines,
    });

    const updated = await repo.updateFiling(client, filingId, {
      status: "paid",
      paid_at: new Date().toISOString(),
      settlement_entry_id: entry.entry_id,
      filed_at: filing.filed_at || new Date().toISOString(),
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "tax",
      action: "approve",
      table: "tax_filings",
      recordId: filingId,
      after: { status: "paid", entry: entry.entry_number },
    });
    return { ...updated, settlement_entry_number: entry.entry_number };
  });
}

// CSV schedule for upload/records (TaxProMax / LIRS style flat schedule).
async function exportCsv(business, filingId) {
  return withBusinessContext(business, async (client) => {
    const filing = await repo.findFilingById(client, filingId);
    if (!filing)
      throw Object.assign(new Error("Filing not found"), { status: 404 });
    const wp = filing.workpaper || {};
    const rows = [];
    rows.push(["Return", `${filing.tax_type} ${filing.period_label}`]);
    rows.push(["Computed", filing.computed_amount]);
    rows.push(["Adjustments", filing.adjustment_amount]);
    rows.push(["Final amount", filing.final_amount]);
    rows.push([]);
    if (filing.tax_type === "CIT") {
      rows.push(["Line", "Code", "Type", "Amount"]);
      for (const l of wp.lines || [])
        rows.push([l.name, l.code, l.type, l.amount]);
    } else {
      rows.push([
        "Date",
        "Entry",
        "Description",
        "Source",
        "Account",
        "Debit",
        "Credit",
      ]);
      for (const l of wp.lines || []) {
        rows.push([
          l.date,
          l.entry,
          l.description,
          l.source,
          l.account,
          l.debit,
          l.credit,
        ]);
      }
    }
    const csv = rows
      .map((r) =>
        r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    return { filename: `${filing.tax_type}-${filing.period_label}.csv`, csv };
  });
}

// Dashboard: profile + recent filings + this-month deadlines.
async function dashboard(business) {
  return withBusinessContext(business, async (client) => {
    const profile = await repo.getProfile(client);
    const filings = await repo.listFilings(client, {});
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth(); // 0-based; deadlines below are for the PRIOR month's taxes
    const prior = `${m === 0 ? y - 1 : y}-${String(m === 0 ? 12 : m).padStart(2, "0")}`;
    const deadlines = [
      {
        tax_type: "PAYE",
        period_label: prior,
        due: `${y}-${String(m + 1).padStart(2, "0")}-10`,
        authority: "Lagos LIRS",
      },
      {
        tax_type: "VAT",
        period_label: prior,
        due: `${y}-${String(m + 1).padStart(2, "0")}-21`,
        authority: "NRS",
      },
      {
        tax_type: "WHT",
        period_label: prior,
        due: `${y}-${String(m + 1).padStart(2, "0")}-21`,
        authority: "NRS",
      },
    ];
    return { profile, filings, deadlines };
  });
}

module.exports = {
  preview,
  getProfile,
  updateProfile,
  saveDraft,
  getFiling,
  listFilings,
  addAdjustment,
  confirm,
  markFiled,
  settle,
  exportCsv,
  dashboard,
};
