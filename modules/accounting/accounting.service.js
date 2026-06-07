"use strict";

const { withBusinessContext } = require("../../config/db");
const auditService = require("../../shared/audit/audit.service");
const repo = require("./accounting.repository");
const journalService = require("./journal.service");
const reconciliationService = require("./reconciliation.service");
const reportsService = require("./reports.service");

// ─── Accounts ────────────────────────────────────────────────────────────────

async function listAccounts(business, { type, active = "true" } = {}) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.findAccounts(client, { type, active });
    return { data: rows };
  });
}

// ── Chart of accounts CRUD ───────────────────────────────────
//
// Seeded accounts (is_system=true) are protected — they're the
// statutory minimum a Nigerian SME needs (sales revenue, VAT
// payable, PAYE payable, etc.) and removing them would break
// downstream modules. Admin can add custom accounts for new
// bank accounts, expense categories, or revenue lines.
//
// Only 5 account_types are allowed (CHECK constraint in schema):
//   asset, liability, equity, income, expense.

const VALID_ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
];

async function createAccount(business, data, user) {
  if (!data.account_code || !data.account_name || !data.account_type) {
    throw Object.assign(
      new Error("account_code, account_name and account_type are required"),
      { status: 400 },
    );
  }
  if (!VALID_ACCOUNT_TYPES.includes(data.account_type)) {
    throw Object.assign(
      new Error(
        `account_type must be one of: ${VALID_ACCOUNT_TYPES.join(", ")}`,
      ),
      { status: 400 },
    );
  }
  return withBusinessContext(business, async (client) => {
    // Reject duplicate codes — account_code must uniquely identify
    // an account within a business's books.
    const dupe = await repo.findAccountByCode(client, data.account_code);
    if (dupe) {
      throw Object.assign(
        new Error(`Account code "${data.account_code}" already exists`),
        { status: 409 },
      );
    }
    const row = await repo.insertAccount(client, {
      accountCode: data.account_code,
      accountName: data.account_name,
      accountType: data.account_type,
      accountSubtype: data.account_subtype,
      parentAccountId: data.parent_account_id,
      description: data.description,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "accounting",
      action: "create",
      table: "chart_of_accounts",
      recordId: row.account_id,
      after: row,
      metadata: { sensitive: true },
    });
    return row;
  });
}

async function updateAccount(business, accountId, data, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findAccountById(client, accountId);
    if (!before) {
      throw Object.assign(new Error("Account not found"), { status: 404 });
    }
    // System accounts can't be renamed or have their code/type changed
    // — the rest of the codebase relies on stable codes like 4100
    // for sales revenue. Admin CAN archive (is_active=false) and
    // CAN update description.
    if (
      before.is_system &&
      (data.account_code || data.account_name || data.account_type)
    ) {
      throw Object.assign(
        new Error(
          "System accounts cannot have account_code, account_name, or " +
            "account_type changed. You may archive (is_active=false) or " +
            "update description.",
        ),
        { status: 400 },
      );
    }
    const row = await repo.updateAccount(client, accountId, {
      accountCode: data.account_code,
      accountName: data.account_name,
      accountType: data.account_type,
      accountSubtype: data.account_subtype,
      parentAccountId: data.parent_account_id,
      description: data.description,
      isActive: data.is_active,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "accounting",
      action: "edit",
      table: "chart_of_accounts",
      recordId: accountId,
      before,
      after: row,
      metadata: { sensitive: true },
    });
    return row;
  });
}

// ─── Journal entries ─────────────────────────────────────────────────────────

async function listJournals(
  business,
  { page = 1, limit = 50, startDate, endDate, referenceType } = {},
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.findJournals(client, {
      startDate,
      endDate,
      referenceType,
      limit: parseInt(limit),
      offset,
    });
    return { data: rows };
  });
}

async function getJournal(business, entryId) {
  return withBusinessContext(business, async (client) => {
    const entry = await repo.findJournalById(client, entryId);
    if (!entry)
      throw Object.assign(new Error("Journal entry not found"), {
        status: 404,
      });
    return entry;
  });
}

async function createManualJournal(business, data, user) {
  return withBusinessContext(business, async (client) => {
    // Balance validation stays here — it's a service-layer concern
    const totalDebit = data.lines.reduce(
      (s, l) => s + parseFloat(l.debit || 0),
      0,
    );
    const totalCredit = data.lines.reduce(
      (s, l) => s + parseFloat(l.credit || 0),
      0,
    );
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw Object.assign(
        new Error(
          `Journal entry out of balance: DR=${totalDebit} CR=${totalCredit}`,
        ),
        { status: 400 },
      );
    }

    // Delegate the write to journal.service — single source of truth for all journal writes
    const entry = await journalService.postEntry(client, {
      entryDate: data.entry_date,
      description: data.description,
      referenceType: "manual",
      postedBy: user.user_id,
      lines: data.lines,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "accounting",
      action: "create",
      table: "journal_entries",
      recordId: entry.entry_id,
      after: entry,
    });

    return entry;
  });
}

async function reverseJournal(business, entryId, user) {
  return withBusinessContext(business, async (client) => {
    const reversal = await journalService.reverseEntry(client, {
      entryId,
      postedBy: user.user_id,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "accounting",
      action: "reverse",
      table: "journal_entries",
      recordId: entryId,
      after: reversal,
    });

    return reversal;
  });
}

// ─── Financial reports ────────────────────────────────────────────────────────

async function getProfitAndLoss(business, query = {}) {
  return withBusinessContext(business, async (client) => {
    return reportsService.profitAndLoss(client, query);
  });
}

async function getBalanceSheet(business, query = {}) {
  return withBusinessContext(business, async (client) => {
    return reportsService.balanceSheet(client, query);
  });
}

async function getTrialBalance(business, query = {}) {
  return withBusinessContext(business, async (client) => {
    return reportsService.trialBalance(client, query);
  });
}

// ─── Bank reconciliation ──────────────────────────────────────────────────────

async function listBankStatements(
  business,
  { bankAccountId, reconciled } = {},
) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.findBankStatements(client, {
      bankAccountId,
      reconciled,
    });
    return { data: rows };
  });
}

async function reconcile(business, { statement_id, payment_id }, user) {
  return withBusinessContext(business, async (client) => {
    return reconciliationService.reconcileItem(client, {
      statementId: statement_id,
      paymentId: payment_id,
    });
  });
}

async function getReconciliationSummary(business, bankAccountId) {
  return withBusinessContext(business, async (client) => {
    return reconciliationService.getReconciliationSummary(
      client,
      bankAccountId,
    );
  });
}

async function listUnreconciled(business) {
  return withBusinessContext(business, async (client) => {
    const rows = await reconciliationService.listUnreconciled(client);
    return { data: rows };
  });
}

// ─── Fiscal periods ───────────────────────────────────────────────────────────

async function listFiscalPeriods(business) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.findFiscalPeriods(client);
    return { data: rows };
  });
}

async function closePeriod(business, periodId, user) {
  return withBusinessContext(business, async (client) => {
    const period = await repo.closeFiscalPeriod(client, {
      periodId,
      userId: user.user_id,
    });
    if (!period)
      throw Object.assign(new Error("Period not found or already closed"), {
        status: 400,
      });
    return period;
  });
}

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
  listJournals,
  getJournal,
  createManualJournal,
  reverseJournal,
  getProfitAndLoss,
  getBalanceSheet,
  getTrialBalance,
  listBankStatements,
  reconcile,
  getReconciliationSummary,
  listUnreconciled,
  listFiscalPeriods,
  closePeriod,
};
