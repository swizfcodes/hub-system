"use strict";

const axios = require("axios");
const { pool } = require("../../config/db");
const logger = require("../../config/logger");

const CURRENCIES = ["USD", "GBP", "EUR"];

// Called by syncCurrencyRates job daily
async function fetchAndStoreRates() {
  try {
    // Using open.er-api.com — free, no key required for basic rates
    const { data } = await axios.get("https://open.er-api.com/v6/latest/NGN");
    const rates = data.rates;

    const now = new Date();
    for (const currency of CURRENCIES) {
      if (!rates[currency]) continue;
      // Rate is NGN→currency, we want currency→NGN so invert
      const rateToNGN = parseFloat((1 / rates[currency]).toFixed(6));

      await pool.query(
        `INSERT INTO shared.currency_rates (from_currency, to_currency, rate, source, valid_at)
         VALUES ($1, 'NGN', $2, 'open.er-api.com', $3)`,
        [currency, rateToNGN, now],
      );
    }
    logger.info(`Currency rates updated for: ${CURRENCIES.join(", ")}`);
  } catch (err) {
    logger.error("Failed to fetch currency rates", err);
    throw err;
  }
}

module.exports = { fetchAndStoreRates };
