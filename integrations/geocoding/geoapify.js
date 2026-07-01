"use strict";

// ─────────────────────────────────────────────────────────────
// Geoapify reverse geocoding
//
// Turns a clock-in GPS fix (lat/lng) into a human-readable address so
// managers see WHERE an employee clocked in, not just coordinates.
// Uses Geoapify's free tier (https://www.geoapify.com) — set
// GEOAPIFY_API_KEY in the environment.
//
// Best-effort by design: when the key is missing, the coordinates are
// invalid, or the service is slow/unavailable, callers get null and the
// UI falls back to a plain map pin built from the stored coordinates.
// Attendance is never blocked by a geocoding hiccup.
// ─────────────────────────────────────────────────────────────

const axios = require("axios");
const logger = require("../../config/logger");

const REVERSE_URL = "https://api.geoapify.com/v1/geocode/reverse";
const TIMEOUT_MS = 3000;

/**
 * Reverse-geocode a coordinate to a formatted address string.
 * Returns null on any failure so it never throws into the caller.
 */
async function reverseGeocode(lat, lng) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) return null;

  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (
    lat == null ||
    lng == null ||
    Number.isNaN(latNum) ||
    Number.isNaN(lngNum)
  ) {
    return null;
  }

  try {
    const { data } = await axios.get(REVERSE_URL, {
      params: { lat: latNum, lon: lngNum, format: "json", limit: 1, apiKey },
      timeout: TIMEOUT_MS,
    });
    // format=json → { results: [{ formatted, ... }] }
    // (GeoJSON default → { features: [{ properties: { formatted } }] })
    return (
      data?.results?.[0]?.formatted ||
      data?.features?.[0]?.properties?.formatted ||
      null
    );
  } catch (err) {
    logger.warn(`[geoapify] reverse geocode failed: ${err.message}`);
    return null;
  }
}

module.exports = { reverseGeocode };
