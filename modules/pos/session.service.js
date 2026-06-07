"use strict";

const auditService = require("../../shared/audit/audit.service");
const notifService = require("../../shared/notifications/notifications.service");
const { emitToBusiness } = require("../../config/sockets");
const repo = require("./pos.repository");

// ─────────────────────────────────────────────────────────────
// SESSION SUB-SERVICE
//
// pos.service.js handles the happy path of a POS session — opening,
// closing, and the transaction stream within. This file handles the
// reconciliation layer that sits around close-of-day:
//
//   - calculate the variance between expected and actual cash
//   - flag significant variances for manager review
//   - produce X reports (mid-shift snapshot) and Z reports (end-of-day
//     totals) — standard retail terminology, also what the product
//     description calls the "End-of-Day Reconciliation" screen
//   - notify managers of any over/short situation
//
// pos.service.js calls into this module from closeSession to compute
// variance and audit-log the close. The X/Z reports are surfaced as
// their own endpoints because managers run them outside the close flow.
// ─────────────────────────────────────────────────────────────

// Anything above this absolute Naira value automatically alerts a manager.
// (Below this, small variance is treated as expected — cash counting is
// never perfectly accurate.)
const VARIANCE_ALERT_THRESHOLD_NGN = 1000;

/**
 * Compare expected vs actual cash and classify the variance.
 *
 * @param {number} expected  cash that should be in the till (sum of all
 *                           cash payment splits during the session +
 *                           opening_float)
 * @param {number} actual    cash counted at close by the cashier
 * @returns {Object} { variance, variance_pct, status, requires_review }
 *   - status: 'balanced' | 'minor_short' | 'minor_over' | 'short' | 'over'
 *   - requires_review: true when the variance exceeds the threshold
 */
function classifyVariance(expected, actual) {
  const expectedNum = parseFloat(expected) || 0;
  const actualNum = parseFloat(actual) || 0;
  const variance = parseFloat((actualNum - expectedNum).toFixed(2));
  const variancePct =
    expectedNum > 0
      ? parseFloat(((variance / expectedNum) * 100).toFixed(2))
      : 0;
  const absVariance = Math.abs(variance);

  let status;
  if (absVariance < 1) {
    status = "balanced";
  } else if (absVariance < VARIANCE_ALERT_THRESHOLD_NGN) {
    status = variance < 0 ? "minor_short" : "minor_over";
  } else {
    status = variance < 0 ? "short" : "over";
  }

  return {
    expected: expectedNum,
    actual: actualNum,
    variance,
    variance_pct: variancePct,
    status,
    requires_review: absVariance >= VARIANCE_ALERT_THRESHOLD_NGN,
  };
}

/**
 * Build the full reconciliation report for a session at close.
 *
 * Used by pos.service.closeSession after the session row is updated,
 * to (a) capture the reconciliation analysis in the audit log and
 * (b) notify managers if there's a variance that warrants review.
 */
async function reconcileSession(
  client,
  { business, sessionId, openingFloat, actualCash, user, reconciliationNotes },
) {
  const totals = await repo.getSessionTotals(client, sessionId);
  const expectedCash =
    parseFloat(openingFloat || 0) + parseFloat(totals.cash_total || 0);

  const cashVariance = classifyVariance(expectedCash, actualCash);

  const reconciliation = {
    session_id: sessionId,
    revenue: {
      cash_total: parseFloat(totals.cash_total || 0),
      transfer_total: parseFloat(totals.transfer_total || 0),
      card_total: parseFloat(totals.card_total || 0),
      total_revenue: parseFloat(totals.total_revenue || 0),
    },
    cash_reconciliation: cashVariance,
    notes: reconciliationNotes || null,
  };

  // Audit the reconciliation outcome — even balanced sessions get logged.
  await auditService.log(client, {
    userId: user.user_id,
    userName: user.display_name,
    business,
    module: "pos",
    action: "reconcile_session",
    table: "pos_sessions",
    recordId: sessionId,
    after: reconciliation,
    metadata: cashVariance.requires_review
      ? { sensitive: true, reason: "cash variance requires review" }
      : {},
  });

  // Notify managers if there's a material variance.
  if (cashVariance.requires_review) {
    const managers = await repo.getManagers(client, business);
    const direction = cashVariance.variance < 0 ? "short" : "over";
    const amount = Math.abs(cashVariance.variance).toLocaleString();
    for (const m of managers) {
      await notifService.create(client, {
        userId: m.user_id,
        business,
        type: "approval_required",
        title: `POS session ${direction} by ₦${amount}`,
        body: `Cashier counted ₦${actualCash.toLocaleString()}, system expected ₦${expectedCash.toLocaleString()}. Review session ${sessionId}.`,
        referenceType: "pos_session",
        referenceId: sessionId,
        actionUrl: `/pos/sessions`,
      });
    }
    emitToBusiness(business, "pos:session_variance", {
      sessionId,
      variance: cashVariance.variance,
      direction,
    });
  }

  return reconciliation;
}

// ─────────────────────────────────────────────────────────────
// X REPORT — mid-shift snapshot
//
// Standard retail concept: an "X" read prints the running totals
// without closing the session. Cashier or manager can run it any
// time during the shift to check progress. Does not write to the DB.
// ─────────────────────────────────────────────────────────────

async function getXReport(client, sessionId) {
  const session = await repo.findSessionById(client, sessionId);
  if (!session) {
    throw Object.assign(new Error("Session not found"), { status: 404 });
  }
  if (session.status !== "open") {
    throw Object.assign(new Error("X report is only valid for open sessions"), {
      status: 400,
    });
  }

  const totals = await repo.getSessionTotals(client, sessionId);
  const txCount = await repo.getSessionTxCount(client, sessionId);
  const openingFloat = parseFloat(session.opening_float || 0);
  const expectedCashOnHand = openingFloat + parseFloat(totals.cash_total || 0);

  return {
    report_type: "X",
    session_id: sessionId,
    terminal_name: session.terminal_name,
    opened_at: session.opened_at,
    opened_by: session.opened_by_email,
    snapshot_time: new Date().toISOString(),
    transactions: {
      total: parseInt(txCount.total, 10),
      voided: parseInt(txCount.voided, 10),
      completed: parseInt(txCount.total, 10) - parseInt(txCount.voided, 10),
    },
    revenue: {
      cash_total: parseFloat(totals.cash_total || 0),
      transfer_total: parseFloat(totals.transfer_total || 0),
      card_total: parseFloat(totals.card_total || 0),
      total_revenue: parseFloat(totals.total_revenue || 0),
    },
    cash_drawer: {
      opening_float: openingFloat,
      cash_sales: parseFloat(totals.cash_total || 0),
      expected_cash_on_hand: parseFloat(expectedCashOnHand.toFixed(2)),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Z REPORT — closed-session totals
//
// The final reckoning. Generated AFTER a session is closed; pulls
// the persisted summary row written during reconciliation. Used
// when a manager wants to re-print or audit a past session.
// ─────────────────────────────────────────────────────────────

async function getZReport(client, sessionId) {
  const session = await repo.findSessionById(client, sessionId);
  if (!session) {
    throw Object.assign(new Error("Session not found"), { status: 404 });
  }
  if (session.status !== "closed") {
    throw Object.assign(
      new Error("Z report is only valid for closed sessions — try X report"),
      { status: 400 },
    );
  }

  const expectedCash = parseFloat(session.expected_cash || 0);
  const actualCash = parseFloat(session.actual_cash || 0);
  const variance = classifyVariance(expectedCash, actualCash);

  // H7 fix: query actual cash total from payment splits (additive) instead
  // of subtracting card+transfer from revenue (fragile — breaks with new methods)
  const totals = await repo.getSessionTotals(client, sessionId);

  return {
    report_type: "Z",
    session_id: sessionId,
    terminal_name: session.terminal_name,
    opened_at: session.opened_at,
    closed_at: session.closed_at,
    opened_by: session.opened_by_email,
    transactions: {
      total: parseInt(session.transaction_count || 0, 10),
    },
    revenue: {
      cash_total: parseFloat(totals.cash_total || 0),
      transfer_total: parseFloat(totals.transfer_total || 0),
      card_total: parseFloat(totals.card_total || 0),
      total_revenue: parseFloat(totals.total_revenue || 0),
    },
    cash_drawer: {
      opening_float: parseFloat(session.opening_float || 0),
      expected_cash: expectedCash,
      actual_cash: actualCash,
      variance: variance.variance,
      variance_pct: variance.variance_pct,
      status: variance.status,
    },
    reconciliation_notes: session.reconciliation_notes || null,
  };
}

// ─────────────────────────────────────────────────────────────
// HISTORICAL SESSIONS
// Manager view — list past sessions for a terminal with variance info,
// so a manager can spot patterns (consistent shortfalls, particular
// cashier issues, etc.)
// ─────────────────────────────────────────────────────────────

async function listSessionsWithVariance(client, { terminalId, days = 30 }) {
  const { rows } = await client.query(
    `SELECT s.session_id, s.terminal_id, t.name AS terminal_name,
            s.opened_at, s.closed_at, s.status,
            u.email AS opened_by_email,
            s.opening_float, s.expected_cash, s.actual_cash,
            (s.actual_cash - s.expected_cash) AS variance,
            s.total_revenue, s.total_transfers, s.total_card,
            s.reconciliation_notes
     FROM pos_sessions s
     JOIN pos_terminals t ON t.terminal_id = s.terminal_id
     JOIN shared.users u  ON u.user_id = s.opened_by
     WHERE ($1::UUID IS NULL OR s.terminal_id = $1)
       AND s.opened_at >= now() - ($2 || ' days')::interval
     ORDER BY s.opened_at DESC`,
    [terminalId || null, days],
  );

  return rows.map((r) => {
    const variance = parseFloat(r.variance || 0);
    return {
      ...r,
      variance,
      variance_status:
        r.status !== "closed"
          ? "pending"
          : Math.abs(variance) < 1
            ? "balanced"
            : Math.abs(variance) < VARIANCE_ALERT_THRESHOLD_NGN
              ? variance < 0
                ? "minor_short"
                : "minor_over"
              : variance < 0
                ? "short"
                : "over",
    };
  });
}

// ─────────────────────────────────────────────────────────────
// MARK RECONCILED — manager sign-off
//
// Final terminal state from the schema's status check constraint
// (`status = ANY (ARRAY['open','closed','reconciled'])`). A session
// goes `open → closed` when the cashier finishes their shift, and
// `closed → reconciled` only when a manager reviews and signs off.
//
// Once reconciled, the session is locked — no further variance
// adjustments, no re-counts. The audit log preserves the sign-off
// for compliance.
// ─────────────────────────────────────────────────────────────

async function markReconciled(
  client,
  { business, sessionId, manager, sign_off_notes },
) {
  const session = await repo.findSessionById(client, sessionId);
  if (!session) {
    throw Object.assign(new Error("Session not found"), { status: 404 });
  }
  if (session.status === "reconciled") {
    throw Object.assign(new Error("Session is already reconciled"), {
      status: 409,
    });
  }
  if (session.status !== "closed") {
    throw Object.assign(
      new Error("Only closed sessions can be reconciled — close it first"),
      { status: 400 },
    );
  }

  const {
    rows: [updated],
  } = await client.query(
    `UPDATE pos_sessions
     SET status = 'reconciled'
     WHERE session_id = $1 AND status = 'closed'
     RETURNING session_id, status, cash_variance, total_revenue,
               opened_at, closed_at`,
    [sessionId],
  );
  if (!updated) {
    throw Object.assign(
      new Error("Session was modified during reconciliation — retry"),
      { status: 409 },
    );
  }

  await auditService.log(client, {
    userId: manager.user_id,
    userName: manager.display_name,
    business,
    module: "pos",
    action: "mark_reconciled",
    table: "pos_sessions",
    recordId: sessionId,
    before: { status: "closed" },
    after: { status: "reconciled" },
    metadata: {
      sensitive: true,
      reason: "manager sign-off — locks session",
      sign_off_notes: sign_off_notes || null,
      cash_variance: parseFloat(updated.cash_variance || 0),
    },
  });

  emitToBusiness(business, "pos:session_reconciled", {
    sessionId,
    reconciledBy: manager.user_id,
  });

  return updated;
}

module.exports = {
  classifyVariance,
  reconcileSession,
  markReconciled,
  getXReport,
  getZReport,
  listSessionsWithVariance,
  VARIANCE_ALERT_THRESHOLD_NGN,
};
