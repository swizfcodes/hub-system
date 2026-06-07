"use strict";

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const config = require("../../config/config");
const logger = require("../../config/logger");
const { pool } = require("../../config/db");
const { getActiveBusinesses } = require("../../config/businesses");

router.use(express.json());

router.post("/", async (req, res) => {
  const signature = req.headers["verif-hash"];
  if (signature !== config.flutterwave.webhookSecret) {
    logger.warn("Invalid Flutterwave webhook signature");
    return res.sendStatus(401);
  }

  res.sendStatus(200); // Respond immediately

  const { event, data } = req.body;

  // Log webhook
  await pool
    .query(
      `INSERT INTO shared.webhook_log (source, event_type, payload, signature_valid)
     VALUES ('flutterwave', $1, $2, true)`,
      [event, req.body],
    )
    .catch(() => {});

  try {
    if (event === "charge.completed" && data.status === "successful") {
      // Find invoice payment by flutterwave reference
      for (const business of getActiveBusinesses()) {
        const upd = await pool
          .query(
            `
          UPDATE ${business}.invoice_payments
          SET is_confirmed = true, confirmed_at = now()
          WHERE flutterwave_reference = $1
          RETURNING payment_id
        `,
            [data.tx_ref],
          )
          .catch(() => null);

        if (upd && upd.rows.length) {
          const paymentId = upd.rows[0].payment_id;
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
              `Flutterwave payment journal failed: ${data.tx_ref} [${business}]`,
              jerr,
            );
          }
        }
      }
      logger.info(`Flutterwave payment confirmed: ${data.tx_ref}`);
    }
  } catch (err) {
    logger.error("Flutterwave webhook processing error", err);
  }
});

module.exports = router;
