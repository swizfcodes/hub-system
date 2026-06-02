"use strict";
// WooCommerce product adapter — not yet implemented.
// Exports the same interface as shopify/adapters/product.adapter.js

/**
 * Convert a WooCommerce product into the Hub catalogue product shape.
 *
 * @param {Object} wcProduct
 * @param {string} business
 * @returns {Object|null}
 */
function toProductPayload(wcProduct, business) {
  if (!wcProduct) return null;
  return {
    business,
    name:          wcProduct.name,
    sku:           wcProduct.sku || null,
    description:   wcProduct.description || null,
    selling_price: parseFloat(wcProduct.price) || 0,
    cost_price:    0,
    source:        'woocommerce',
    metadata:      { woocommerce_product_id: wcProduct.id, woocommerce_slug: wcProduct.slug },
  };
}

module.exports = { toProductPayload };
