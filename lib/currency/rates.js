"use strict";

const axios = require("axios");
const { pool } = require("../../config/db");
const logger = require("../../config/logger");

// Only these three foreign currencies are accepted.
const CURRENCIES = ["USD", "GBP", "EUR"];

// API key for exchangerate-api.com (free tier, <20 requests/day).
const API_KEY = process.env.EXCHANGERATE_API_KEY || "da66fee017eb9b33206e0db9";

/**
 * Fetch live rates from exchangerate-api.com and store in shared.currency_rates.
 * Called by the daily midnight cron job and the manual "Sync Now" button.
 *
 * The API returns rates relative to USD, so we fetch USD-based rates
 * and compute each currency→NGN conversion.
 */
async function fetchAndStoreRates() {
  try {
    const { data } = await axios.get(
      `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD`,
    );

    if (data.result !== "success") {
      throw new Error(`API returned: ${data["error-type"] || "unknown error"}`);
    }

    const rates = data.conversion_rates;
    if (!rates || !rates.NGN) {
      throw new Error("NGN rate missing from API response");
    }

    const ngnPerUsd = rates.NGN; // e.g. 1550
    const now = new Date();

    for (const currency of CURRENCIES) {
      // For USD: rate = ngnPerUsd (e.g. 1550 NGN per 1 USD)
      // For EUR: rate = ngnPerUsd / rates.EUR (e.g. 1550 / 0.92 ≈ 1684 NGN per 1 EUR)
      // For GBP: rate = ngnPerUsd / rates.GBP
      const rateToNGN =
        currency === "USD"
          ? ngnPerUsd
          : parseFloat((ngnPerUsd / rates[currency]).toFixed(6));

      if (!rateToNGN || rateToNGN <= 0) {
        logger.warn(`[currency] Skipping ${currency}: computed rate ${rateToNGN}`);
        continue;
      }

      await pool.query(
        `INSERT INTO shared.currency_rates (from_currency, to_currency, rate, source, valid_at)
         VALUES ($1, 'NGN', $2, 'exchangerate-api.com', $3)`,
        [currency, rateToNGN, now],
      );
    }
    logger.info(`Currency rates synced: ${CURRENCIES.join(", ")} (source: exchangerate-api.com)`);
    return { synced: CURRENCIES, timestamp: now };
  } catch (err) {
    logger.error("Failed to fetch currency rates", err);
    throw err;
  }
}

module.exports = { fetchAndStoreRates };
