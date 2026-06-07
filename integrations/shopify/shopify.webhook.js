"use strict";

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const config = require("../../config/config");
const logger = require("../../config/logger");
const { withBusinessContext, pool } = require("../../config/db");

router.use(express.raw({ type: "application/json" }));

router.post("/orders/create", async (req, res) => {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  const computed = crypto
    .createHmac("sha256", config.shopify.webhookSecret)
    .update(req.body)
    .digest("base64");

  if (hmac !== computed) return res.sendStatus(401);

  res.sendStatus(200); // Always respond quickly

  const order = JSON.parse(req.body);
  const business = req.headers["x-hub-business"] || "jewelry"; // Sent via Shopify custom header

  try {
    await withBusinessContext(business, async (client) => {
      // 1. Find or create contact
      const email = order.customer?.email;
      let contactId;

      if (email) {
        const existing = await client.query(
          `SELECT contact_id FROM shared.contacts WHERE email = $1 LIMIT 1`,
          [email],
        );
        if (existing.rows.length) {
          contactId = existing.rows[0].contact_id;
        } else {
          const ins = await client.query(
            `INSERT INTO shared.contacts
               (contact_type, display_name, first_name, last_name, email, primary_phone, source)
             VALUES (ARRAY['customer'], $1, $2, $3, $4, $5, 'shopify')
             RETURNING contact_id`,
            [
              `${order.customer.first_name} ${order.customer.last_name}`.trim(),
              order.customer.first_name,
              order.customer.last_name,
              email,
              order.customer.phone || "",
            ],
          );
          contactId = ins.rows[0].contact_id;
        }
      }

      // 2. Create sales order
      const {
        rows: [seq],
      } = await client.query(
        `UPDATE shared.document_numbering
         SET next_number = next_number + 1
         WHERE business = $1 AND document_type = 'sales_order'
         RETURNING prefix, next_number, padding`,
        [business],
      );
      const orderNumber = seq
        ? `${seq.prefix}-${String(seq.next_number).padStart(seq.padding, "0")}`
        : `SHOP-${order.id}`;

      await client.query(
        `INSERT INTO sales_orders
           (order_number, contact_id, status, fulfilment_type, total_amount, amount_paid)
         VALUES ($1, $2, 'confirmed', 'delivery', $3, $4)`,
        [
          orderNumber,
          contactId,
          order.total_price,
          order.financial_status === "paid" ? order.total_price : 0,
        ],
      );

      logger.info(
        `Shopify order ${order.id} created as ${orderNumber} [${business}]`,
      );
    });
  } catch (err) {
    logger.error("Shopify order webhook failed", err);
  }
});

module.exports = router;
