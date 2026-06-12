"use strict";

/**
 * integrations/optimus/optimus.webhook.js
 *
 * Handles inbound Transaction Notification webhooks from Optimus Pay.
 * Fired when money lands on a provisioned virtual account.
 *
 * ACTUAL payload shape (per OptimusPay v2 documentation):
 *   {
 *     "request_ref": "...",
 *     "request_type": "transaction_notification",
 *     "requester": "OptimusVirtual",
 *     "mock_mode": "Live",
 *     "details": {
 *       "amount": 1000,                  // KOBO (inner NIP Amount is naira)
 *       "transaction_type": "collect",
 *       "status": "Successful",
 *       "provider": "OptimusVirtual",
 *       "transaction_ref": "...",        // the ref WE set at open_account
 *       "customer_ref": "...",
 *       "meta": { cr_account, originator_account_name, narration, ... },
 *       "data": { ...raw NIP record... }
 *     },
 *     "app_info": { "app_code": "..." }
 *   }
 *
 * NOTE: There is NO top-level `data` and NO `provider_response_code` in
 * notifications. The previous implementation expected both and therefore
 * rejected every genuine notification with HTTP 400.
 *
 * Verification strategy (defence in depth):
 *   1. Parse + status check on the documented shape.
 *   2. Query-back: re-query the transaction via /v2/transact/query
 *      server-to-server and require "Successful" before fulfilling anything.
 *      Notifications carry no signature we can verify, and some of our
 *      transaction refs are guessable (store-{id}, inv-{id}) — a forged POST
 *      must never be enough to release goods. Toggle with
 *      OPTIMUS_PAY_WEBHOOK_VERIFY=off (mock testing only).
 *   3. Amount guard per payment path — details.amount (kobo) must cover the
 *      expected total. Underpayments are NOT auto-confirmed; they stay in
 *      shared.webhook_log (processed=false, error_message set) for manual
 *      reconciliation.
 *   4. Idempotency via shared.webhook_log on the details.transaction_ref
 *      JSON path (the old code checked a top-level path that never matched).
 *
 * On success, mirrors the Paystack webhook:
 *   - Invoice payment → confirm + post accounting journal
 *   - Campaign order  → confirmOrder via admin.service
 *   - Store order     → fulfillOptimusOrder via store.service
 */

const express = require("express");
const router = express.Router();
const logger = require("../../config/logger");
const config = require("../../config/config");
const { pool } = require("../../config/db");
const { getActiveBusinesses } = require("../../config/businesses");
const optimusService = require("./optimus.service");

router.use(express.json());

router.post("/", async (req, res) => {
  const payload = req.body;

  // 1. Parse the envelope. Documented shape nests everything under
  //    `details`; the legacy/mock shape used `data`. Support both.
  const details = (payload && (payload.details || payload.data)) || null;
  if (!details) {
    logger.warn(
      `[optimus] webhook with unrecognised envelope: ${JSON.stringify(payload || {}).slice(0, 300)}`,
    );
    return res.sendStatus(400);
  }

  const eventStatus = details.status || payload.status || null;
  const transactionRef = details.transaction_ref || null;
  const transactionType = details.transaction_type || "collect";
  const paidKobo = Number(details.amount) || 0;

  // 2. Idempotency — have we already fully processed this transaction_ref?
  //    (Checks both JSON paths so rows logged by older builds still count.)
  if (transactionRef) {
    const existing = await pool.query(
      `SELECT webhook_id FROM shared.webhook_log
       WHERE source = 'optimus'
         AND processed = true
         AND (payload->'details'->>'transaction_ref' = $1
              OR payload->'data'->>'transaction_ref' = $1)
       LIMIT 1`,
      [transactionRef],
    );
    if (existing.rows.length) {
      logger.debug(`[optimus] webhook already processed: ${transactionRef}`);
      return res.sendStatus(200);
    }
  }

  // 3. Log before processing
  const {
    rows: [logged],
  } = await pool.query(
    `INSERT INTO shared.webhook_log (source, event_type, payload, signature_valid)
     VALUES ('optimus', $1, $2, $3)
     RETURNING webhook_id`,
    [
      payload.request_type || eventStatus || "transaction_notification",
      payload,
      // No signature scheme is documented for notifications; recorded as
      // false until Optimus confirms one. Authenticity is established by
      // the query-back step below instead.
      false,
    ],
  );

  // 4. Respond immediately — process async (Optimus shouldn't wait on our
  //    fulfilment pipeline; failures are retried from webhook_log).
  res.sendStatus(200);

  // 5. Only fulfil on Successful
  if (eventStatus !== "Successful") {
    logger.info(
      `[optimus] webhook non-success status=${eventStatus} ref=${transactionRef}`,
    );
    await markProcessed(logged.webhook_id);
    return;
  }

  if (!transactionRef) {
    logger.warn("[optimus] Successful webhook missing transaction_ref");
    await recordError(logged.webhook_id, "missing transaction_ref");
    return;
  }

  // 6. Query-back verification — never trust the webhook body alone.
  if (config.optimusPay.verifyWebhookViaQuery) {
    try {
      const q = await optimusService.queryTransaction(
        transactionRef,
        transactionType,
      );
      if (q.status !== "Successful") {
        logger.warn(
          `[optimus] query-back contradicts webhook: ref=${transactionRef} ` +
            `webhook=Successful query=${q.status} — NOT fulfilling`,
        );
        await recordError(
          logged.webhook_id,
          `query-back returned ${q.status}; possible forged notification`,
        );
        return;
      }
    } catch (err) {
      // Verification unavailable ≠ verified. Leave unprocessed for replay.
      logger.error(
        `[optimus] query-back failed for ref=${transactionRef}: ${err.message} — NOT fulfilling`,
      );
      await recordError(
        logged.webhook_id,
        `query-back failed: ${err.message}`,
      );
      return;
    }
  }

  try {
    await handleTransactionSuccess(transactionRef, paidKobo, details);
    await markProcessed(logged.webhook_id);
  } catch (err) {
    logger.error(
      `[optimus] webhook processing failed for ref=${transactionRef}: ${err.message}`,
    );
    await recordError(logged.webhook_id, err.message);
  }
});

// ── webhook_log helpers ───────────────────────────────────────────────────────

async function markProcessed(webhookId) {
  await pool.query(
    `UPDATE shared.webhook_log SET processed = true, processed_at = now()
     WHERE webhook_id = $1`,
    [webhookId],
  );
}

async function recordError(webhookId, message) {
  try {
    await pool.query(
      `UPDATE shared.webhook_log SET error_message = $1 WHERE webhook_id = $2`,
      [message, webhookId],
    );
  } catch (err) {
    logger.error(`[optimus] failed to record webhook error: ${err.message}`);
  }
}

// ── Event handler ─────────────────────────────────────────────────────────────

/**
 * Route a verified, successful inflow to the matching payment record.
 * @param {string} transactionRef
 * @param {number} paidKobo - inflow amount in kobo (0 if absent from payload)
 * @param {object} details  - full details node, for logging context
 */
async function handleTransactionSuccess(transactionRef, paidKobo, details) {
  const paidNaira = paidKobo / 100;

  // ── Path 1: Invoice payment ───────────────────────────────────────────────
  // Loop every active business looking for a matching invoice payment.
  // Per-business guard: schemas that predate the Optimus columns can't be
  // Optimus invoice payers — skip quietly and keep scanning.
  for (const business of getActiveBusinesses()) {
    let result;
    try {
      result = await pool.query(
        `SELECT payment_id, amount FROM ${business}.invoice_payments
         WHERE optimus_transaction_ref = $1
           AND is_confirmed = false
         LIMIT 1`,
        [transactionRef],
      );
    } catch (err) {
      logger.debug(
        `[optimus] invoice lookup skipped for ${business}: ${err.message}`,
      );
      continue;
    }

    if (result.rows.length) {
      const { payment_id: paymentId, amount: expectedNaira } = result.rows[0];

      // Amount guard — UNDERPAYMENT is never auto-confirmed. Throwing keeps
      // the webhook_log row unprocessed with an error_message, so it
      // surfaces for manual reconciliation instead of silently confirming.
      if (paidKobo > 0 && paidNaira + 0.01 < Number(expectedNaira)) {
        throw new Error(
          `invoice underpayment: expected ₦${expectedNaira}, received ₦${paidNaira} ` +
            `(ref=${transactionRef}, business=${business}) — manual reconciliation required`,
        );
      }
      if (paidKobo > 0 && paidNaira - Number(expectedNaira) > 0.01) {
        logger.warn(
          `[optimus] invoice OVERPAYMENT ref=${transactionRef}: ` +
            `expected ₦${expectedNaira}, received ₦${paidNaira} — confirming, flagging for review`,
        );
      }

      await pool.query(
        `UPDATE ${business}.invoice_payments
         SET is_confirmed = true, confirmed_at = now()
         WHERE payment_id = $1`,
        [paymentId],
      );

      // Post accounting journal
      try {
        const invoicingService = require("../../modules/invoicing/invoicing.service");
        const { withBusinessContext } = require("../../config/db");
        await withBusinessContext(business, async (client) => {
          const {
            rows: [pay],
          } = await client.query(
            `SELECT p.payment_id, p.amount, p.payment_method, p.payment_date,
                    i.invoice_number
             FROM invoice_payments p
             JOIN invoices i ON i.invoice_id = p.invoice_id
             WHERE p.payment_id = $1`,
            [paymentId],
          );
          if (pay) {
            await invoicingService.postPaymentJournal(client, {
              payment: pay,
              invoiceNumber: pay.invoice_number,
              userId: config.systemUserId,
            });
          }
        });
      } catch (jerr) {
        logger.error(
          `[optimus] invoice journal failed ref=${transactionRef} [${business}]: ${jerr.message}`,
        );
      }

      logger.info(
        `[optimus] invoice payment confirmed: ref=${transactionRef} [${business}] ₦${paidNaira}`,
      );
      return;
    }
  }

  // ── Path 2: Campaign storefront order ────────────────────────────────────
  const storefrontService = require("../../modules/sales_campaigns/storefront.service");
  for (const business of getActiveBusinesses()) {
    let rows;
    try {
      ({ rows } = await pool.query(
        `SELECT order_id, total_amount FROM ${business}.campaign_orders
          WHERE optimus_transaction_ref = $1
            AND payment_method = 'optimus_pay'
            AND status = 'pending'
          LIMIT 1`,
        [transactionRef],
      ));
    } catch (err) {
      logger.debug(
        `[optimus] campaign lookup skipped for ${business}: ${err.message}`,
      );
      continue;
    }

    if (rows.length) {
      const expectedNaira = Number(rows[0].total_amount);

      if (paidKobo > 0 && paidNaira + 0.01 < expectedNaira) {
        throw new Error(
          `campaign order underpayment: expected ₦${expectedNaira}, received ₦${paidNaira} ` +
            `(ref=${transactionRef}, business=${business}) — manual reconciliation required`,
        );
      }
      if (paidKobo > 0 && paidNaira - expectedNaira > 0.01) {
        logger.warn(
          `[optimus] campaign OVERPAYMENT ref=${transactionRef}: ` +
            `expected ₦${expectedNaira}, received ₦${paidNaira} — confirming, flagging for review`,
        );
      }

      await storefrontService.handleOptimusConfirmation(
        business,
        rows[0].order_id,
      );
      logger.info(
        `[optimus] campaign order confirmed: ref=${transactionRef} [${business}] ₦${paidNaira}`,
      );
      return;
    }
  }

  // ── Path 3: Storefront (diffusers web store) order ───────────────────────
  // fulfillOptimusOrder does its own lookup by transactionRef and enforces
  // the amount guard internally (paidKobo vs order.total_kobo).
  try {
    const storeService = require("../../modules/store/store.service");
    await storeService.fulfillOptimusOrder(transactionRef, { paidKobo });
    logger.info(
      `[optimus] store order fulfilled: ref=${transactionRef} ₦${paidNaira}`,
    );
    return;
  } catch (err) {
    if (err.status === 404) {
      // Not a store order — fall through to the warning below.
    } else {
      // Includes underpayment errors — propagate so webhook_log records it.
      throw err;
    }
  }

  logger.warn(
    `[optimus] Successful notification with no matching payment: ` +
      `ref=${transactionRef} amount=₦${paidNaira} originator=${details?.meta?.originator_account_name || "?"}`,
  );
}

module.exports = router;
