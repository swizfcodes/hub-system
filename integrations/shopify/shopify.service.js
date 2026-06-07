"use strict";

const axios = require("axios");
const config = require("../../config/config");
const logger = require("../../config/logger");
const { withBusinessContext } = require("../../config/db");
const productAdapter = require("./adapters/product.adapter");

// ─────────────────────────────────────────────────────────────
// integrations/shopify/shopify.service
//
// HTTP calls to the Shopify Admin API.
//
// What this module does:
//   - pushProduct(business, productId)         — create or update on Shopify
//   - syncStockLevel(business, productId, qty) — push current stock
//   - getLocationId()                          — cached lookup of primary location
//
// What it delegates:
//   - Payload shaping → adapters/product.adapter (toShopifyProductPayload,
//     extractShopifyRefs, mergeShopifyRefs, extractIdsFromShopifyCreateResponse).
//     Keeping the wire shape in adapters means a Shopify API bump only
//     touches that file.
//   - Orchestration / iteration → shopify.scheduler. This service is
//     SISO (single input, single output) — one product at a time.
//
// The location-ID cache is intentional. Shopify's
// GET /locations.json returns the same locations.length-of-1 array
// on every install we serve (the merchant's primary store) and
// never changes at runtime. Calling it once per process saves ~500
// API hits per 15-minute scheduler tick. Cached for one hour with a
// fallback re-fetch on cache miss.
// ─────────────────────────────────────────────────────────────

const BASE = `https://${config.shopify.storeUrl}/admin/api/2024-01`;
const HEADERS = {
  "X-Shopify-Access-Token": config.shopify.accessToken,
  "Content-Type": "application/json",
};

// ── Location-ID memoisation ──────────────────────────────────
const LOCATION_TTL_MS = 60 * 60 * 1000; // 1 hour
let cachedLocationId = null;
let cachedLocationAt = 0;

/**
 * Look up Shopify's primary location ID. Memoised — see header
 * comment for rationale. Exposed so tests can prime/clear the cache
 * and the scheduler can pre-warm at process start if desired.
 */
async function getLocationId({ forceRefresh = false } = {}) {
  if (
    !forceRefresh &&
    cachedLocationId &&
    Date.now() - cachedLocationAt < LOCATION_TTL_MS
  ) {
    return cachedLocationId;
  }
  const res = await axios.get(`${BASE}/locations.json`, { headers: HEADERS });
  const id = res.data.locations?.[0]?.id || null;
  if (id) {
    cachedLocationId = id;
    cachedLocationAt = Date.now();
  }
  return id;
}

function clearLocationCache() {
  cachedLocationId = null;
  cachedLocationAt = 0;
}

// ── Product push (Hub → Shopify) ─────────────────────────────

/**
 * Create or update a product on Shopify based on the Hub catalogue.
 * If the Hub product already carries a shopify_product_id in its
 * custom_fields, this is an UPDATE; otherwise it's a CREATE and
 * the new Shopify IDs (product, variant, inventory_item) are stored
 * back on the Hub row.
 *
 * The previous version of this function only stored shopify_product_id
 * on create. That meant syncStockLevel — which requires
 * shopify_inventory_item_id — silently skipped freshly-created
 * products forever. This version stores all three IDs at create
 * time, closing that gap.
 */
async function pushProduct(business, productId) {
  return withBusinessContext(business, async (client) => {
    // One query — pull the product row including its custom_fields.
    // The old version did two queries; the second was redundant
    // because the first already returned the full row.
    const {
      rows: [p],
    } = await client.query(
      `SELECT p.*, pc.name AS category_name
       FROM products p
       LEFT JOIN product_categories pc ON pc.category_id = p.category_id
       WHERE p.product_id = $1`,
      [productId],
    );
    if (!p) throw new Error(`Product ${productId} not found`);

    // Adapter owns the wire shape — vendor defaults to the
    // business key, e.g. "jewelry" / "diffusers". The scheduler
    // could pass a friendlier display name in future via
    // businesses.getBusinessConfig().
    const payload = productAdapter.toShopifyProductPayload(p, {
      vendor: business,
    });

    // Adapter inspects custom_fields and tells us whether this is
    // an update or a create.
    const { productId: existingShopifyId } =
      productAdapter.extractShopifyRefs(p);

    let response;
    if (existingShopifyId) {
      response = await axios.put(
        `${BASE}/products/${existingShopifyId}.json`,
        payload,
        { headers: HEADERS },
      );
    } else {
      response = await axios.post(`${BASE}/products.json`, payload, {
        headers: HEADERS,
      });

      // Capture ALL three IDs (product, variant, inventory_item) and
      // merge into custom_fields. Without inventory_item_id stored,
      // syncStockLevel would skip this product on every subsequent
      // stock update.
      const newRefs = productAdapter.extractIdsFromShopifyCreateResponse(
        response.data.product,
      );
      const mergedCustomFields = productAdapter.mergeShopifyRefs(
        p.custom_fields,
        newRefs,
      );
      await client.query(
        `UPDATE products SET custom_fields = $1 WHERE product_id = $2`,
        [JSON.stringify(mergedCustomFields), productId],
      );
    }

    logger.info(`Shopify product synced: ${p.sku}`);
    return response.data.product;
  });
}

// ── Stock push (Hub → Shopify inventory_levels) ──────────────

/**
 * Push a single product's current Hub stock to Shopify. Called both
 * directly (when a sale happens and we want immediate consistency)
 * and from the scheduler (every 15 minutes, in batch).
 *
 * Silently no-ops if the product hasn't been pushed to Shopify yet
 * — caller decides whether that's worth surfacing (the scheduler
 * counts it as `skipped_no_link` and moves on; ad-hoc callers can
 * check the return value).
 *
 * Returns { pushed: true } on success, { pushed: false, reason }
 * otherwise. Throwing was reserved for transport-layer errors so
 * the scheduler's per-product try/catch catches the right things.
 */
async function syncStockLevel(business, productId, quantity) {
  return withBusinessContext(business, async (client) => {
    const {
      rows: [p],
    } = await client.query(
      `SELECT custom_fields FROM products WHERE product_id = $1`,
      [productId],
    );
    if (!p) return { pushed: false, reason: "product_not_found" };

    const { inventoryItemId } = productAdapter.extractShopifyRefs(p);
    if (!inventoryItemId) {
      return { pushed: false, reason: "no_shopify_link" };
    }

    const locationId = await getLocationId();
    if (!locationId) {
      return { pushed: false, reason: "no_shopify_location" };
    }

    await axios.post(
      `${BASE}/inventory_levels/set.json`,
      {
        location_id: locationId,
        inventory_item_id: inventoryItemId,
        available: quantity,
      },
      { headers: HEADERS },
    );

    logger.info(
      `[shopify] stock synced: business=${business} product=${productId} qty=${quantity}`,
    );
    return { pushed: true };
  });
}

module.exports = {
  pushProduct,
  syncStockLevel,
  getLocationId,
  clearLocationCache,
};
