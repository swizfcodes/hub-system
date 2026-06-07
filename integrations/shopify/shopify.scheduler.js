"use strict";

// ─────────────────────────────────────────────────────────────
// integrations/shopify/shopify.scheduler
//
// The cron entry point for keeping Shopify stock in sync with Hub.
// Runs every 15 minutes (registered in jobs/index.js).
//
// Direction: Hub → Shopify (REVERSE sync). The webhook handles the
// other direction (Shopify orders → Hub sales). Together they keep
// inventory consistent across both systems.
//
// Why this matters: when a sale happens through Hub (POS walk-in,
// dispatch from Sales, retail-partner consignment) the stock count
// in Shopify is stale until this cron runs. Without it you can
// oversell — Shopify lists a ring as "in stock" after the last one
// was just sold at the till in Lagos.
//
// What this does NOT do:
//   - Create products on Shopify. shopify.service.pushProduct
//     handles that as a manual operation per product. The
//     scheduler only updates STOCK on products that already have
//     a shopify_product_id custom_field set.
//   - Push prices. Pricing changes are infrequent and go through
//     pushProduct deliberately. The scheduler should not surprise
//     the merchant by pushing every cost-of-goods recalculation
//     to the public storefront.
//
// Error handling philosophy: ONE bad product never stops the
// whole sync. Each product is its own try/catch. We collect a
// summary and log it; failures get warning-level logs with the
// SKU and HTTP details so they're easy to diagnose without grep
// stack traces.
// ─────────────────────────────────────────────────────────────

const { withBusinessContext } = require("../../config/db");
const businesses = require("../../config/businesses");
const config = require("../../config/config");
const logger = require("../../config/logger");
const shopifyService = require("./shopify.service");

/**
 * Cron entry point. Iterates every active business, pushes current
 * stock for every Shopify-linked product, returns a summary the
 * caller can log.
 *
 * @returns {object} { businesses_processed, products_pushed,
 *                     products_failed, skipped_no_link, errors[] }
 */
async function syncStockLevels() {
  // Pre-flight: a Hub install can run with no Shopify credentials
  // configured (jewelry+diffusers may not have a Shopify store yet).
  // In that case the cron is a no-op — log once at debug level so
  // production logs don't fill up.
  if (
    !config.shopify ||
    !config.shopify.storeUrl ||
    !config.shopify.accessToken
  ) {
    logger.debug(
      "[shopify.scheduler] no SHOPIFY_STORE_URL / SHOPIFY_ACCESS_TOKEN configured — skipping",
    );
    return {
      businesses_processed: 0,
      products_pushed: 0,
      products_failed: 0,
      skipped_no_link: 0,
      errors: [],
      reason: "not_configured",
    };
  }

  const activeBusinesses = businesses.getActiveBusinesses();
  const summary = {
    businesses_processed: 0,
    products_pushed: 0,
    products_failed: 0,
    skipped_no_link: 0,
    errors: [],
  };

  for (const business of activeBusinesses) {
    try {
      const perBusiness = await syncBusiness(business);
      summary.businesses_processed++;
      summary.products_pushed += perBusiness.pushed;
      summary.products_failed += perBusiness.failed;
      summary.skipped_no_link += perBusiness.skipped;
      if (perBusiness.errors.length) {
        summary.errors.push(
          ...perBusiness.errors.map((e) => ({ business, ...e })),
        );
      }
    } catch (err) {
      // Per-BUSINESS failure (e.g. DB connection dropped mid-sweep)
      // — log it and continue with the next business. One bad
      // business shouldn't poison the whole tick.
      logger.error(
        `[shopify.scheduler] business ${business} failed entirely: ${err.message}`,
      );
      summary.errors.push({ business, error: err.message, scope: "business" });
    }
  }

  if (summary.products_pushed || summary.products_failed) {
    logger.info(
      `[shopify.scheduler] sync complete — ` +
        `businesses=${summary.businesses_processed} ` +
        `pushed=${summary.products_pushed} ` +
        `failed=${summary.products_failed} ` +
        `skipped=${summary.skipped_no_link}`,
    );
  } else {
    // Common case on installs without Shopify — log quietly.
    logger.debug("[shopify.scheduler] nothing to sync this tick");
  }

  return summary;
}

/**
 * Per-business worker. Reads every product that has a Shopify link
 * in its custom_fields, computes its current Hub stock, and pushes
 * via shopify.service.syncStockLevel.
 *
 * The "current stock" calculation uses the same SUM(direction*quantity)
 * pattern used by stock.repository.getCurrentStock — kept inline
 * here rather than calling out so the scheduler doesn't depend on
 * the stock module's internal repo interface.
 */
async function syncBusiness(business) {
  const result = { pushed: 0, failed: 0, skipped: 0, errors: [] };

  return withBusinessContext(business, async (client) => {
    // Pick up every product flagged as Shopify-synced. The
    // custom_fields->>'shopify_inventory_item_id' is the field
    // shopify.service.syncStockLevel needs to make the inventory
    // call; without it we can't push, hence the WHERE filter.
    const { rows: products } = await client.query(
      `SELECT product_id, sku, name,
              custom_fields->>'shopify_product_id'        AS shopify_product_id,
              custom_fields->>'shopify_inventory_item_id' AS shopify_inventory_item_id
       FROM products
       WHERE custom_fields ? 'shopify_inventory_item_id'
         AND is_active = true
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 500`,
    );

    if (products.length === 0) {
      logger.debug(
        `[shopify.scheduler] ${business}: no Shopify-linked products`,
      );
      return result;
    }

    logger.debug(
      `[shopify.scheduler] ${business}: checking ${products.length} Shopify-linked product(s)`,
    );

    for (const p of products) {
      try {
        if (!p.shopify_inventory_item_id) {
          result.skipped++;
          continue;
        }

        // Compute current on-hand stock from stock_movements. This is
        // the canonical Hub answer (sum of inbound, minus outbound,
        // minus active reservations). Reservations are EXCLUDED here
        // intentionally — Shopify sees what's physically available
        // to ship NOW, not what's been earmarked for a confirmed
        // sale that hasn't dispatched yet. If we sent reserved
        // quantities to Shopify, two channels could oversell the
        // same physical unit.
        const {
          rows: [{ qty }],
        } = await client.query(
          `WITH on_hand AS (
             SELECT COALESCE(SUM(direction * quantity), 0) AS q
             FROM stock_movements
             WHERE product_id = $1
           ),
           reserved AS (
             SELECT COALESCE(SUM(quantity), 0) AS q
             FROM stock_reservations
             WHERE product_id = $1
               AND status = 'active'
               AND (expires_at IS NULL OR expires_at > now())
           )
           SELECT GREATEST(0, on_hand.q - reserved.q)::int AS qty
           FROM on_hand, reserved`,
          [p.product_id],
        );

        // The service-layer push owns the actual HTTP call to
        // Shopify. We delegate so any future change (rate limiting,
        // retry logic, alternate API version) lives in one place.
        //
        // The service returns { pushed: bool, reason? }:
        //   - { pushed: true }                              → counted as pushed
        //   - { pushed: false, reason: 'no_shopify_link' }  → counted as skipped
        //   - throws on transport / API error               → caught below as failed
        const pushResult = await shopifyService.syncStockLevel(
          business,
          p.product_id,
          qty,
        );
        if (pushResult?.pushed) {
          result.pushed++;
        } else {
          // Silent no-ops (no inventory_item_id, no location) are
          // expected for products mid-onboarding — not errors.
          result.skipped++;
        }
      } catch (err) {
        // One product's failure is logged and counted but does not
        // stop the sweep. The summary surface lets ops decide
        // whether the failure rate warrants attention.
        result.failed++;
        const detail = {
          product_id: p.product_id,
          sku: p.sku,
          error: err.response?.data?.errors || err.message,
          status: err.response?.status,
        };
        result.errors.push(detail);
        logger.warn(
          `[shopify.scheduler] ${business}: push failed for sku=${p.sku} — ` +
            (err.response?.status
              ? `HTTP ${err.response.status} ${JSON.stringify(err.response.data?.errors || "")}`
              : err.message),
        );
      }
    }

    return result;
  });
}

module.exports = { syncStockLevels, syncBusiness };
