"use strict";

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const config = require("../../config/config");
const logger = require("../../config/logger");
const { pool } = require("../../config/db");
const { getActiveBusinesses } = require("../../config/businesses");

// Raw body needed for HMAC verification — must be before express.json()
router.use(express.raw({ type: "application/json" }));

router.post("/", async (req, res) => {
  // 1. Verify signature
  const hash = crypto
    .createHmac("sha512", config.paystack.webhookSecret)
    .update(req.body)
    .digest("hex");

  const signatureValid = hash === req.headers["x-paystack-signature"];

  const payload = JSON.parse(req.body.toString());
  const eventType = payload.event;

  // 2. Log the webhook before processing (idempotency check)
  const existing = await pool.query(
    `SELECT webhook_id, processed FROM shared.webhook_log
     WHERE source = 'paystack'
       AND (payload->>'id') = $1
       AND processed = true
     LIMIT 1`,
    [payload.data?.id],
  );

  if (existing.rows.length) {
    logger.debug(`Paystack webhook already processed: ${payload.data?.id}`);
    return res.sendStatus(200); // Acknowledge without reprocessing
  }

  const {
    rows: [logged],
  } = await pool.query(
    `INSERT INTO shared.webhook_log (source, event_type, payload, signature_valid)
     VALUES ('paystack', $1, $2, $3) RETURNING webhook_id`,
    [eventType, payload, signatureValid],
  );

  if (!signatureValid) {
    logger.warn(`Invalid Paystack webhook signature`);
    return res.sendStatus(400);
  }

  // 3. Respond immediately — process async
  res.sendStatus(200);

  // 4. Handle event
  try {
    if (eventType === "charge.success") {
      await handleChargeSuccess(payload.data);
    }
    // Mark processed
    await pool.query(
      `UPDATE shared.webhook_log SET processed = true, processed_at = now()
       WHERE webhook_id = $1`,
      [logged.webhook_id],
    );
  } catch (err) {
    logger.error(`Paystack webhook processing failed: ${eventType}`, err);
    await pool.query(
      `UPDATE shared.webhook_log SET error_message = $1 WHERE webhook_id = $2`,
      [err.message, logged.webhook_id],
    );
  }
});

async function handleChargeSuccess(data) {
  // Find the invoice or POS payment split by reference
  const reference = data.reference;

  // Try to match against jewelry invoices
  for (const business of getActiveBusinesses()) {
    const result = await pool.query(
      `SET LOCAL search_path TO ${business}, shared, public;
       SELECT payment_id FROM invoice_payments
       WHERE paystack_reference = $1 LIMIT 1`,
      [reference],
    );
    if (result.rows.length) {
      const paymentId = result.rows[0].payment_id;
      await pool.query(
        `UPDATE invoice_payments
         SET is_confirmed = true, confirmed_at = now()
         WHERE paystack_reference = $1`,
        [reference],
      );
      // Post the cash-collection journal now that the gateway confirmed.
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
          `Paystack payment journal failed: ${reference} [${business}]`,
          jerr,
        );
      }
      logger.info(`Paystack payment confirmed: ${reference} [${business}]`);
      return;
    }
  }

  // No matching invoice payment — try campaign storefront orders.
  // Reference for those is the order_id UUID itself (not a separate column).
  try {
    const storefrontService = require(
      "../../modules/sales_campaigns/storefront.service",
    );
    const { rows: [order] } = await pool.query(
      `SELECT co.order_id, sc.business
         FROM jewelry.campaign_orders co
         JOIN jewelry.sales_campaigns sc ON sc.campaign_id = co.campaign_id
        WHERE co.order_id::TEXT = $1 AND co.payment_method = 'paystack'
          AND co.status = 'pending'
       UNION ALL
       SELECT co.order_id, sc.business
         FROM diffusers.campaign_orders co
         JOIN diffusers.sales_campaigns sc ON sc.campaign_id = co.campaign_id
        WHERE co.order_id::TEXT = $1 AND co.payment_method = 'paystack'
          AND co.status = 'pending'
       LIMIT 1`,
      [reference],
    );
    if (order) {
      await storefrontService.handlePaystackConfirmation(
        order.business,
        order.order_id,
      );
      logger.info(
        `Paystack campaign order confirmed: ${reference} [${order.business}]`,
      );
      return;
    }
  } catch (err) {
    logger.error(
      `Paystack campaign order confirmation failed: ${reference}`,
      err.message,
    );
  }

  logger.warn(`Paystack charge.success with no matching payment: ${reference}`);
}

module.exports = router;
