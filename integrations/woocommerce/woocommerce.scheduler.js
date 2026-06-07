"use strict";
// WooCommerce scheduler — not yet implemented.
// Returns a no-op async function so jobs/index.js can safely import it
// without crashing when the webhook route is eventually enabled.

const logger = require("../../config/logger");

async function runWooCommerceSync() {
  logger.debug("woocommerce.scheduler: sync not implemented — skipping");
}

module.exports = { runWooCommerceSync };
