"use strict";

// ─────────────────────────────────────────────────────────────
// lib/branding — the backend's view of platform identity.
//
// Frontend branding flows through GET /api/branding; this is the
// equivalent for backend consumers: PDF templates, Excel exports,
// payment-gateway labels, journal descriptions. Reads
// shared.platform_settings with a short cache so hot paths (every
// PDF render) never pay a query per call.
//
// Business-level names come from config/businesses' cache
// (business_config rows) — synchronous, also no DB cost.
// ─────────────────────────────────────────────────────────────

const businesses = require("../config/businesses");
const logger = require("../config/logger");

const CACHE_TTL_MS = 60_000;

const FALLBACK = Object.freeze({
  product_name: "Hub",
  tagline: "",
  company_name: "",
  logo_dark_url: "",
  logo_light_url: "",
});

let cached = null;
let cachedAt = 0;

/**
 * Platform identity: { product_name, tagline, company_name }.
 * Cached 60s; falls back to neutral values if the table is missing
 * (pre-migration boot) or the DB is briefly unavailable.
 */
async function getPlatformBrand() {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  try {
    const { pool } = require("../config/db"); // lazy — avoids circular require
    const {
      rows: [row],
    } = await pool.query(
      `SELECT product_name, tagline, company_name,
              logo_light_url, logo_dark_url
       FROM shared.platform_settings LIMIT 1`,
    );
    cached = {
      product_name: row?.product_name || FALLBACK.product_name,
      tagline: row?.tagline || FALLBACK.tagline,
      company_name: row?.company_name || FALLBACK.company_name,
      // logo_dark_url is the wordmark intended for LIGHT surfaces — the right
      // choice for white PDF/print documents. logo_light_url is the reverse.
      logo_dark_url: row?.logo_dark_url || FALLBACK.logo_dark_url,
      logo_light_url: row?.logo_light_url || FALLBACK.logo_light_url,
    };
    cachedAt = Date.now();
    return cached;
  } catch (err) {
    logger.warn(`[branding] platform settings unavailable: ${err.message}`);
    return cached || FALLBACK;
  }
}

/** Drop the cache (called after PATCH /settings/appearance). */
function invalidate() {
  cached = null;
  cachedAt = 0;
}

/**
 * Display name for a business key, from the businesses cache.
 * Synchronous. Falls back to the key itself so labels never vanish.
 */
function businessLabel(key) {
  return businesses.getBusinessConfig(key)?.display_name || key || "";
}

module.exports = { getPlatformBrand, invalidate, businessLabel };
