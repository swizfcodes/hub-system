"use strict";

const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const repo = require("./expenses.repository");
const auditService = require("../../shared/audit/audit.service");
const journalService = require("../accounting/journal.service");
const logger = require("../../config/logger");
const notifService = require("../../shared/notifications/notifications.service");

async function list(business, query, user, scope) {
  return withBusinessContext(business, async (client) => {
    const page = parseInt(query.page || 1);
    const limit = parseInt(query.limit || 50);
    const offset = (page - 1) * limit;

    const profileId =
      scope === "own"
        ? await getProfileId(client, user.user_id)
        : query.profileId;

    const rows = await repo.findAll(client, {
      profileId: profileId || null,
      status: query.status || null,
      limit,
      offset,
    });
    return { data: rows };
  });
}

async function getById(business, expenseId) {
  return withBusinessContext(business, async (client) => {
    const expense = await repo.findById(client, expenseId);
    if (!expense)
      throw Object.assign(new Error("Expense not found"), { status: 404 });
    return expense;
  });
}

async function create(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const profileId =
      data.profile_id || (await getProfileId(client, user.user_id));
    const expenseNumber = await nextDocumentNumber(client, business, "expense");

    const expense = await repo.insert(client, {
      ...data,
      expense_number: expenseNumber,
      profile_id: profileId,
    });

    // Notify managers
    await notifyManagers(client, business, user, {
      type: "approval_required",
      title: `Expense claim: ${expense.expense_number}`,
      body: `₦${Number(expense.amount).toLocaleString()} — ${expense.category}`,
      referenceType: "expense",
      referenceId: expense.expense_id,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "expenses",
      action: "create",
      table: "expenses",
      recordId: expense.expense_id,
      after: expense,
    });

    return expense;
  });
}

async function approve(business, expenseId, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findById(client, expenseId);
    if (!before)
      throw Object.assign(new Error("Expense not found"), { status: 404 });
    if (before.status !== "pending")
      throw Object.assign(new Error("Only pending expenses can be approved"), {
        status: 400,
      });

    const expense = await repo.updateStatus(client, expenseId, {
      status: "approved",
      approvedBy: user.user_id,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "expenses",
      action: "approve",
      table: "expenses",
      recordId: expenseId,
      before,
      after: expense,
    });

    return expense;
  });
}

async function reject(business, expenseId, { rejection_reason }, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findById(client, expenseId);
    if (!before)
      throw Object.assign(new Error("Expense not found"), { status: 404 });

    const expense = await repo.updateStatus(client, expenseId, {
      status: "rejected",
      approvedBy: user.user_id,
      rejectionReason: rejection_reason,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "expenses",
      action: "reject",
      table: "expenses",
      recordId: expenseId,
      before,
      after: expense,
    });

    return expense;
  });
}

async function markPaid(business, expenseId, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findById(client, expenseId);
    if (!before || before.status !== "approved") {
      throw Object.assign(
        new Error("Expense must be approved before marking paid"),
        { status: 400 },
      );
    }

    const expense = await repo.updateStatus(client, expenseId, {
      status: "paid",
      approvedBy: user.user_id,
    });

    // Post journal entry: DR Expense account, CR Bank
    await postExpenseJournal(client, expense);

    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "expenses",
      action: "approve",
      table: "expenses",
      recordId: expenseId,
      before,
      after: expense,
    });

    return expense;
  });
}

async function postExpenseJournal(client, expense) {
  const categoryAccountMap = {
    transport: "6200",
    fuel: "6200",
    office_supplies: "6500",
    client_entertainment: "6400",
    meals: "6400",
    utilities: "6500",
    maintenance: "6500",
    accommodation: "6600",
    other: "6800",
  };
  const expenseCode = categoryAccountMap[expense.category] || "6800";

  const [expAcc, bankAcc] = await Promise.all([
    journalService.getAccountId(client, expenseCode),
    journalService.getAccountId(client, "1210"),
  ]);

  if (!expAcc || !bankAcc) {
    logger.warn(
      `[expenses] journal skipped — missing COA for code ${expenseCode} or bank 1210`,
    );
    return;
  }

  const paidAt = expense.paid_at
    ? new Date(expense.paid_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  await journalService.postEntry(client, {
    entryDate: paidAt,
    description: `Expense ${expense.expense_number} — ${expense.category}`,
    referenceType: "expense",
    referenceId: expense.expense_id,
    postedBy: expense.approved_by,
    lines: [
      { account_id: expAcc, debit: parseFloat(expense.amount), credit: 0 },
      { account_id: bankAcc, debit: 0, credit: parseFloat(expense.amount) },
    ],
  });
}

async function listAdvances(business, query, user, scope) {
  return withBusinessContext(business, async (client) => {
    const profileId =
      scope === "own"
        ? await getProfileId(client, user.user_id)
        : query.profileId;
    const rows = await repo.findAdvances(client, {
      profileId: profileId || null,
      status: query.status || null,
    });
    return { data: rows };
  });
}

async function createAdvance(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const profileId =
      data.profile_id || (await getProfileId(client, user.user_id));
    const advance = await repo.insertAdvance(client, {
      ...data,
      profile_id: profileId,
    });

    await notifyManagers(client, business, user, {
      type: "approval_required",
      title: `Cash advance request: ₦${Number(data.amount_requested).toLocaleString()}`,
      body: data.reason,
      referenceType: "cash_advance",
      referenceId: advance.advance_id,
    });

    return advance;
  });
}

async function approveAdvance(business, advanceId, { amount_approved }, user) {
  return withBusinessContext(business, async (client) => {
    const advance = await repo.updateAdvanceStatus(client, advanceId, {
      status: "disbursed",
      amountApproved: amount_approved,
      approvedBy: user.user_id,
    });
    if (!advance)
      throw Object.assign(new Error("Advance not found"), { status: 404 });
    return advance;
  });
}

// ── Helpers ───────────────────────────────────────────────
async function getProfileId(client, userId) {
  const {
    rows: [u],
  } = await client.query(
    `SELECT staff_profile_id FROM shared.users WHERE user_id=$1`,
    [userId],
  );
  return u?.staff_profile_id || null;
}

async function notifyManagers(
  client,
  business,
  user,
  { type, title, body, referenceType, referenceId },
) {
  const { rows: managers } = await client.query(
    `SELECT u.user_id FROM shared.users u
     JOIN shared.user_roles ur ON ur.user_id=u.user_id
     JOIN shared.roles r ON r.role_id=ur.role_id
     WHERE r.role_name IN ('owner','manager','accountant')
       AND (ur.business=$1 OR ur.business='*')`,
    [business],
  );
  for (const m of managers) {
    await notifService.create(client, {
      userId: m.user_id,
      business,
      type,
      title,
      body,
      referenceType,
      referenceId,
    });
  }
}

async function getKpis(business) {
  return withBusinessContext(business, async (client) => {
    const { totals, byCategory } = await repo.getKpis(client);
    return {
      paid_this_month: parseFloat(totals.paid_this_month) || 0,
      pending_amount: parseFloat(totals.pending_amount) || 0,
      pending_count: totals.pending_count || 0,
      reimbursements_outstanding:
        parseFloat(totals.reimbursements_outstanding) || 0,
      top_category_this_month: byCategory[0]?.category ?? null,
      spend_by_category: byCategory.map((r) => ({
        category: r.category,
        total: parseFloat(r.total) || 0,
      })),
    };
  });
}

module.exports = {
  list,
  getById,
  create,
  approve,
  reject,
  markPaid,
  listAdvances,
  createAdvance,
  approveAdvance,
  getKpis,
};
