"use strict";
const { pool } = require("../config/db");
const logger = require("../config/logger");

module.exports = async function replayFailedWebhooks() {
  // Optimus notifications are the only webhook type with a replay-safe
  // processor currently registered. Do not spend retries on other sources
  // until their handlers expose replay support too.
  const { rows } = await pool.query(
    `SELECT webhook_id, payload
     FROM shared.webhook_log
     WHERE source = 'optimus'
       AND processed = false
       AND error_message IS NOT NULL
       AND retry_count < 5
       AND received_at > now() - INTERVAL '24 hours'
     ORDER BY received_at ASC
     LIMIT 20`,
  );

  if (!rows.length) return;

  const { processWebhookRecord } = require("../integrations/optimus/optimus.webhook");
  logger.info(`Replaying ${rows.length} failed Optimus webhooks`);

  for (const webhook of rows) {
    try {
      await pool.query(
        `UPDATE shared.webhook_log SET retry_count = retry_count + 1 WHERE webhook_id = $1`,
        [webhook.webhook_id],
      );
      await processWebhookRecord(webhook.payload, webhook.webhook_id);
    } catch (err) {
      logger.error(
        `Replay failed for Optimus webhook ${webhook.webhook_id}: ${err.message}`,
      );
    }
  }
};
