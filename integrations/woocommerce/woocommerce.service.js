"use strict";
// WooCommerce service — not yet implemented.
// This is a safe stub that exports the same interface as shopify.service.js
// so the scheduler and webhook can be enabled without import errors.

const logger = require("../../config/logger");

function _notImplemented(method) {
  const err = Object.assign(
    new Error(`WooCommerce integration not yet implemented: ${method}`),
    { status: 501 }
  );
  return Promise.reject(err);
}

async function syncProducts(business) {
  logger.warn({ business }, "woocommerce.syncProducts: not implemented");
  return _notImplemented("syncProducts");
}

async function syncOrders(business) {
  logger.warn({ business }, "woocommerce.syncOrders: not implemented");
  return _notImplemented("syncOrders");
}

async function syncCustomers(business) {
  logger.warn({ business }, "woocommerce.syncCustomers: not implemented");
  return _notImplemented("syncCustomers");
}

module.exports = { syncProducts, syncOrders, syncCustomers };
