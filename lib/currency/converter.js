"use strict";

const { pool } = require("../../config/db");

// Convert amount from foreign currency to NGN using latest stored rate
async function toNGN(amount, fromCurrency) {
  if (fromCurrency === "NGN") return amount;

  const result = await pool.query(
    `SELECT rate FROM shared.currency_rates
     WHERE from_currency = $1 AND to_currency = 'NGN'
     ORDER BY valid_at DESC LIMIT 1`,
    [fromCurrency],
  );

  if (!result.rows.length) {
    throw new Error(`No exchange rate found for ${fromCurrency} → NGN`);
  }

  return parseFloat((amount * result.rows[0].rate).toFixed(2));
}

async function getRate(fromCurrency, toCurrency = "NGN") {
  const result = await pool.query(
    `SELECT rate, valid_at FROM shared.currency_rates
     WHERE from_currency = $1 AND to_currency = $2
     ORDER BY valid_at DESC LIMIT 1`,
    [fromCurrency, toCurrency],
  );
  return result.rows[0] || null;
}

module.exports = { toNGN, getRate };
