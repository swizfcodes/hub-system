"use strict";
// WooCommerce order adapter — not yet implemented.
// Exports the same interface as shopify/adapters/order.adapter.js

/**
 * Convert a WooCommerce order object into the Hub sales order shape.
 *
 * @param {Object} wcOrder
 * @param {string} business
 * @returns {Object|null}
 */
function toOrderPayload(wcOrder, business) {
  if (!wcOrder) return null;
  return {
    business,
    external_ref:  String(wcOrder.id),
    source:        'woocommerce',
    status:        wcOrder.status || 'pending',
    currency:      (wcOrder.currency || 'NGN').toUpperCase(),
    total_amount:  parseFloat(wcOrder.total) || 0,
    notes:         wcOrder.customer_note || null,
    metadata:      { woocommerce_order_id: wcOrder.id, woocommerce_number: wcOrder.number },
  };
}

/**
 * Convert WooCommerce order line items into Hub line item shape.
 *
 * @param {Array} lineItems  wcOrder.line_items
 * @returns {Array}
 */
function toLineItems(lineItems = []) {
  return lineItems.map((item) => ({
    external_variant_id: String(item.variation_id || item.product_id),
    name:                item.name,
    quantity:            item.quantity,
    unit_price:          parseFloat(item.price) || 0,
    total:               parseFloat(item.total) || 0,
    sku:                 item.sku || null,
  }));
}

module.exports = { toOrderPayload, toLineItems };
