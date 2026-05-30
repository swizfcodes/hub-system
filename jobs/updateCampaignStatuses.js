"use strict";

// Cron entry — runs every 5 minutes. Activates scheduled campaigns whose
// start_date has passed, and expires live campaigns whose end_date has
// passed (skipping evergreen). Registered in jobs/index.js.

const { withBusinessContext } = require("../config/db");
const businesses = require("../config/businesses");
const logger = require("../config/logger");

module.exports = async function updateCampaignStatuses() {
  for (const business of businesses.getActiveBusinesses()) {
    try {
      await withBusinessContext(business, async (client) => {
        // Auto-activate scheduled campaigns whose start_date has arrived.
        const activated = await client.query(
          `UPDATE sales_campaigns
              SET status = 'live'
            WHERE status = 'scheduled'
              AND start_date <= now()`,
        );
        // Auto-expire live, non-evergreen campaigns whose end_date has passed.
        const expired = await client.query(
          `UPDATE sales_campaigns
              SET status = 'expired'
            WHERE status = 'live'
              AND is_evergreen = false
              AND end_date IS NOT NULL
              AND end_date < now()`,
        );
        if (activated.rowCount || expired.rowCount) {
          logger.info(
            `[sales-campaigns] ${business}: activated ${activated.rowCount}, expired ${expired.rowCount}`,
          );
        }
      });
    } catch (err) {
      logger.error(
        `[sales-campaigns] status sweep failed for ${business}: ${err.message}`,
      );
    }
  }
};
