"use strict";
// WooCommerce customer adapter — not yet implemented.
// Exports the same interface as shopify/adapters/customer.adapter.js
// so the webhook and scheduler can be enabled without crashing.

/**
 * Convert a WooCommerce customer object into the shape used by
 * INSERT into shared.contacts.
 *
 * WooCommerce customer shape (from order.billing / /customers endpoint):
 *   { id, email, first_name, last_name, billing: { phone, ... } }
 *
 * @param {Object} wcCustomer
 * @returns {Object} Hub contact insert shape
 */
function toContactPayload(wcCustomer) {
  if (!wcCustomer) return null;
  const billing = wcCustomer.billing || {};
  return {
    contact_type: ["customer"],
    display_name:
      [wcCustomer.first_name, wcCustomer.last_name].filter(Boolean).join(" ") ||
      billing.email ||
      "WooCommerce Customer",
    first_name: wcCustomer.first_name || null,
    last_name: wcCustomer.last_name || null,
    email: wcCustomer.email || billing.email || null,
    primary_phone: billing.phone || null,
    source: "woocommerce",
    metadata: { woocommerce_customer_id: wcCustomer.id },
  };
}

module.exports = { toContactPayload };
