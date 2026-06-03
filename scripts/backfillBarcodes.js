"use strict";

/**
 * scripts/backfillBarcodes.js
 *
 * One-time backfill: generates a primary CODE128 barcode for every
 * product that was inserted via raw SQL and therefore bypassed the
 * createProduct() service (which auto-generates barcodes).
 *
 * Safe to re-run — skips products that already have a barcode row.
 *
 * Usage:
 *   node scripts/backfillBarcodes.js
 */

require("dotenv").config();
const { pool } = require("../config/db");
const { loadActiveBusinesses } = require("../config/businesses");
const logger = require("../config/logger");

// Same logic as catalogue.service.js — keep in sync if format changes.
function generateBarcodeValue(business, sku) {
  const bizPrefix = business.slice(0, 3).toUpperCase();
  const skuFrag = (sku || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const nano = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${bizPrefix}-${skuFrag || "PRD"}-${nano}`;
}

async function barcodeValueExists(client, value) {
  const { rows } = await client.query(
    `SELECT 1 FROM barcodes WHERE barcode_value = $1 LIMIT 1`,
    [value],
  );
  return rows.length > 0;
}

async function backfillBusiness(businessKey) {
  const client = await pool.connect();
  let inserted = 0;
  let skipped = 0;

  try {
    await client.query("BEGIN");
    await client.query(
      `SET LOCAL search_path TO ${businessKey}, shared, public`,
    );

    // Products that have no row in barcodes at all
    const { rows: products } = await client.query(
      `SELECT p.product_id, p.sku
       FROM products p
       WHERE NOT EXISTS (
         SELECT 1 FROM barcodes b WHERE b.product_id = p.product_id
       )
       ORDER BY p.created_at`,
    );

    logger.info(
      `[${businessKey}] ${products.length} product(s) missing a barcode`,
    );

    for (const product of products) {
      // Retry up to 5 times to avoid the (astronomically unlikely) collision
      let barcodeValue = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateBarcodeValue(businessKey, product.sku);
        if (!(await barcodeValueExists(client, candidate))) {
          barcodeValue = candidate;
          break;
        }
      }

      if (!barcodeValue) {
        logger.warn(
          `[${businessKey}] Could not generate unique barcode for product ${product.product_id} (${product.sku}) — skipping`,
        );
        skipped++;
        continue;
      }

      // Insert into barcodes table
      await client.query(
        `INSERT INTO barcodes (product_id, barcode_value, barcode_type, is_primary)
         VALUES ($1, $2, 'CODE128', true)`,
        [product.product_id, barcodeValue],
      );

      // Also backfill the legacy products.barcode column if it's empty
      await client.query(
        `UPDATE products
         SET barcode = $1
         WHERE product_id = $2 AND (barcode IS NULL OR barcode = '')`,
        [barcodeValue, product.product_id],
      );

      logger.info(`[${businessKey}] ${product.sku} → ${barcodeValue}`);
      inserted++;
    }

    await client.query("COMMIT");
    logger.info(
      `[${businessKey}] Done — inserted: ${inserted}, skipped: ${skipped}`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(`[${businessKey}] Rollback due to error: ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  logger.info("=== Barcode backfill starting ===");
  const businesses = await loadActiveBusinesses();
  logger.info(`Businesses to process: ${businesses.join(", ")}`);

  for (const biz of businesses) {
    await backfillBusiness(biz);
  }

  logger.info("=== Barcode backfill complete ===");
  await pool.end();
}

main().catch((err) => {
  logger.error("Backfill failed", err);
  process.exit(1);
});
