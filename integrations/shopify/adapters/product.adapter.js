"use strict";

// ─────────────────────────────────────────────────────────────
// integrations/shopify/adapters/product.adapter
//
// Pure translation layer between Hub product rows and Shopify
// product payloads. No I/O — these are deterministic shape
// converters. Tested in isolation.
//
// The boundary matters:
//   - shopify.service holds the HTTP calls and ID-tracking logic.
//   - shopify.scheduler iterates businesses and orchestrates the push.
//   - adapters/ shape the payloads at the wire boundary.
//
// Keeping shape changes here means a Shopify API version bump
// (2024-01 → 2024-07) only touches this file — the service and
// scheduler stay stable.
// ─────────────────────────────────────────────────────────────

/**
 * Convert a Hub product row (jewelry.products / diffusers.products)
 * into the JSON shape Shopify's POST /products.json expects.
 *
 * Hub row shape:
 *   {
 *     product_id, sku, barcode, name, description,
 *     selling_price, cost_price,
 *     category_name (joined),
 *     custom_fields: { shopify_product_id?, shopify_variant_id?, ... }
 *   }
 *
 * Shopify expects (Admin API 2024-01):
 *   {
 *     product: {
 *       title, body_html, product_type, vendor,
 *       variants: [{ price, sku, barcode, inventory_management }]
 *     }
 *   }
 *
 * Notes:
 *   - We always set inventory_management='shopify' so stock changes
 *     on Hub side propagate via the inventory_levels endpoint
 *     (see syncStockLevel in shopify.service).
 *   - body_html accepts HTML; we passthrough description as-is.
 *     The Hub description column is plain text, so this is safe.
 *   - vendor defaults to the business display name if provided.
 */
function toShopifyProductPayload(hubProduct, { vendor } = {}) {
  const variant = {
    price: String(hubProduct.selling_price ?? "0.00"),
    sku: hubProduct.sku || "",
    inventory_management: "shopify",
  };
  if (hubProduct.barcode) variant.barcode = hubProduct.barcode;

  const product = {
    title: hubProduct.name,
    body_html: hubProduct.description || "",
    product_type: hubProduct.category_name || "",
    variants: [variant],
  };
  if (vendor) product.vendor = vendor;

  return { product };
}

/**
 * Pull the Shopify identifiers (product / variant / inventory_item)
 * out of a Hub product's custom_fields JSONB. Used both when
 * deciding "create or update?" and when pushing stock.
 *
 * Returns:
 *   { productId, variantId, inventoryItemId } — strings or null each
 */
function extractShopifyRefs(hubProduct) {
  const cf = hubProduct.custom_fields || {};
  return {
    productId: cf.shopify_product_id || null,
    variantId: cf.shopify_variant_id || null,
    inventoryItemId: cf.shopify_inventory_item_id || null,
  };
}

/**
 * Merge new Shopify identifiers into a Hub product's custom_fields,
 * preserving any other custom_fields keys that exist.
 *
 * Returns the new custom_fields object — caller writes it back to
 * the products row.
 */
function mergeShopifyRefs(
  existingCustomFields,
  { productId, variantId, inventoryItemId },
) {
  const merged = { ...(existingCustomFields || {}) };
  if (productId !== undefined) merged.shopify_product_id = productId;
  if (variantId !== undefined) merged.shopify_variant_id = variantId;
  if (inventoryItemId !== undefined) {
    merged.shopify_inventory_item_id = inventoryItemId;
  }
  return merged;
}

/**
 * After a successful create on Shopify, pull the IDs from the
 * response and shape them for storage on the Hub product.
 */
function extractIdsFromShopifyCreateResponse(shopifyProduct) {
  const variant = shopifyProduct.variants && shopifyProduct.variants[0];
  return {
    productId: shopifyProduct.id ? String(shopifyProduct.id) : null,
    variantId: variant?.id ? String(variant.id) : null,
    inventoryItemId: variant?.inventory_item_id
      ? String(variant.inventory_item_id)
      : null,
  };
}

module.exports = {
  toShopifyProductPayload,
  extractShopifyRefs,
  mergeShopifyRefs,
  extractIdsFromShopifyCreateResponse,
};
