"use strict";

const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const { getVatRate } = require("../../config/businesses");
const stockService = require("../stock/stock.service");
const notifService = require("../../shared/notifications/notifications.service");
const auditService = require("../../shared/audit/audit.service");
const journalService = require("../accounting/journal.service");
const logger = require("../../config/logger");
const { emitToBusiness } = require("../../config/sockets");
const sessionSvc = require("./session.service");
const receiptSvc = require("./receipt.service");
const repo = require("./pos.repository");
const loyaltyService = require("../loyalty/loyalty.service");

// ─────────────────────────────────────────────────────────────
// POS service — coordination layer for the point of sale.
//
// Heavy lifting in two sub-services:
//   - session.service.js → reconciliation, X/Z reports, variance
//   - receipt.service.js → PDF rendering, WhatsApp/email delivery
//
// This file handles the transaction flow itself (taking payment,
// recording stock movement, splitting payment methods) and session
// open/close orchestration.
// ─────────────────────────────────────────────────────────────

async function getTerminals(business) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.getTerminals(client);
    return { data: rows };
  });
}

async function createTerminal(business, data, user) {
  if (!data.name || !data.name.trim()) {
    throw Object.assign(new Error("name is required"), { status: 400 });
  }
  if (!data.location_id) {
    throw Object.assign(
      new Error("location_id is required — a terminal belongs to a location"),
      { status: 400 },
    );
  }
  return withBusinessContext(business, async (client) => {
    // Verify the location exists and is active before insert so a bad
    // location_id returns a clean 400 instead of a raw FK violation.
    const loc = await repo.findLocationForTerminal(client, data.location_id);
    if (!loc) {
      throw Object.assign(
        new Error("location_id does not match an active stock location"),
        { status: 400 },
      );
    }
    const row = await repo.insertTerminal(client, {
      name: data.name.trim(),
      locationId: data.location_id,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "pos",
      action: "create",
      table: "pos_terminals",
      recordId: row.terminal_id,
      after: row,
    });
    return row;
  });
}

async function updateTerminal(business, terminalId, data, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findTerminalById(client, terminalId);
    if (!before) {
      throw Object.assign(new Error("Terminal not found"), { status: 404 });
    }
    // If moving the terminal to a different location, validate it.
    if (data.location_id && data.location_id !== before.location_id) {
      const loc = await repo.findLocationForTerminal(client, data.location_id);
      if (!loc) {
        throw Object.assign(
          new Error("location_id does not match an active stock location"),
          { status: 400 },
        );
      }
    }
    // Block deactivating a terminal that has an open session — the
    // cashier would be stranded mid-sale.
    if (data.is_active === false) {
      const hasOpen = await repo.terminalHasOpenSession(client, terminalId);
      if (hasOpen) {
        throw Object.assign(
          new Error(
            "Cannot deactivate a terminal with an open session. " +
              "Close the session first.",
          ),
          { status: 409 },
        );
      }
    }
    const row = await repo.updateTerminal(client, terminalId, {
      name: data.name ? data.name.trim() : null,
      locationId: data.location_id,
      isActive: data.is_active,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "pos",
      action: "edit",
      table: "pos_terminals",
      recordId: terminalId,
      before,
      after: row,
    });
    return row;
  });
}

async function openSession(business, { terminal_id, opening_float = 0 }, user) {
  return withBusinessContext(business, async (client) => {
    const existing = await repo.findOpenSession(client, terminal_id);
    if (existing.length)
      throw Object.assign(new Error("Terminal already has an open session"), {
        status: 409,
      });

    const session = await repo.insertSession(client, {
      terminal_id,
      userId: user.user_id,
      opening_float,
    });
    emitToBusiness(business, "pos:session_opened", {
      sessionId: session.session_id,
      terminalId: terminal_id,
    });
    return session;
  });
}

async function getSession(business, sessionId) {
  return withBusinessContext(business, async (client) => {
    const session = await repo.findSessionById(client, sessionId);
    if (!session)
      throw Object.assign(new Error("Session not found"), { status: 404 });
    return session;
  });
}

async function closeSession(
  business,
  sessionId,
  { actual_cash, reconciliation_notes },
  user,
) {
  return withBusinessContext(business, async (client) => {
    // Pull totals BEFORE closing — they're calculated from
    // pos_payment_splits which is read-only at this point.
    const totals = await repo.getSessionTotals(client, sessionId);
    const sessionBefore = await repo.findSessionById(client, sessionId);
    if (!sessionBefore) {
      throw Object.assign(new Error("Session not found"), { status: 404 });
    }

    const session = await repo.closeSession(client, {
      sessionId,
      userId: user.user_id,
      actual_cash,
      expected_cash: totals.cash_total,
      transfer_total: totals.transfer_total,
      card_total: totals.card_total,
      total_revenue: totals.total_revenue,
      reconciliation_notes,
    });
    if (!session)
      throw Object.assign(new Error("Session not found or already closed"), {
        status: 400,
      });

    const txCount = await repo.getSessionTxCount(client, sessionId);
    await repo.insertSessionSummary(client, {
      sessionId,
      total: txCount.total,
      voided: txCount.voided,
      total_revenue: totals.total_revenue,
      cash_total: totals.cash_total,
      card_total: totals.card_total,
      transfer_total: totals.transfer_total,
    });

    // Reconciliation analysis (variance, manager flagging) lives in the
    // session sub-service. Cash variance is calculated against opening
    // float + cash sales, not just cash sales — common reconciliation
    // bug that misses the float.
    const reconciliation = await sessionSvc.reconcileSession(client, {
      business,
      sessionId,
      openingFloat: sessionBefore.opening_float,
      actualCash: actual_cash,
      user,
      reconciliationNotes: reconciliation_notes,
    });

    emitToBusiness(business, "pos:session_closed", {
      sessionId,
      variance: reconciliation.cash_reconciliation.variance,
    });
    return { ...session, reconciliation };
  });
}

// X report (mid-shift snapshot) and Z report (closed-session totals).
async function getXReport(business, sessionId) {
  return withBusinessContext(business, (client) =>
    sessionSvc.getXReport(client, sessionId),
  );
}

async function getZReport(business, sessionId) {
  return withBusinessContext(business, (client) =>
    sessionSvc.getZReport(client, sessionId),
  );
}

async function listSessionsWithVariance(business, query) {
  return withBusinessContext(business, (client) =>
    sessionSvc.listSessionsWithVariance(client, {
      terminalId: query.terminal_id,
      days: parseInt(query.days) || 30,
    }),
  );
}

async function markReconciled(business, sessionId, body, user) {
  return withBusinessContext(business, (client) =>
    sessionSvc.markReconciled(client, {
      business,
      sessionId,
      manager: user,
      sign_off_notes: body?.sign_off_notes,
    }),
  );
}

async function createTransaction(business, data, user) {
  const result = await withBusinessContext(business, async (client) => {
    const session = await repo.validateOpenSession(client, data.session_id);
    if (!session)
      throw Object.assign(new Error("No open session found"), { status: 400 });

    // ── C6: Validate line items before processing ──
    for (const line of data.lines) {
      if (typeof line.quantity !== "number" || line.quantity <= 0) {
        throw Object.assign(
          new Error(`Invalid quantity for line: ${line.description || line.product_id}. Must be a positive number.`),
          { status: 400 },
        );
      }
      if (typeof line.unit_price !== "number" || line.unit_price < 0) {
        throw Object.assign(
          new Error(`Invalid unit_price for line: ${line.description || line.product_id}. Must be non-negative.`),
          { status: 400 },
        );
      }
      if (line.product_id) {
        const prod = await repo.getProductMinPrice(client, line.product_id);
        if (!prod) {
          throw Object.assign(
            new Error(`Product not found: ${line.product_id}`),
            { status: 400 },
          );
        }
      }
    }
    // Validate payment splits sum
    const paymentSum = data.payments.reduce((s, p) => s + parseFloat(p.amount), 0);
    if (data.payments.some((p) => parseFloat(p.amount) <= 0)) {
      throw Object.assign(
        new Error("All payment amounts must be positive"),
        { status: 400 },
      );
    }

    // Check minimum price per line
    for (const line of data.lines) {
      if (!line.product_id) continue;
      const prod = await repo.getProductMinPrice(client, line.product_id);
      if (
        prod?.min_selling_price &&
        parseFloat(line.unit_price) < parseFloat(prod.min_selling_price)
      ) {
        const da = await repo.insertDiscountApproval(client, {
          sessionId: data.session_id,
          productId: line.product_id,
          unitPrice: line.unit_price,
          minPrice: prod.min_selling_price,
          userId: user.user_id,
        });
        const managers = await repo.getManagers(client, business);
        for (const m of managers) {
          await notifService.create(client, {
            userId: m.user_id,
            business,
            type: "approval_required",
            title: "Discount approval required",
            body: `Staff requesting price below minimum. Approval ID: ${da.approval_id}`,
            referenceType: "discount_approval",
            referenceId: da.approval_id,
          });
        }
        throw Object.assign(
          new Error(
            `Price below minimum. Approval requested: ${da.approval_id}`,
          ),
          { status: 402, approvalId: da.approval_id },
        );
      }
    }

    let subtotal = 0,
      discountTotal = 0,
      vatTotal = 0;
    // VAT rate from business_config (cached) — see config/businesses.
    const vatRate = getVatRate(business);
    for (const l of data.lines) {
      const net = Math.round((l.unit_price * l.quantity - (l.discount_amount || 0)) * 100) / 100;
      discountTotal = Math.round((discountTotal + (l.discount_amount || 0)) * 100) / 100;
      subtotal = Math.round((subtotal + net) * 100) / 100;
      vatTotal = Math.round((vatTotal + Math.round(net * vatRate * 100) / 100) * 100) / 100;
    }
    const totalAmount = Math.round((subtotal + vatTotal) * 100) / 100;
    const totalPaid = Math.round(
      data.payments.reduce((s, p) => s + parseFloat(p.amount), 0) * 100
    ) / 100;
    const change = Math.round(Math.max(0, totalPaid - totalAmount) * 100) / 100;

    const txNumber = await nextDocumentNumber(client, business, "receipt");
    const tx = await repo.insertTransaction(client, {
      txNumber,
      session_id: data.session_id,
      contact_id: data.contact_id,
      userId: user.user_id,
      subtotal,
      discountTotal,
      vatTotal,
      totalAmount,
      totalPaid,
      change,
      fulfilment_type: data.fulfilment_type,
      offline_id: data.offline_id, // set only by offline-sync replay
    });

    for (let i = 0; i < data.lines.length; i++) {
      const l = data.lines[i];
      const net = l.unit_price * l.quantity - (l.discount_amount || 0);
      const vat = net * vatRate;
      await repo.insertTransactionLine(client, {
        transaction_id: tx.transaction_id,
        product_id: l.product_id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_amount: l.discount_amount,
        vat,
        lineTotal: net + vat,
        order: i,
      });
      if (l.product_id) {
        await stockService.recordMovement(client, {
          business,
          productId: l.product_id,
          movementType: "sold",
          quantity: l.quantity,
          direction: -1,
          referenceType: "pos_transaction",
          referenceId: tx.transaction_id,
          performedBy: user.user_id,
        });
      }
    }

    for (const p of data.payments) {
      await repo.insertPaymentSplit(client, {
        transaction_id: tx.transaction_id,
        payment_method: p.payment_method,
        amount: p.amount,
        reference: p.reference,
        paystack_reference: p.paystack_reference,
      });
    }

    const transferAmt = data.payments
      .filter((p) => p.payment_method === "bank_transfer")
      .reduce((s, p) => s + parseFloat(p.amount), 0);
    const cardAmt = data.payments
      .filter((p) => p.payment_method === "pos_card")
      .reduce((s, p) => s + parseFloat(p.amount), 0);
    await repo.updateSessionTotals(client, {
      totalAmount,
      transferAmt,
      cardAmt,
      session_id: data.session_id,
    });

    // Post the two accounting journals for this sale. Each POS sale
    // produces:
    //   1. Revenue journal — books cash receipt vs sales/VAT income
    //   2. COGS journal    — relieves inventory and books cost
    //
    // Both run inside this same withBusinessContext transaction so if
    // either fails the whole sale rolls back. Without these, the P&L
    // would only show net sales but no cash receipt and no cost side.
    await postPosRevenueJournal(
      client,
      business,
      tx,
      data.payments,
      data.lines,
    );
    await postPosCOGSJournal(client, business, tx, data.lines);

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "pos",
      action: "create",
      table: "pos_transactions",
      recordId: tx.transaction_id,
      after: tx,
    });
    emitToBusiness(business, "pos:transaction_completed", {
      transactionId: tx.transaction_id,
      amount: totalAmount,
    });
    return { ...tx, change_given: change };
  });

  if (data.contact_id) {
    try {
      await loyaltyService.awardPoints(
        business,
        data.contact_id,
        result.total_amount,
        "pos_transaction",
        result.transaction_id,
        user,
      );
    } catch (err) {
      // Log with enough context to manually credit later
      logger.error(
        `[loyalty] award failed for tx ${result.transaction_id}, contact ${data.contact_id}, amount ${result.total_amount}: ${err.message}`,
        err,
      );
    }
  }

  return result;
}

// Replay a batch of queued offline POS sales. Idempotent: each sale carries
// a stable offline_id; an already-synced one is reported as a duplicate (and
// the UNIQUE index on offline_id is the hard guard against double-posting if
// two syncs race). Each sale is replayed through the normal createTransaction
// path, so it gets the same validation, journals, stock movements and loyalty.
// One bad sale doesn't abort the batch — failures are reported per-item.
async function syncOfflineTransactions(business, { session_id, transactions }, user) {
  if (!Array.isArray(transactions)) {
    throw Object.assign(new Error("transactions array is required"), {
      status: 400,
    });
  }

  const results = [];
  for (const t of transactions) {
    try {
      const existing = await withBusinessContext(business, (client) =>
        repo.findTransactionByOfflineId(client, t.offline_id),
      );
      if (existing) {
        results.push({
          offline_id: t.offline_id,
          success: true,
          transaction_id: existing.transaction_id,
          transaction_number: existing.transaction_number,
          conflict_type: "duplicate",
        });
        continue;
      }

      const tx = await createTransaction(
        business,
        {
          session_id: session_id || t.session_id,
          lines: t.lines,
          payments: t.payments,
          contact_id: t.contact_id,
          offline_id: t.offline_id,
        },
        user,
      );
      results.push({
        offline_id: t.offline_id,
        success: true,
        transaction_id: tx.transaction_id,
        transaction_number: tx.transaction_number,
      });
    } catch (err) {
      const msg = err.message || "Sync failed";
      let conflict_type;
      if (/no open session/i.test(msg)) conflict_type = "session_closed";
      else if (/duplicate|unique|already/i.test(msg)) conflict_type = "duplicate";
      else if (/stock|insufficient|out of stock/i.test(msg))
        conflict_type = "out_of_stock";
      results.push({
        offline_id: t.offline_id,
        success: false,
        error: msg,
        ...(conflict_type ? { conflict_type } : {}),
      });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  return {
    results,
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
  };
}

async function getTransaction(business, transactionId) {
  return withBusinessContext(business, async (client) => {
    const tx = await repo.findTransactionById(client, transactionId);
    if (!tx)
      throw Object.assign(new Error("Transaction not found"), { status: 404 });
    return tx;
  });
}

async function voidTransaction(business, transactionId, { void_reason }, user) {
  return withBusinessContext(business, async (client) => {
    const tx = await repo.voidTransaction(client, {
      transactionId,
      userId: user.user_id,
      void_reason,
    });
    if (!tx)
      throw Object.assign(new Error("Transaction cannot be voided"), {
        status: 400,
      });

    const lines = await repo.getTransactionProductLines(client, transactionId);
    for (const l of lines) {
      await stockService.recordMovement(client, {
        business,
        productId: l.product_id,
        movementType: "return_from_customer",
        quantity: l.quantity,
        direction: 1,
        referenceType: "pos_transaction",
        referenceId: transactionId,
        performedBy: user.user_id,
        notes: `Void: ${void_reason}`,
      });
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "pos",
      action: "delete",
      table: "pos_transactions",
      recordId: transactionId,
      before: tx,
    });
    return tx;
  });
}

// ─────────────────────────────────────────────────────────────
// JOURNAL POSTING
// Every POS transaction produces two journals: one for the revenue
// side (cash receipt vs sales income + VAT liability) and one for the
// cost side (COGS expense vs inventory relief). Both go through the
// canonical accounting/journal.service.postEntry, which validates
// DR=CR balance and stamps the active fiscal period.
//
// Chart-of-accounts codes used (Nigerian SME convention):
//   1100 — Cash on Hand          (asset)
//   1210 — Bank account          (asset, used for card + transfer)
//   1310 — Accounts Receivable   (asset, fallback for un-mapped methods)
//   2210 — VAT Payable           (liability)
//   4100 — Sales Revenue         (income)
//   5000 — Cost of Goods Sold    (expense)
//   1410 — Stock                 (asset — per-business named)
// ─────────────────────────────────────────────────────────────

// Map a POS payment_method to its receiving COA code.
function paymentMethodToCOA(method) {
  switch (method) {
    case "cash":
      return "1100";
    case "bank_transfer":
      return "1210";
    case "pos_card":
      return "1210";
    case "paystack":
      return "1210";
    // Anything else (e.g. mixed split-payments we haven't mapped) goes
    // to AR so it can be reconciled later rather than disappearing.
    default:
      return "1310";
  }
}

async function postPosRevenueJournal(client, business, tx, payments, lines) {
  // Sum subtotal and VAT across the sale lines. We recompute here rather
  // than relying on the transaction header so the journal numbers match
  // exactly what was posted to transaction_lines.
  let subtotal = 0;
  let vatTotal = 0;
  const vatRate = getVatRate(business);
  for (const l of lines) {
    const net =
      parseFloat(l.unit_price) * parseInt(l.quantity) -
      parseFloat(l.discount_amount || 0);
    const vat = parseFloat((net * vatRate).toFixed(2));
    subtotal += net;
    vatTotal += vat;
  }
  subtotal = parseFloat(subtotal.toFixed(2));
  vatTotal = parseFloat(vatTotal.toFixed(2));

  // Group payments by COA code so multiple split-payments to the same
  // destination (e.g. two cash payments) book as a single line.
  const debitsByAccount = new Map();
  for (const p of payments) {
    const code = paymentMethodToCOA(p.payment_method);
    const accId = await journalService.getAccountId(client, code);
    if (!accId) {
      logger.warn(
        `[pos] revenue journal — missing COA account ${code} for method ${p.payment_method}`,
      );
      continue;
    }
    debitsByAccount.set(
      accId,
      (debitsByAccount.get(accId) || 0) + parseFloat(p.amount),
    );
  }

  const revAcc = await journalService.getAccountId(client, "4100");
  const vatAcc = await journalService.getAccountId(client, "2210");
  // Sales Revenue (4100) is required. Do NOT silently skip — a missing
  // COA would let the sale succeed with no accounting entry, corrupting
  // the P&L. Throw so the entire transaction rolls back cleanly.
  if (!revAcc) {
    throw Object.assign(
      new Error(
        `COA account 4100 (Sales Revenue) not found for ${business}. ` +
          `Contact your administrator to seed the Chart of Accounts.`,
      ),
      { status: 500 },
    );
  }

  // Build the lines:
  //   DR Cash/Bank   per-account totals
  //     CR Sales Revenue   subtotal
  //     CR VAT Payable     vatTotal  (only if VAT present)
  const journalLines = [];
  for (const [accId, amount] of debitsByAccount.entries()) {
    if (amount > 0)
      journalLines.push({
        account_id: accId,
        debit: parseFloat(amount.toFixed(2)),
        credit: 0,
      });
  }
  journalLines.push({ account_id: revAcc, debit: 0, credit: subtotal });
  if (vatAcc && vatTotal > 0) {
    journalLines.push({ account_id: vatAcc, debit: 0, credit: vatTotal });
  }

  await journalService.postEntry(client, {
    description: `POS Sale ${tx.transaction_number}`,
    referenceType: "pos_transaction",
    referenceId: tx.transaction_id,
    postedBy: tx.served_by,
    lines: journalLines,
  });
}

async function postPosCOGSJournal(client, business, tx, lines) {
  // Compute total COGS using weighted-average unit cost. Skip lines
  // with no product_id (manual line items, services).
  const costable = lines.filter((l) => l.product_id);
  if (costable.length === 0) return;

  const { total_cost } = await stockService.calculateSaleCOGS(
    client,
    costable.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
  );

  if (!total_cost || total_cost <= 0) {
    logger.warn(
      `[pos] COGS journal skipped for tx ${tx.transaction_number}: no cost data`,
    );
    return;
  }

  const cogsAcc = await journalService.getAccountId(client, "5000");
  const inventoryAcc = await journalService.getAccountId(client, "1410");
  // COGS and Inventory accounts are required for correct P&L.
  // Throw rather than silently skip so the transaction rolls back
  // and the admin knows the COA needs to be seeded.
  if (!cogsAcc || !inventoryAcc) {
    throw Object.assign(
      new Error(
        `COA accounts missing for ${business}: ` +
          `${!cogsAcc ? "5000 (COGS) " : ""}${!inventoryAcc ? "1410 (Inventory)" : ""}. ` +
          `Contact your administrator to seed the Chart of Accounts.`,
      ),
      { status: 500 },
    );
  }

  //   DR Cost of Goods Sold   total_cost
  //     CR Stock              total_cost
  await journalService.postEntry(client, {
    description: `COGS for POS Sale ${tx.transaction_number}`,
    referenceType: "pos_transaction_cogs",
    referenceId: tx.transaction_id,
    postedBy: tx.served_by,
    lines: [
      { account_id: cogsAcc, debit: total_cost, credit: 0 },
      { account_id: inventoryAcc, debit: 0, credit: total_cost },
    ],
  });
}

// Delegates to receipt sub-service — PDF + WhatsApp + email + audit.
async function sendReceipt(business, transactionId, options, user) {
  return receiptSvc.sendReceipt(business, transactionId, options || {}, user);
}

// Convenience — returns a Buffer that the caller can stream as a download.
async function downloadReceiptPDF(business, transactionId) {
  return receiptSvc.generatePDF(business, transactionId);
}

// ─────────────────────────────────────────────────────────────
// OFFLINE SYNC (C3)
// Accepts a batch of offline-captured transactions from the POS
// frontend. Each has an offline_id used for idempotency — if a
// transaction with the same offline_id already exists, we skip it
// rather than double-posting.
// ─────────────────────────────────────────────────────────────

async function syncOfflineTransactions(business, transactions, user) {
  const results = [];

  for (const txData of transactions) {
    try {
      // Check idempotency — skip if offline_id already synced
      if (txData.offline_id) {
        const exists = await withBusinessContext(business, async (client) => {
          const { rows } = await client.query(
            `SELECT transaction_id FROM pos_transactions WHERE offline_id = $1`,
            [txData.offline_id],
          );
          return rows.length > 0;
        });
        if (exists) {
          results.push({
            offline_id: txData.offline_id,
            status: "duplicate",
            message: "Already synced",
          });
          continue;
        }
      }

      const tx = await createTransaction(business, txData, user);
      results.push({
        offline_id: txData.offline_id,
        status: "synced",
        transaction_id: tx.transaction_id,
      });
    } catch (err) {
      results.push({
        offline_id: txData.offline_id,
        status: "failed",
        error: err.message,
      });
    }
  }

  return { results, synced: results.filter((r) => r.status === "synced").length };
}

module.exports = {
  getTerminals,
  createTerminal,
  updateTerminal,
  openSession,
  getSession,
  closeSession,
  getXReport,
  getZReport,
  listSessionsWithVariance,
  markReconciled,
  createTransaction,
  syncOfflineTransactions,
  getTransaction,
  voidTransaction,
  sendReceipt,
  downloadReceiptPDF,
  syncOfflineTransactions,
};
