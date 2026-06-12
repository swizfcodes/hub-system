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
const invoicingSvc = require("../invoicing/invoicing.service");
const { getRate } = require("../../lib/currency/converter");

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
      // Coerce string numerics from pg driver / frontend cache
      line.quantity = Number(line.quantity);
      line.unit_price = Number(line.unit_price);
      line.discount_amount = Number(line.discount_amount || 0);

      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw Object.assign(
          new Error(`Invalid quantity for line: ${line.description || line.product_id}. Must be a positive whole number.`),
          { status: 400 },
        );
      }
      if (!Number.isFinite(line.unit_price) || line.unit_price < 0) {
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

    // ── Currency resolution ────────────────────────────────────
    const currency = (data.currency || "NGN").toUpperCase();
    let exchangeRate = 1;
    if (currency !== "NGN") {
      if (data.exchange_rate && parseFloat(data.exchange_rate) > 0) {
        exchangeRate = parseFloat(data.exchange_rate);
      } else {
        const stored = await getRate(currency, "NGN");
        if (!stored) {
          throw Object.assign(
            new Error(`No exchange rate found for ${currency}. Sync rates first.`),
            { status: 400 },
          );
        }
        exchangeRate = parseFloat(stored.rate);
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
            actionUrl: "/pos",
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
    // VAT toggle: when the cashier turns VAT off for this sale we record
    // it zero-rated. The flag is persisted on the transaction so any
    // document generated from it later (e.g. an invoice) stays consistent.
    const vatExempt = data.apply_vat === false || data.vat_exempt === true;
    // VAT rate from business_config (cached) — see config/businesses.
    const vatRate = vatExempt ? 0 : getVatRate(business);
    for (const l of data.lines) {
      const net = Math.round((l.unit_price * l.quantity - (l.discount_amount || 0)) * 100) / 100;
      discountTotal = Math.round((discountTotal + (l.discount_amount || 0)) * 100) / 100;
      subtotal = Math.round((subtotal + net) * 100) / 100;
      vatTotal = Math.round((vatTotal + Math.round(net * vatRate * 100) / 100) * 100) / 100;
    }
    const totalAmount = Math.round((subtotal + vatTotal) * 100) / 100; // NGN
    const totalPaid = Math.round(
      data.payments.reduce((s, p) => s + parseFloat(p.amount), 0) * 100
    ) / 100; // tendered, in the sale currency

    // Change handling toggle:
    //   "return" (default) — overpayment is handed back to the customer.
    //   "keep"             — overpayment is retained as Other Income.
    // Express change in the tender currency (what the customer paid in,
    // matching the receipt) by converting the NGN sale total back via the
    // rate. For NGN sales exchangeRate is 1, so this is unchanged.
    const changeHandling = data.change_handling === "keep" ? "keep" : "return";
    const saleTotalInTender =
      Math.round((totalAmount / exchangeRate) * 100) / 100;
    const overpayment =
      Math.round(Math.max(0, totalPaid - saleTotalInTender) * 100) / 100;
    const change = changeHandling === "keep" ? 0 : overpayment;

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
      currency,
      exchange_rate: currency !== "NGN" ? exchangeRate : null,
      vat_exempt: vatExempt,
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
          fromLocationId: session.location_id,
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
      exchangeRate,
      changeHandling,
      vatExempt,
    );
    await postPosCOGSJournal(client, business, tx, data.lines);

    // ── POS → sales_orders bridge ──────────────────────────────
    // Insert a sales_orders row so POS transactions appear in
    // the unified Sales → Orders view. This runs inside the same
    // transaction so it either commits with the POS sale or not.
    const soNumber = await nextDocumentNumber(client, business, "sales_order");
    const { rows: [bridgeOrder] } = await client.query(
      `INSERT INTO sales_orders
         (order_number, contact_id, status, fulfilment_type,
          source, pos_transaction_id,
          subtotal, discount_total, vat_amount,
          total_amount, amount_paid, created_by,
          currency, exchange_rate)
       VALUES ($1, $2, 'confirmed', $3,
               'pos', $4,
               $5, $6, $7,
               $8, $9, $10,
               $11, $12)
       RETURNING order_id`,
      [
        soNumber,
        data.contact_id || null,
        data.fulfilment_type || "walk_in",
        tx.transaction_id,
        subtotal,
        discountTotal,
        vatTotal,
        totalAmount,
        totalAmount, // fully paid at POS
        user.user_id,
        currency,
        currency !== "NGN" ? exchangeRate : null,
      ],
    );

    // Copy POS transaction lines to order_lines for the bridge row
    for (let i = 0; i < data.lines.length; i++) {
      const l = data.lines[i];
      const net = l.unit_price * l.quantity - (l.discount_amount || 0);
      await client.query(
        `INSERT INTO order_lines
           (order_id, product_id, description, quantity, unit_price, line_total, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'fulfilled')`,
        [
          bridgeOrder.order_id,
          l.product_id || null,
          l.description,
          l.quantity,
          l.unit_price,
          net,
        ],
      );
    }

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
    return { ...tx, change_given: change, bridge_order_id: bridgeOrder.order_id };
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

  // Auto-send receipt by email (non-fatal — never block the sale)
  if (data.contact_id) {
    try {
      await receiptSvc.sendReceipt(
        business,
        result.transaction_id,
        { channel: "email" },
        user,
      );
    } catch (err) {
      logger.error(
        `[pos] auto-receipt email failed for tx ${result.transaction_id}: ${err.message}`,
      );
    }
  }

  return result;
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

    // Resolve the terminal's location so returned stock goes back to the
    // correct location. The session may already be closed, so we don't
    // filter by status — we just need the location_id.
    const { rows: [sessionLoc] } = await client.query(
      `SELECT t.location_id
       FROM pos_sessions s
       JOIN pos_terminals t ON t.terminal_id = s.terminal_id
       WHERE s.session_id = $1`,
      [tx.session_id],
    );
    const returnLocationId = sessionLoc?.location_id || null;

    const lines = await repo.getTransactionProductLines(client, transactionId);
    for (const l of lines) {
      await stockService.recordMovement(client, {
        business,
        productId: l.product_id,
        movementType: "return_from_customer",
        quantity: l.quantity,
        direction: 1,
        toLocationId: returnLocationId,
        referenceType: "pos_transaction",
        referenceId: transactionId,
        performedBy: user.user_id,
        notes: `Void: ${void_reason}`,
      });
    }

    // Cancel the bridge sales_order if one exists
    await client.query(
      `UPDATE sales_orders SET status = 'cancelled', updated_at = now()
       WHERE pos_transaction_id = $1`,
      [transactionId],
    );

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

async function postPosRevenueJournal(
  client,
  business,
  tx,
  payments,
  lines,
  exchangeRate = 1,
  changeHandling = "return",
  vatExempt = false,
) {
  // Sum subtotal and VAT across the sale lines. We recompute here rather
  // than relying on the transaction header so the journal numbers match
  // exactly what was posted to transaction_lines.
  //
  // IMPORTANT: line `unit_price` is ALREADY in NGN. The POS cart prices
  // products in the base currency (NGN) and only the *payment* is taken
  // in a foreign currency (see PaymentSheet on the client). So the
  // revenue and VAT credits below are used as-is — they must NOT be
  // multiplied by the exchange rate. Only the cash/bank debit (the
  // foreign tender) is converted back to NGN. Converting the credits too
  // double-counts the rate and throws "Journal out of balance".
  let subtotal = 0;
  let vatTotal = 0;
  // Honour the per-sale VAT toggle so the journal's VAT matches what was
  // booked to the transaction (zero when the sale is VAT-exempt).
  const vatRate = vatExempt ? 0 : getVatRate(business);
  for (const l of lines) {
    const net =
      parseFloat(l.unit_price) * parseInt(l.quantity) -
      parseFloat(l.discount_amount || 0);
    const vat = parseFloat((net * vatRate).toFixed(2));
    subtotal += net;
    vatTotal += vat;
  }
  const subtotalNGN = parseFloat(subtotal.toFixed(2));
  const vatTotalNGN = parseFloat(vatTotal.toFixed(2));
  const saleTotalNGN = parseFloat((subtotalNGN + vatTotalNGN).toFixed(2));

  // Group payments by COA code so multiple split-payments to the same
  // destination (e.g. two cash payments) book as a single line. Each
  // payment is taken in the sale currency, so convert it to NGN here.
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
    const amtNGN = parseFloat((parseFloat(p.amount) * exchangeRate).toFixed(2));
    debitsByAccount.set(accId, (debitsByAccount.get(accId) || 0) + amtNGN);
  }

  // Fold an NGN amount into the largest debit (conventionally the cash
  // drawer — where change is given from). Used to absorb sub-unit forex
  // rounding and returned change so the entry always balances.
  const addToLargestDebit = (delta) => {
    if (Math.abs(delta) < 0.01 || debitsByAccount.size === 0) return;
    let largestAcc = null;
    let largestAmt = -Infinity;
    for (const [accId, amt] of debitsByAccount.entries()) {
      if (amt > largestAmt) {
        largestAmt = amt;
        largestAcc = accId;
      }
    }
    debitsByAccount.set(
      largestAcc,
      parseFloat((largestAmt + delta).toFixed(2)),
    );
  };

  // Reconcile the debit (tender) side against the NGN sale value.
  //   • "return" (default): the customer is handed any overpayment back,
  //     so the recognised cash receipt equals subtotal + VAT. Pull the
  //     debit side down to the sale total — this also absorbs the sub-unit
  //     residual left by converting a 2dp foreign tender (rate × 0.005 ≈
  //     a few naira), which would otherwise trip the DR=CR balance check.
  //   • "keep": the customer leaves the overpayment with us. Keep the full
  //     converted tender on the debit side and book the surplus to Other
  //     Income, so DR (cash) = CR (revenue + VAT + other income).
  const debitSum = parseFloat(
    [...debitsByAccount.values()].reduce((s, v) => s + v, 0).toFixed(2),
  );
  let otherIncomeNGN = 0;
  if (changeHandling === "keep") {
    const overage = parseFloat((debitSum - saleTotalNGN).toFixed(2));
    if (overage > 0) {
      otherIncomeNGN = overage;
    } else if (overage < 0) {
      // Tender rounded a hair under the sale value — treat as forex
      // rounding rather than negative income.
      addToLargestDebit(-overage);
    }
  } else {
    addToLargestDebit(parseFloat((saleTotalNGN - debitSum).toFixed(2)));
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
  //   DR Cash/Bank   per-account totals (in NGN)
  //     CR Sales Revenue   subtotal (in NGN)
  //     CR VAT Payable     vatTotal (in NGN, only if present)
  const journalLines = [];
  for (const [accId, amount] of debitsByAccount.entries()) {
    if (amount > 0)
      journalLines.push({
        account_id: accId,
        debit: parseFloat(amount.toFixed(2)),
        credit: 0,
      });
  }
  journalLines.push({ account_id: revAcc, debit: 0, credit: subtotalNGN });
  if (vatAcc && vatTotalNGN > 0) {
    journalLines.push({ account_id: vatAcc, debit: 0, credit: vatTotalNGN });
  }

  // Retained change → Other Income (4400). This is NOT a forex gain (which
  // would come from a rate movement) — it is an overpayment the customer
  // chose to leave, so it is booked as miscellaneous income.
  if (otherIncomeNGN > 0) {
    const otherIncAcc = await journalService.getAccountId(client, "4400");
    if (!otherIncAcc) {
      throw Object.assign(
        new Error(
          `COA account 4400 (Other Income) not found for ${business}. ` +
            `It is required to retain change as income — seed the Chart of Accounts.`,
        ),
        { status: 500 },
      );
    }
    journalLines.push({
      account_id: otherIncAcc,
      debit: 0,
      credit: otherIncomeNGN,
    });
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

// ─────────────────────────────────────────────────────────────
// INVOICE FROM POS TRANSACTION
//
// Creates a formal invoice from a completed POS transaction.
// Used for bank-transfer walk-in sales where the customer needs
// a document showing the company's account details.
//
// Idempotent — if an invoice already exists for this transaction
// the existing one is returned without creating a duplicate.
// ─────────────────────────────────────────────────────────────
async function createInvoiceFromTransaction(business, transactionId, { due_date } = {}, user) {
  return withBusinessContext(business, async (client) => {
    // 1. Fetch and validate the transaction
    const tx = await repo.findTransactionById(client, transactionId);
    if (!tx)
      throw Object.assign(new Error("Transaction not found"), { status: 404 });
    if (tx.status !== "completed")
      throw Object.assign(
        new Error(`Cannot invoice a ${tx.status} transaction`),
        { status: 400 },
      );

    // 2. Idempotency — return existing invoice if already generated
    const existing = await repo.findInvoiceByPosTransactionId(client, transactionId);
    if (existing) {
      const bankAccount = await repo.findPrimaryBankAccount(client, business);
      return { ...existing, bank_account: bankAccount || null };
    }

    // 3. Get business primary bank account for payment instructions
    const bankAccount = await repo.findPrimaryBankAccount(client, business);
    const paymentInstructions = bankAccount
      ? [
          `Please transfer the total amount to:`,
          `Bank: ${bankAccount.bank_name}`,
          `Account Name: ${bankAccount.account_name}`,
          `Account Number: ${bankAccount.account_number}`,
          bankAccount.sort_code ? `Sort Code: ${bankAccount.sort_code}` : null,
          ``,
          `Use receipt number ${tx.transaction_number} as your transfer reference.`,
        ]
          .filter((l) => l !== null)
          .join("\n")
      : null;

    // 4. Create the invoice record
    const invoiceNumber = await nextDocumentNumber(client, business, "invoice");
    // Mirror the sale's VAT treatment — a VAT-exempt POS sale must not have
    // VAT re-added on its invoice.
    const vatRate = tx.vat_exempt ? 0 : getVatRate(business);
    let subtotal = 0, vatTotal = 0;
    for (const l of tx.lines || []) {
      const net =
        parseFloat(l.unit_price) * parseInt(l.quantity) -
        parseFloat(l.discount_amount || 0);
      subtotal += net;
      vatTotal += net * vatRate;
    }
    subtotal   = Math.round(subtotal  * 100) / 100;
    vatTotal   = Math.round(vatTotal  * 100) / 100;
    const total = Math.round((subtotal + vatTotal) * 100) / 100;

    // due_date defaults to 7 days from today
    const resolvedDueDate =
      due_date ||
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { rows: [inv] } = await client.query(
      `INSERT INTO invoices
         (invoice_number, invoice_type, contact_id, pos_transaction_id,
          status, issue_date, due_date,
          subtotal, discount_total, vat_amount, total_amount,
          currency, payment_instructions, created_by)
       VALUES ($1,'pos_sale',$2,$3,
               'draft', CURRENT_DATE, $4,
               $5, 0, $6, $7,
               'NGN', $8, $9)
       RETURNING *`,
      [
        invoiceNumber,
        tx.contact_id || null,
        transactionId,
        resolvedDueDate,
        subtotal, vatTotal, total,
        paymentInstructions,
        user.user_id,
      ],
    );

    // 5. Copy transaction lines to invoice_lines
    const lines = tx.lines || [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const net =
        parseFloat(l.unit_price) * parseInt(l.quantity) -
        parseFloat(l.discount_amount || 0);
      const vatAmt = Math.round(net * vatRate * 100) / 100;
      await client.query(
        `INSERT INTO invoice_lines
           (invoice_id, product_id, description, quantity, unit_price,
            discount_amount, vat_rate, vat_amount, line_total, display_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          inv.invoice_id,
          l.product_id || null,
          l.description,
          l.quantity,
          l.unit_price,
          l.discount_amount || 0,
          vatRate,
          vatAmt,
          Math.round((net + vatAmt) * 100) / 100,
          i,
        ],
      );
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "pos",
      action: "create",
      table: "invoices",
      recordId: inv.invoice_id,
      after: inv,
    });

    return { ...inv, bank_account: bankAccount || null };
  });
}

// ─────────────────────────────────────────────────────────────
// CONFIRM BANK TRANSFER PAYMENT
//
// Called by staff once they verify the bank transfer has arrived
// (checked on the POS machine / banking app). Finds the invoice
// linked to the transaction, records the payment as confirmed,
// marks the invoice paid, and sends the itemised receipt by email.
// ─────────────────────────────────────────────────────────────
async function confirmTransactionPayment(business, transactionId, { reference, notes } = {}, user) {
  // 1. Find the linked invoice
  const inv = await withBusinessContext(business, async (client) =>
    repo.findInvoiceByPosTransactionId(client, transactionId),
  );
  if (!inv)
    throw Object.assign(
      new Error(
        "No invoice found for this transaction. Generate an invoice first.",
      ),
      { status: 404 },
    );
  if (inv.status === "paid")
    throw Object.assign(new Error("Invoice is already marked as paid"), {
      status: 409,
    });

  // 2. Record the payment against the invoice (triggers journal + loyalty)
  await invoicingSvc.recordPayment(
    business,
    inv.invoice_id,
    {
      amount: parseFloat(inv.total_amount),
      payment_method: "bank_transfer",
      reference: reference || null,
      is_confirmed: true,
      notes: notes || "Confirmed at POS terminal",
    },
    user,
  );

  // 3. Send receipt by email — non-fatal if contact has no email
  let receiptSent = false;
  let receiptError = null;
  try {
    const result = await receiptSvc.sendReceipt(
      business,
      transactionId,
      { channel: "email", invoiceNumber: inv.invoice_number },
      user,
    );
    receiptSent = result.sent === true;
    if (!result.sent) receiptError = result.reason || "No email address on file";
  } catch (err) {
    logger.warn(
      `[pos] receipt email failed after payment confirm for tx ${transactionId}: ${err.message}`,
    );
    receiptError = err.message;
  }

  return {
    confirmed: true,
    invoice_id: inv.invoice_id,
    invoice_number: inv.invoice_number,
    receipt_sent: receiptSent,
    receipt_error: receiptError,
  };
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
  createInvoiceFromTransaction,
  confirmTransactionPayment,
};
