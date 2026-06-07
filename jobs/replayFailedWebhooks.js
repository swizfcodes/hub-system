"use strict";
const { pool } = require("../config/db");
const logger = require("../config/logger");

module.exports = async function replayFailedWebhooks() {
  const { rows } = await pool.query(
    `SELECT webhook_id, source, event_type, payload
     FROM shared.webhook_log
     WHERE processed = false
       AND error_message IS NOT NULL
       AND retry_count < 5
       AND received_at > now() - INTERVAL '24 hours'
     LIMIT 20`,
  );

  if (!rows.length) return;

  logger.info(`Replaying ${rows.length} failed webhooks`);

  for (const webhook of rows) {
    try {
      await pool.query(
        `UPDATE shared.webhook_log SET retry_count = retry_count + 1 WHERE webhook_id = $1`,
        [webhook.webhook_id],
      );
      // TODO: dispatch to appropriate handler based on source
      logger.info(
        `Replayed webhook ${webhook.webhook_id} [${webhook.source}/${webhook.event_type}]`,
      );
    } catch (err) {
      logger.error(`Replay failed for webhook ${webhook.webhook_id}`, err);
    }
  }
};
