"use strict";

const express = require("express");
const router = express.Router();
const logger = require("../../config/logger");
const { pool } = require("../../config/db");
const { emitToBusiness } = require("../../config/sockets");
const { getActiveBusinesses } = require("../../config/businesses");

router.use(express.json());

// Single webhook endpoint handles both Chowdeck and GIGL
// Differentiated by the 'source' query param: /webhooks/chowdeck or /webhooks/gigl
router.post("/", async (req, res) => {
  res.sendStatus(200); // Always respond immediately

  const source = req.path.includes("chowdeck") ? "chowdeck" : "gigl";
  const payload = req.body;

  // Log raw webhook
  await pool
    .query(
      `INSERT INTO shared.webhook_log (source, event_type, payload, signature_valid)
     VALUES ($1, $2, $3, true)`,
      [source, payload.event || payload.status || "unknown", payload],
    )
    .catch(() => {});

  try {
    // Extract courier order ID and new status from payload
    let courierId, newStatus, location;

    if (source === "chowdeck") {
      courierId = payload.tracking_id || payload.order_id;
      newStatus = mapChowdeckStatus(payload.status);
      location = payload.rider_location || null;
    } else {
      courierId = payload.Waybill || payload.waybill;
      newStatus = mapGIGLStatus(payload.Status || payload.status);
      location = payload.CurrentLocation || null;
    }

    if (!courierId) return;

    // Find matching delivery across both business schemas
    for (const business of getActiveBusinesses()) {
      const {
        rows: [delivery],
      } = await pool.query(
        `SELECT delivery_id FROM ${business}.deliveries
         WHERE courier_order_id = $1 LIMIT 1`,
        [courierId],
      );

      if (delivery) {
        // Update delivery status
        await pool.query(
          `UPDATE ${business}.deliveries
           SET status=$1, updated_at=now(),
               dispatched_at = CASE WHEN $1='dispatched' THEN now() ELSE dispatched_at END,
               delivered_at  = CASE WHEN $1='delivered'  THEN now() ELSE delivered_at  END
           WHERE delivery_id=$2`,
          [newStatus, delivery.delivery_id],
        );

        // Append tracking entry (trigger also does this but explicit is better)
        await pool.query(
          `INSERT INTO ${business}.delivery_tracking
             (delivery_id, status, location, source, raw_payload)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            delivery.delivery_id,
            newStatus,
            location,
            `${source}_webhook`,
            payload,
          ],
        );

        emitToBusiness(business, "delivery:status", {
          deliveryId: delivery.delivery_id,
          status: newStatus,
          location,
        });

        logger.info(
          `Delivery status updated: ${courierId} → ${newStatus} [${business}]`,
        );
        break;
      }
    }
  } catch (err) {
    logger.error(`${source} webhook processing error`, err);
  }
});

function mapChowdeckStatus(status) {
  const map = {
    pending: "pending_dispatch",
    assigned: "dispatched",
    picked_up: "picked_up",
    in_transit: "in_transit",
    delivered: "delivered",
    failed: "failed",
    returned: "returned",
  };
  return map[status?.toLowerCase()] || "in_transit";
}

function mapGIGLStatus(status) {
  const map = {
    "shipment created": "pending_dispatch",
    "shipment picked up": "picked_up",
    "in transit": "in_transit",
    "out for delivery": "in_transit",
    delivered: "delivered",
    "delivery failed": "failed",
    returned: "returned",
  };
  return map[status?.toLowerCase()] || "in_transit";
}

module.exports = router;
