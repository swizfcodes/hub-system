"use strict";

const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const repo = require("./expenses.repository");
const auditService = require("../../shared/audit/audit.service");
const journalService = require("../accounting/journal.service");
const documentsService = require("../../shared/documents/documents.service");
const logger = require("../../config/logger");
const notifService = require("../../shared/notifications/notifications.service");

// Amounts at or below this are auto-approved on submission.
// Keep in sync with AUTO_APPROVE_THRESHOLD_NGN in the client.
const AUTO_APPROVE_THRESHOLD = parseFloat(
  process.env.EXPENSE_AUTO_APPROVE_THRESHOLD || "5000",
);

// Category → expense COA code. Every UI category MUST appear here.
const CATEGORY_ACCOUNT_MAP = {
  rent: "6300",
  transport: "6200",
  office_supplies: "6500",
  meals: "6860",
  client_entertainment: "6860",
  utilities: "6840",
  maintenance: "6850",
  marketing: "6400",
  insurance: "6830",
  professional_fees: "6820",
  software_subscriptions: "6810",
  other: "6500",
};
const VALID_CATEGORIES = Object.keys(CATEGORY_ACCOUNT_MAP);

// Payment method → credit account (what the money left)
const METHOD_CREDIT_ACCOUNT = {
  bank_transfer: "1210",
  card: "1210",
  cash: "1100",
  petty_cash: "1110",
  other: "1210",
};

const VALID_EXPENSE_TYPES = [
  "reimbursement",
  "petty_cash",
  "direct_payment",
  "cash_advance_retirement",
];

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

// ── List / Get ────────────────────────────────────────────

async function list(business, query, user, scope) {
  return withBusinessContext(business, async (client) => {
    const page = Math.max(parseInt(query.page || 1, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(query.limit || 50, 10) || 50, 1),
      200,
    );
    const offset = (page - 1) * limit;

    const profileId =
      scope === "own"
        ? await getProfileId(client, user.user_id)
        : query.profileId;

    const { rows, total } = await repo.findAll(client, {
      profileId: profileId || null,
      status: query.status || null,
      category: query.category || null,
      limit,
      offset,
    });
    return { data: rows, pagination: { total, page, limit } };
  });
}

async function getById(business, expenseId) {
  return withBusinessContext(business, async (client) => {
    const expense = await repo.findById(client, expenseId);
    if (!expense) throw httpError("Expense not found", 404);
    return expense;
  });
}

async function getKpis(business, user, scope) {
  return withBusinessContext(business, async (client) => {
    const profileId =
      scope === "own" ? await getProfileId(client, user.user_id) : null;
    return repo.kpis(client, { profileId });
  });
}

// ── Create ────────────────────────────────────────────────

async function create(business, data, user) {
  if (!VALID_CATEGORIES.includes(data.category)) {
    throw httpError(
      `Invalid category. Allowed: ${VALID_CATEGORIES.join(", ")}`,
      400,
    );
  }
  const expenseType = data.expense_type || "reimbursement";
  if (!VALID_EXPENSE_TYPES.includes(expenseType)) {
    throw httpError(
      `Invalid expense_type. Allowed: ${VALID_EXPENSE_TYPES.join(", ")}`,
      400,
    );
  }

  return withBusinessContext(business, async (client) => {
    const profileId =
      data.profile_id || (await getProfileId(client, user.user_id));

    const hasVendor = !!(data.vendor_name || data.vendor_contact_id);
    if (!profileId && !hasVendor) {
      throw httpError(
        "Expense needs a payee: your staff profile or a vendor",
        400,
      );
    }

    const amount = parseFloat(data.amount);
    const autoApproved = amount > 0 && amount <= AUTO_APPROVE_THRESHOLD;

    const expenseNumber = await nextDocumentNumber(client, business, "expense");

    const expense = await repo.insert(client, {
      ...data,
      expense_type: expenseType,
      amount,
      expense_number: expenseNumber,
      profile_id: profileId || null,
      vendor_name: data.vendor_name || null,
      vendor_contact_id: data.vendor_contact_id || null,
      submitted_by: user.user_id,
      status: autoApproved ? "approved" : "pending",
      auto_approved: autoApproved,
    });

    if (!autoApproved) {
      await notifyManagers(client, business, user, {
        type: "approval_required",
        title: `Expense claim: ${expense.expense_number}`,
        body: `₦${Number(expense.amount).toLocaleString()} — ${expense.category}`,
        referenceType: "expense",
        referenceId: expense.expense_id,
      });
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.email || "staff",
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

// ── Approve / Reject ──────────────────────────────────────

async function approve(business, expenseId, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findById(client, expenseId);
    if (!before) throw httpError("Expense not found", 404);
    if (before.status !== "pending")
      throw httpError("Only pending expenses can be approved", 400);

    const expense = await repo.updateStatus(client, expenseId, {
      status: "approved",
      approvedBy: user.user_id,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.email || "staff",
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
    if (!before) throw httpError("Expense not found", 404);
    if (before.status !== "pending")
      throw httpError("Only pending expenses can be rejected", 400);

    const expense = await repo.updateStatus(client, expenseId, {
      status: "rejected",
      approvedBy: user.user_id,
      rejectionReason: rejection_reason,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.email || "staff",
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

// ── Payments ──────────────────────────────────────────────

/**
 * Record a (possibly partial) payment against an approved expense.
 * Posts a balanced journal entry for the payment amount, rolls up
 * amount_paid and flips status to partially_paid / paid.
 */
async function recordPayment(business, expenseId, data, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findById(client, expenseId);
    if (!before) throw httpError("Expense not found", 404);
    if (!["approved", "partially_paid"].includes(before.status)) {
      throw httpError(
        "Payments can only be recorded on approved or partially paid expenses",
        400,
      );
    }

    const amount = parseFloat(data.amount);
    const balance = parseFloat(before.amount) - parseFloat(before.amount_paid);
    if (amount > balance + 0.01) {
      throw httpError(
        `Payment of ₦${amount.toLocaleString()} exceeds outstanding balance of ₦${balance.toLocaleString()}`,
        400,
      );
    }

    const payment = await repo.insertPayment(client, {
      expense_id: expenseId,
      amount,
      payment_date: data.payment_date,
      method: data.method,
      reference: data.reference,
      notes: data.notes,
      recorded_by: user.user_id,
    });

    const expense = await repo.applyPaymentRollup(client, expenseId);

    await postExpenseJournal(client, expense, payment);

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.email || "staff",
      business,
      module: "expenses",
      action: "edit",
      table: "expense_payments",
      recordId: payment.payment_id,
      before,
      after: expense,
    });

    return { ...expense, last_payment: payment };
  });
}

/**
 * Mark the full outstanding balance as paid in one step.
 * Implemented as a payment of the remaining balance so the
 * payments ledger and journals always reconcile.
 */
async function markPaid(business, expenseId, data, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findById(client, expenseId);
    if (!before) throw httpError("Expense not found", 404);
    if (!["approved", "partially_paid"].includes(before.status)) {
      throw httpError("Expense must be approved before marking paid", 400);
    }

    const balance = parseFloat(before.amount) - parseFloat(before.amount_paid);
    if (balance <= 0) throw httpError("Expense is already fully paid", 400);

    const payment = await repo.insertPayment(client, {
      expense_id: expenseId,
      amount: balance,
      payment_date: data?.payment_date,
      method: data?.method || defaultMethodFor(before.expense_type),
      reference: data?.reference,
      notes: data?.notes || "Marked paid (full balance)",
      recorded_by: user.user_id,
    });

    const expense = await repo.applyPaymentRollup(client, expenseId);

    await postExpenseJournal(client, expense, payment);

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.email || "staff",
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

function defaultMethodFor(expenseType) {
  if (expenseType === "petty_cash") return "petty_cash";
  return "bank_transfer";
}

/**
 * DR expense account (by category), CR cash/bank (by payment method)
 * for the payment amount only — partial payments post partial journals.
 */
async function postExpenseJournal(client, expense, payment) {
  const expenseCode = CATEGORY_ACCOUNT_MAP[expense.category] || "6500";
  const creditCode = METHOD_CREDIT_ACCOUNT[payment.method] || "1210";

  const [expAcc, creditAcc] = await Promise.all([
    journalService.getAccountId(client, expenseCode),
    journalService.getAccountId(client, creditCode),
  ]);

  if (!expAcc || !creditAcc) {
    logger.warn(
      `[expenses] journal skipped — missing COA for ${expenseCode} or ${creditCode}`,
    );
    return;
  }

  const entryDate =
    payment.payment_date instanceof Date
      ? payment.payment_date.toISOString().slice(0, 10)
      : String(payment.payment_date).slice(0, 10);

  await journalService.postEntry(client, {
    entryDate,
    description: `Expense ${expense.expense_number} — ${expense.category}${
      expense.vendor_name ? ` (${expense.vendor_name})` : ""
    }`,
    referenceType: "expense",
    referenceId: expense.expense_id,
    postedBy: payment.recorded_by,
    lines: [
      { account_id: expAcc, debit: parseFloat(payment.amount), credit: 0 },
      { account_id: creditAcc, debit: 0, credit: parseFloat(payment.amount) },
    ],
  });
}

// ── Receipts ──────────────────────────────────────────────

async function addReceipt(business, expenseId, file, meta, user) {
  return withBusinessContext(business, async (client) => {
    const expense = await repo.findById(client, expenseId);
    if (!expense) throw httpError("Expense not found", 404);

    const doc = await documentsService.uploadDocument(
      {
        buffer: file.buffer,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        business,
        documentType: "receipt",
        title:
          meta.title ||
          `Receipt — ${expense.expense_number}${
            expense.vendor_name ? ` (${expense.vendor_name})` : ""
          }`,
        referenceType: "expense",
        referenceId: expenseId,
        tags: ["expense"],
      },
      user,
    );

    const receipt = await repo.insertReceipt(client, {
      expense_id: expenseId,
      document_id: doc.document_id,
      receipt_date: meta.receipt_date,
      merchant_name: meta.merchant_name || expense.vendor_name,
      amount_on_receipt: meta.amount_on_receipt,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.email || "staff",
      business,
      module: "expenses",
      action: "edit",
      table: "expense_receipts",
      recordId: receipt.receipt_id,
      after: receipt,
    });

    return { ...receipt, file_name: file.originalname };
  });
}

// ── Advances ──────────────────────────────────────────────

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
    if (!profileId) {
      throw httpError(
        "Cash advances require a staff profile linked to your account",
        400,
      );
    }
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
    if (!advance) throw httpError("Advance not found", 404);
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
    `SELECT DISTINCT u.user_id FROM shared.users u
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


module.exports = {
  list,
  getById,
  getKpis,
  create,
  approve,
  reject,
  recordPayment,
  markPaid,
  addReceipt,
  listAdvances,
  createAdvance,
  approveAdvance,
  // exported for tests
  CATEGORY_ACCOUNT_MAP,
  VALID_CATEGORIES,
  VALID_EXPENSE_TYPES,
  AUTO_APPROVE_THRESHOLD,
};
