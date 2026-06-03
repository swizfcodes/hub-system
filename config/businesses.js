"use strict";

const config = require("./config");
const logger = require("./logger");

// ─────────────────────────────────────────────────────────────
// BUSINESSES — dynamic business list module
//
// The active business list (jewelry, diffusers, watches, ...) was
// hardcoded at `config.app.businesses` and referenced in ~20 places.
// That meant adding a new business required editing code, which
// contradicts Module 18's promise: "no developer needed".
//
// This module owns the list. It:
//   - Loads from shared.business_config at startup (loadActiveBusinesses)
//   - Caches in-memory so the hot-path validators in db.js / sockets.js /
//     middleware / auth stay synchronous (no per-request DB call)
//   - Refreshes when settings.service creates or deactivates a business
//   - Falls back to config.app.businesses if the DB is unreachable
//     at boot (so migrations / initial setup don't deadlock)
//
// The lazy `pool` import below is critical: this file is loaded by
// db.js (via config/businesses ↔ withBusinessContext). Eagerly
// requiring db.js here would create a circular dependency. The lazy
// load is fine because the only function that uses `pool` is the
// async `refresh`, which runs after boot completes.
// ─────────────────────────────────────────────────────────────

let cache = {
  keys: [],
  byKey: new Map(),
  loadedAt: null,
  fromFallback: false,
};

// ── Loading & refresh ────────────────────────────────────────

/**
 * Read the active business list from shared.business_config.
 * On any failure (DB down, migrations not yet run, etc.), fall back
 * to config.app.businesses so the process still boots.
 *
 * Should be called once at startup before the HTTP listener binds.
 * Also called by refresh() after a settings mutation.
 */
async function loadActiveBusinesses() {
  try {
    const { pool } = require("./db"); // lazy — avoids circular require
    const { rows } = await pool.query(
      `SELECT business_key, display_name, legal_name,
              address, phone, email, website,
              logo_path, accent_colour, secondary_colour,
              default_currency, vat_rate, wht_rate,
              fiscal_year_start, is_active,
              brand_fonts, social_links, email_footer_text
       FROM shared.business_config
       WHERE is_active = true
       ORDER BY business_key ASC`,
    );
    cache = {
      keys: rows.map((r) => r.business_key),
      byKey: new Map(rows.map((r) => [r.business_key, r])),
      loadedAt: new Date(),
      fromFallback: false,
    };
    logger.info(
      `[businesses] Loaded ${rows.length} active businesses from DB: ${cache.keys.join(", ")}`,
    );
    return cache.keys;
  } catch (err) {
    // Fallback path — keeps the system bootable during migrations or
    // first install. The fallback list is config.app.businesses, which
    // currently defaults to ["jewelry","diffusers"] for backward
    // compatibility.
    const fallback = config.app?.businesses || ["jewelry", "diffusers"];
    cache = {
      keys: [...fallback],
      byKey: new Map(
        fallback.map((k) => [k, { business_key: k, is_active: true }]),
      ),
      loadedAt: new Date(),
      fromFallback: true,
    };
    logger.warn(
      `[businesses] Could not load from DB (${err.message}); using fallback list: ${fallback.join(", ")}`,
    );
    return cache.keys;
  }
}

/**
 * Re-load the cache. Call this after creating or deactivating a
 * business so subsequent requests see the change immediately.
 */
async function refresh() {
  return loadActiveBusinesses();
}

// ── Synchronous read API ─────────────────────────────────────
// These functions are hot-path. They must NEVER touch the database.

/**
 * Get the cached list of active business keys.
 * Synchronous; suitable for use in withBusinessContext, validators,
 * middleware, and anywhere else the previous hardcoded array was used.
 */
function getActiveBusinesses() {
  return [...cache.keys]; // defensive copy — callers can't mutate the cache
}

/**
 * Same as Array.includes but reads from the cache. Replaces
 * `config.app.businesses.includes(x)` calls everywhere.
 */
function isValidBusiness(key) {
  return cache.keys.includes(key);
}

/**
 * Full config row for a business, by key. Returns null if not found
 * or not active. Cached, so callers don't pay DB cost for repeated
 * reads (e.g. dashboards rendering branding per business).
 */
function getBusinessConfig(key) {
  return cache.byKey.get(key) || null;
}

/**
 * VAT rate for a business as a decimal (0.075 = 7.5%). Reads from the
 * cached business_config. Falls back to the Nigerian standard 7.5%
 * only if the business has no config row at all — which should never
 * happen for an active business, but the fallback keeps a sale from
 * throwing if the cache is somehow stale.
 *
 * Centralised here so sales, POS, and invoicing all compute VAT the
 * same way instead of each hardcoding 0.075.
 */
function getVatRate(key) {
  const cfg = cache.byKey.get(key);
  const rate = cfg ? parseFloat(cfg.vat_rate) : NaN;
  return Number.isFinite(rate) ? rate : 0.075;
}

/**
 * Cache health — diagnostics endpoint.
 */
function getCacheStatus() {
  return {
    business_count: cache.keys.length,
    businesses: [...cache.keys],
    loaded_at: cache.loadedAt,
    from_fallback: cache.fromFallback,
  };
}

// ── Bootstrap-side helper ────────────────────────────────────

/**
 * When `scripts/bootstrapBusiness.js` (or settings.service.createBusiness
 * with provision_schema=true) provisions a new business, it calls this
 * to add the new key to the cache immediately — no need to wait for a
 * full refresh. This is purely a convenience over `refresh()`; the
 * latter is more correct but slightly slower.
 */
function addToCache(businessRow) {
  if (!businessRow || !businessRow.business_key) return;
  if (!cache.keys.includes(businessRow.business_key)) {
    cache.keys.push(businessRow.business_key);
    cache.keys.sort();
  }
  cache.byKey.set(businessRow.business_key, businessRow);
}

function removeFromCache(businessKey) {
  cache.keys = cache.keys.filter((k) => k !== businessKey);
  cache.byKey.delete(businessKey);
}

module.exports = {
  // async
  loadActiveBusinesses,
  refresh,
  // sync — hot path
  getActiveBusinesses,
  isValidBusiness,
  getBusinessConfig,
  getVatRate,
  // cache hooks
  addToCache,
  removeFromCache,
  getCacheStatus,
};
