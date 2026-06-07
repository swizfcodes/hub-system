"use strict";

// ─────────────────────────────────────────────────────────────
// integrations/shopify/adapters/customer.adapter
//
// Translation layer for Shopify customer objects. Used in two
// contexts:
//
//   1. Order webhook (existing) — shape order.customer into a
//      shared.contacts row when a Shopify order arrives.
//   2. Scheduler backfill (new) — same shape, applied to any
//      Shopify orders that weren't covered by a webhook (e.g. a
//      brief outage). The scheduler imports this so it doesn't
//      reinvent the mapping.
// ─────────────────────────────────────────────────────────────

/**
 * Convert a Shopify customer object into the shape used by an
 * INSERT into shared.contacts.
 *
 * Shopify customer (from order.customer or /customers.json):
 *   {
 *     id, email, first_name, last_name, phone,
 *     default_address: { address1, city, country, ... },
 *     accepts_marketing
 *   }
 *
 * Hub contact insert shape:
 *   { contact_type, display_name, first_name, last_name,
 *     email, primary_phone, source, metadata }
 *
 * Returns null if there's not enough identifying information
 * (no email AND no phone) — the order webhook treats null as
 * "no contact, skip the link" and creates the order without a
 * contact_id rather than fabricating one.
 */
function toContactRow(shopifyCustomer) {
  if (!shopifyCustomer) return null;
  const email = (shopifyCustomer.email || "").trim().toLowerCase() || null;
  const phone = (shopifyCustomer.phone || "").trim() || null;
  if (!email && !phone) return null;

  const firstName = (shopifyCustomer.first_name || "").trim();
  const lastName = (shopifyCustomer.last_name || "").trim();
  const displayName =
    `${firstName} ${lastName}`.trim() || email || phone || "Shopify Customer";

  return {
    contact_type: ["customer"],
    display_name: displayName,
    first_name: firstName || null,
    last_name: lastName || null,
    email,
    primary_phone: phone,
    source: "shopify",
    // Carry the Shopify customer ID so duplicate detection and
    // re-attribution stay reliable across order webhooks.
    metadata: {
      shopify_customer_id: shopifyCustomer.id
        ? String(shopifyCustomer.id)
        : undefined,
    },
  };
}

/**
 * Identifier used to look up an existing Hub contact for this
 * Shopify customer. Prefers shopify_customer_id (stable, won't
 * change if they edit their profile), falls back to email, then
 * phone.
 *
 * Returns: { type: 'shopify_id'|'email'|'phone', value: string } | null
 */
function buildLookupKey(shopifyCustomer) {
  if (!shopifyCustomer) return null;
  if (shopifyCustomer.id) {
    return { type: "shopify_id", value: String(shopifyCustomer.id) };
  }
  if (shopifyCustomer.email) {
    return { type: "email", value: shopifyCustomer.email.trim().toLowerCase() };
  }
  if (shopifyCustomer.phone) {
    return { type: "phone", value: shopifyCustomer.phone.trim() };
  }
  return null;
}

module.exports = { toContactRow, buildLookupKey };
