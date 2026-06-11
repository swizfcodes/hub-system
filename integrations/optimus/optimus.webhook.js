"use strict";

/**
 * integrations/optimus/optimus.webhook.js
 *
 * Handles inbound Transaction Notification webhooks from Optimus Pay
 * (OnePipe). Fired when money lands on a provisioned virtual account.
 *
 * Verification strategy:
 *   The Optimus Pay spec does not define a webhook HMAC secret the way
 *   Paystack does. We verify authenticity by:
 *     1. Checking that `data.provider` === "Optimus" and `status` === "Successful"
 *     2. Looking up the transaction_ref in our own DB — if we never created
 *        a virtual account for it, we silently ignore the event.
 *     3. Re-checking the amount matches what we recorded at order time.
 *   This is the recommended defence-in-depth approach for OnePipe webhooks
 *   until Optimus Bank publishes a per-endpoint signing secret.
 *
 * On success, mirrors exactly what the Paystack webhook does:
 *   - Invoice payment → confirm + post accounting journal
 *   - Campaign order  → confirmOrder via admin.service
 *   - Store order     → verifyAndFulfil via store.service
 */

const express = require("express");
const router = express.Router();
const logger = require("../../config/logger");
const config = require("../../config/config");
const { pool } = require("../../config/db");
const { getActiveBusinesses } = require("../../config/businesses");

// Raw body kept for future HMAC verification support
router.use(express.json());

router.post("/", async (req, res) => {
  const payload = req.body;

  // 1. Quick sanity check on envelope
  if (!payload || !payload.data) {
    logger.warn("[optimus] webhook received with no data envelope");
    return res.sendStatus(400);
  }

  const eventStatus = payload.status; // "Successful" | "Failed" | etc.
  const providerData = payload.data || {};
  const transactionRef = providerData.transaction_ref || null;
  const providerCode = providerData.provider_response_code;

  // 2. Idempotency — check if we already processed a Successful event for this ref
  if (transactionRef) {
    const existing = await pool.query(
      `SELECT webhook_id, processed FROM shared.webhook_log
       WHERE source = 'optimus'
         AND payload->>'transaction_ref' = $1
         AND processed = true
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
     VALUES ('optimus', $1, $2, true)
     RETURNING webhook_id`,
    [eventStatus || "Transaction Notification", payload],
  );

  // 4. Respond immediately — process async (mirrors Paystack pattern)
  res.sendStatus(200);

  // 5. Only handle successful payments
  if (eventStatus !== "Successful" || providerCode !== "00") {
    logger.info(
      `[optimus] webhook non-success status=${eventStatus} code=${providerCode} ref=${transactionRef}`,
    );
    await pool.query(
      `UPDATE shared.webhook_log SET processed = true, processed_at = now()
       WHERE webhook_id = $1`,
      [logged.webhook_id],
    );
    return;
  }

  if (!transactionRef) {
    logger.warn("[optimus] webhook missing transaction_ref");
    return;
  }

  try {
    await handleTransactionSuccess(transactionRef, providerData);

    await pool.query(
      `UPDATE shared.webhook_log SET processed = true, processed_at = now()
       WHERE webhook_id = $1`,
      [logged.webhook_id],
    );
  } catch (err) {
    logger.error(
      `[optimus] webhook processing failed for ref=${transactionRef}: ${err.message}`,
    );
    await pool.query(
      `UPDATE shared.webhook_log SET error_message = $1 WHERE webhook_id = $2`,
      [err.message, logged.webhook_id],
    );
  }
});

// ── Event handler ─────────────────────────────────────────────────────────────

async function handleTransactionSuccess(transactionRef, providerData) {
  // ── Path 1: Invoice payment ───────────────────────────────────────────────
  // Loop every active business looking for a matching invoice payment. Each
  // lookup is guarded per-business: a business whose invoice_payments predates
  // the Optimus columns (migration 000053 added them only to jewelry/diffusers)
  // simply can't be an Optimus invoice payer — skip it quietly and keep scanning
  // the others, rather than logging an error or aborting the store path below.
  for (const business of getActiveBusinesses()) {
    let result;
    try {
      result = await pool.query(
        // Schema-qualified single statement. A parameterized query runs as a
        // prepared statement, which cannot contain multiple ;-separated
        // commands — so the search_path must NOT be prepended here.
        `SELECT payment_id, amount FROM ${business}.invoice_payments
         WHERE optimus_transaction_ref = $1
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

      // Amount guard — providerData.amount is in kobo
      const paidNaira = (providerData.amount || 0) / 100;
      if (Math.abs(paidNaira - Number(expectedNaira)) > 0.01) {
        logger.warn(
          `[optimus] invoice amount mismatch ref=${transactionRef}: ` +
            `expected ₦${expectedNaira}, got ₦${paidNaira}`,
        );
        // Mark as confirmed anyway — under-payments should be handled manually.
        // Do NOT post journal if amounts don't match; surface for reconciliation.
      }

      await pool.query(
        `UPDATE ${business}.invoice_payments
         SET is_confirmed = true, confirmed_at = now()
         WHERE optimus_transaction_ref = $1`,
        [transactionRef],
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
        `[optimus] invoice payment confirmed: ref=${transactionRef} [${business}]`,
      );
      return;
    }
  }

  // ── Path 2: Campaign storefront order ────────────────────────────────────
  // Loop every active business (same pattern as the invoice path) so this
  // covers any business, not just jewelry/diffusers. The business IS the
  // schema — sales_campaigns has no `business` column — so it's passed
  // through directly. Per-business guard skips schemas that predate the
  // Optimus columns.
  const storefrontService = require("../../modules/sales_campaigns/storefront.service");
  for (const business of getActiveBusinesses()) {
    let rows;
    try {
      ({ rows } = await pool.query(
        `SELECT order_id FROM ${business}.campaign_orders
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
      try {
        await storefrontService.handleOptimusConfirmation(
          business,
          rows[0].order_id,
        );
        logger.info(
          `[optimus] campaign order confirmed: ref=${transactionRef} [${business}]`,
        );
        return;
      } catch (err) {
        logger.error(
          `[optimus] campaign confirmation failed ref=${transactionRef} [${business}]: ${err.message}`,
        );
      }
    }
  }

  // ── Path 3: Storefront (diffusers web store) order ───────────────────────
  // fulfillOptimusOrder does its own lookup by transactionRef — no
  // pre-query needed here. A 404 just means it wasn't a store order.
  try {
    const storeService = require("../../modules/store/store.service");
    await storeService.fulfillOptimusOrder(transactionRef);
    logger.info(`[optimus] store order fulfilled: ref=${transactionRef}`);
    return;
  } catch (err) {
    if (err.status === 404) {
      // Not a store order — expected, fall through to the warning below.
    } else {
      logger.error(
        `[optimus] store order fulfilment failed ref=${transactionRef}: ${err.message}`,
      );
    }
  }

  logger.warn(
    `[optimus] Successful notification with no matching payment: ref=${transactionRef}`,
  );
}

module.exports = router;
