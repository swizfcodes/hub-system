"use strict";

/**
 * scripts/backfillDeliveries.js
 *
 * One-time backfill: creates a delivery record for every sales order with
 * status='awaiting_dispatch' that has no corresponding row in the deliveries
 * table. This fixes orders that were handed to logistics before the
 * handToLogistics fix that introduced automatic delivery creation.
 *
 * Safe to re-run — skips orders that already have a delivery.
 *
 * Usage:
 *   node scripts/backfillDeliveries.js
 */

require("dotenv").config();
const { pool, nextDocumentNumber } = require("../config/db");
const { loadActiveBusinesses }     = require("../config/businesses");
const logger                       = require("../config/logger");

async function backfillBusiness(business) {
  const client = await pool.connect();
  try {
    // Check which optional columns exist on this business's sales_orders
    const { rows: cols } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'sales_orders'`,
      [business],
    );
    const colSet = new Set(cols.map((c) => c.column_name));
    const addrCol = colSet.has("delivery_address") ? "o.delivery_address" : "NULL";
    const courierCol = colSet.has("courier_preference") ? "o.courier_preference" : "NULL";

    // Find awaiting_dispatch orders with no delivery record
    const { rows: orders } = await client.query(
      `SELECT o.order_id, o.contact_id,
              ${addrCol} AS delivery_address,
              ${courierCol} AS courier_preference
       FROM ${business}.sales_orders o
       WHERE o.status = 'awaiting_dispatch'
         AND NOT EXISTS (
           SELECT 1 FROM ${business}.deliveries d
           WHERE d.reference_type = 'sales_order'
             AND d.reference_id   = o.order_id
         )`,
    );

    if (!orders.length) {
      logger.info(`[${business}] No orphaned awaiting_dispatch orders found.`);
      return;
    }

    logger.info(`[${business}] Found ${orders.length} order(s) to backfill.`);

    for (const order of orders) {
      await client.query("BEGIN");
      try {
        const deliveryNumber = await nextDocumentNumber(client, business, "delivery");

        let addr;
        if (!order.delivery_address) {
          addr = JSON.stringify({ line1: "Address not recorded" });
        } else if (typeof order.delivery_address === "object") {
          addr = JSON.stringify(order.delivery_address);
        } else {
          // Plain string — wrap it so PostgreSQL accepts it as JSON
          try {
            JSON.parse(order.delivery_address); // already valid JSON?
            addr = order.delivery_address;
          } catch {
            addr = JSON.stringify({ line1: String(order.delivery_address) });
          }
        }

        const { rows: [delivery] } = await client.query(
          `INSERT INTO ${business}.deliveries
             (delivery_number, reference_type, reference_id, contact_id,
              delivery_address, courier, status, delivery_fee, fee_borne_by)
           VALUES ($1,'sales_order',$2,$3,$4,$5,'pending_dispatch',0,'customer')
           RETURNING delivery_id`,
          [
            deliveryNumber,
            order.order_id,
            order.contact_id,
            addr,
            order.courier_preference || null,
          ],
        );

        // Copy order lines into delivery items
        const { rows: lines } = await client.query(
          `SELECT product_id, description, quantity
           FROM ${business}.order_lines
           WHERE order_id = $1`,
          [order.order_id],
        );

        for (const line of lines) {
          await client.query(
            `INSERT INTO ${business}.delivery_items
               (delivery_id, product_id, description, quantity)
             VALUES ($1,$2,$3,$4)`,
            [delivery.delivery_id, line.product_id, line.description, line.quantity],
          );
        }

        // Initial tracking entry
        await client.query(
          `INSERT INTO ${business}.delivery_tracking
             (delivery_id, status, source, message)
           VALUES ($1,'pending_dispatch','system','Backfilled — delivery created from existing sales order')`,
          [delivery.delivery_id],
        );

        await client.query("COMMIT");
        logger.info(`[${business}] Created ${deliveryNumber} for order ${order.order_id}`);
      } catch (err) {
        await client.query("ROLLBACK");
        logger.error(`[${business}] Failed for order ${order.order_id}: ${err.message}`);
      }
    }
  } finally {
    client.release();
  }
}

async function main() {
  const businesses = await loadActiveBusinesses();
  for (const biz of businesses) {
    await backfillBusiness(biz);
  }
  logger.info("Backfill complete.");
  await pool.end();
}

main().catch((err) => {
  logger.error("Backfill failed:", err);
  process.exit(1);
});
