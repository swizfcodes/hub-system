"use strict";

// ─────────────────────────────────────────────────────────────
// jobs/syncShopifyStock
//
// Runs every 15 minutes (registered in jobs/index.js). Pushes Hub
// stock levels to Shopify for every product linked via custom_fields.
//
// All real work lives in integrations/shopify/shopify.scheduler.
// This file is just the cron entry point that jobs/index.js
// requires — keeping it a one-liner means the schedule/cron concern
// (jobs/) and the business concern (integrations/shopify/) stay
// cleanly separated.
//
// Errors caught at the scheduler level so a bad tick logs and
// returns rather than crashing the cron host process.
// ─────────────────────────────────────────────────────────────

const {
  syncStockLevels,
} = require("../integrations/shopify/shopify.scheduler");
const logger = require("../config/logger");

module.exports = async function syncShopifyStock() {
  try {
    return await syncStockLevels();
  } catch (err) {
    // The scheduler's own try/catch should normally absorb errors,
    // but a defensive outer net here guarantees the cron host
    // never sees an unhandled rejection.
    logger.error(`[shopify.cron] unexpected failure: ${err.message}`);
    return { errored: true, message: err.message };
  }
};
