#!/usr/bin/env node
"use strict";

// ─────────────────────────────────────────────────────────────
// scripts/bootstrapBusiness.js
//
// Provisions a brand-new business end-to-end:
//
//   1. Validates the business_key is a safe PostgreSQL identifier
//   2. Checks the key isn't already taken
//   3. CREATE SCHEMA in a transaction
//   4. Runs each migrations/template/*.sql.template against the new schema
//      (substituting {{BUSINESS}} → the business_key)
//   5. Inserts the business_config row
//   6. Seeds 12 document_numbering rows for the new business
//   7. Refreshes the in-memory businesses cache
//
// Usage:
//   node scripts/bootstrapBusiness.js \
//     --key watches \
//     --display-name "Hub Watches" \
//     --legal-name "Hub Watches Ltd" \
//     --prefix WTC \
//     [--currency NGN] [--vat-rate 0.075] [--wht-rate 0.05]
//
// Or programmatically:
//   const { bootstrap } = require('./scripts/bootstrapBusiness');
//   await bootstrap({ key, displayName, legalName, prefix, ... });
//
// Same code is invoked by POST /settings/businesses { provision_schema: true }
// in settings.routes.js.
// ─────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");
const businesses = require("../config/businesses");
const logger = require("../config/logger");

const TEMPLATE_DIR = path.join(__dirname, "..", "migrations", "template");

// In sorted order — same numbering as the original migrations.
// Order matters: tables first, then indexes (000020), then triggers
// (000021 — references the tables via FK-like enforcement), then the
// Sprint 4 gap fillers (000023 — adds columns/indexes to the tables).
const TEMPLATE_ORDER = [
  // Tables (per-business halves of 000007-000019)
  "000007_business_catalogue.sql.template",
  "000008_business_stock.sql.template",
  "000009_business_crm.sql.template",
  "000010_business_sales.sql.template",
  "000011_business_pos.sql.template",
  "000012_business_invoicing.sql.template",
  "000013_business_accounting.sql.template",
  "000014_business_purchasing.sql.template",
  "000015_to_000019_expenses_to_marketing.sql.template",
  // Indexes
  "000020_indexes.sql.template",
  // Triggers (must come after tables)
  "000021_triggers.sql.template",
  // Sprint 4 schema gaps (per-business additions)
  "000023_close_sprint3_schema_gaps.sql.template",
  "000024_loyalty_management.sql.template",
];

// Document types that should be seeded for every new business —
// matches the 12 jewelry/diffusers rows in migrations/000022_seed_data.sql.
const DOCUMENT_TYPES = [
  { type: "invoice", suffix: "INV" },
  { type: "purchase_order", suffix: "PO" },
  { type: "quotation", suffix: "QT" },
  { type: "delivery", suffix: "DN" },
  { type: "payslip", suffix: "PS" },
  { type: "credit_note", suffix: "CN" },
  { type: "settlement", suffix: "STL" },
  { type: "receipt", suffix: "RCP" },
  { type: "rfq", suffix: "RFQ" },
  { type: "transfer", suffix: "TRF" },
  { type: "expense", suffix: "EXP" },
  { type: "payroll_run", suffix: "PR" },
];

// ─────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────

const RESERVED_KEYS = new Set([
  "shared",
  "public",
  "pg_catalog",
  "information_schema",
  "template",
  "templates",
  "admin",
  "system",
  "postgres",
]);

function validateKey(key) {
  if (!key || typeof key !== "string") {
    throw new Error("business_key is required");
  }
  if (!/^[a-z][a-z0-9_]{1,29}$/.test(key)) {
    throw new Error(
      "business_key must be lowercase, start with a letter, contain only letters/digits/underscore, and be 2-30 characters long",
    );
  }
  if (RESERVED_KEYS.has(key)) {
    throw new Error(`business_key '${key}' is reserved`);
  }
}

function validatePrefix(prefix) {
  if (!prefix || typeof prefix !== "string") {
    throw new Error("prefix is required (e.g. WTC for watches)");
  }
  if (!/^[A-Z]{2,5}$/.test(prefix)) {
    throw new Error(
      "prefix must be 2-5 uppercase letters (e.g. WTC, JWL, DFS)",
    );
  }
}

// ─────────────────────────────────────────────────────────────
// CORE BOOTSTRAP
// ─────────────────────────────────────────────────────────────

/**
 * Bootstrap a new business. Returns the business_config row on success.
 *
 * @param {Object} opts
 * @param {string} opts.key           the business_key (e.g. "watches")
 * @param {string} opts.displayName   the user-facing name ("Hub Watches")
 * @param {string} opts.legalName     full legal name ("Hub Watches Ltd")
 * @param {string} opts.prefix        document-number prefix (e.g. "WTC")
 * @param {string} [opts.currency]    default currency (default "NGN")
 * @param {number} [opts.vatRate]     default VAT rate (default 0.075)
 * @param {number} [opts.whtRate]     default WHT rate (default 0.05)
 * @param {string} [opts.accentColour]  hex like "#2563EB"
 * @param {number} [opts.fiscalYearStart]  month 1-12 (default 1)
 */
async function bootstrap(opts) {
  validateKey(opts.key);
  validatePrefix(opts.prefix);
  if (!opts.displayName) throw new Error("displayName is required");
  if (!opts.legalName) throw new Error("legalName is required");

  const client = await pool.connect();
  try {
    // ── Pre-check: schema and config row must not already exist
    const { rows: existsRows } = await client.query(
      `SELECT 1
       FROM information_schema.schemata
       WHERE schema_name = $1`,
      [opts.key],
    );
    if (existsRows.length) {
      throw new Error(`Schema '${opts.key}' already exists`);
    }

    const { rows: configRows } = await client.query(
      `SELECT 1 FROM shared.business_config WHERE business_key = $1`,
      [opts.key],
    );
    if (configRows.length) {
      throw new Error(`business_config row for '${opts.key}' already exists`);
    }

    // Load all templates BEFORE starting the transaction so a bad
    // template file fails fast.
    const renderedTemplates = TEMPLATE_ORDER.map((name) => {
      const filePath = path.join(TEMPLATE_DIR, name);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Template file missing: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, "utf-8");
      // Substitute {{BUSINESS}} → key. Schema name is already validated.
      const sql = raw.replace(/\{\{BUSINESS\}\}/g, opts.key);
      return { name, sql };
    });

    // ── Transaction: schema + tables + config + document_numbering
    await client.query("BEGIN");

    logger.info(`[bootstrap:${opts.key}] CREATE SCHEMA`);
    await client.query(`CREATE SCHEMA ${opts.key}`);

    for (const t of renderedTemplates) {
      logger.info(`[bootstrap:${opts.key}] Applying ${t.name}`);
      await client.query(t.sql);
    }

    logger.info(`[bootstrap:${opts.key}] INSERT shared.business_config`);
    const { rows: configInsert } = await client.query(
      `INSERT INTO shared.business_config
         (business_key, display_name, legal_name, default_currency,
          vat_rate, wht_rate, accent_colour, fiscal_year_start,
          mission_statement, brand_fonts, cash_handling_rules,
          payment_methods, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, true)
       RETURNING *`,
      [
        opts.key,
        opts.displayName,
        opts.legalName,
        opts.currency || "NGN",
        opts.vatRate ?? 0.075,
        opts.whtRate ?? 0.05,
        opts.accentColour || "#2563EB",
        opts.fiscalYearStart ?? 1,
        opts.missionStatement || null,
        JSON.stringify(opts.brandFonts || {}),
        JSON.stringify(opts.cashHandlingRules || {}),
        JSON.stringify(opts.paymentMethods || {}),
      ],
    );

    logger.info(`[bootstrap:${opts.key}] Seeding document_numbering`);
    for (const dt of DOCUMENT_TYPES) {
      await client.query(
        `INSERT INTO shared.document_numbering
           (business, document_type, prefix, next_number, padding)
         VALUES ($1, $2, $3, 1, 4)
         ON CONFLICT (business, document_type)
         DO UPDATE SET
          prefix = EXCLUDED.prefix`,
        [opts.key, dt.type, `${opts.prefix}-${dt.suffix}`],
      );
    }

    await client.query("COMMIT");

    // Cache hook — new business becomes valid for routing immediately.
    businesses.addToCache(configInsert[0]);

    logger.info(
      `[bootstrap:${opts.key}] Done. Schema, ${renderedTemplates.length} migrations, business_config row, and ${DOCUMENT_TYPES.length} document_numbering rows applied.`,
    );

    return configInsert[0];
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    // Best-effort cleanup: if the schema was created but later steps
    // failed, drop it so retry is clean. We do this outside the txn
    // since the txn is already rolled back.
    try {
      await client.query(`DROP SCHEMA IF EXISTS ${opts.key} CASCADE`);
      logger.warn(
        `[bootstrap:${opts.key}] Cleaned up partial schema after failure`,
      );
    } catch (cleanupErr) {
      logger.error(
        `[bootstrap:${opts.key}] Failed to clean up partial schema: ${cleanupErr.message}`,
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────
// CLI ENTRY
// ─────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.key) {
    console.log(`
Usage:
  node scripts/bootstrapBusiness.js --key <key> --display-name <name> \\
       --legal-name <legal> --prefix <PREFIX> [options]

Required:
  --key            lowercase business identifier (e.g. watches)
  --display-name   user-facing name (e.g. "Hub Watches")
  --legal-name     legal company name (e.g. "Hub Watches Ltd")
  --prefix         document number prefix, 2-5 uppercase letters (e.g. WTC)

Optional:
  --currency        ISO code (default NGN)
  --vat-rate        decimal (default 0.075)
  --wht-rate        decimal (default 0.05)
  --accent-colour   hex (default #2563EB)
  --fiscal-year-start  month 1-12 (default 1)
  --mission-statement  text

Example:
  node scripts/bootstrapBusiness.js \\
    --key watches \\
    --display-name "Hub Watches" \\
    --legal-name "Hub Watches Ltd" \\
    --prefix WTC
`);
    process.exit(args.help ? 0 : 1);
  }

  try {
    // The DB cache may not be loaded if this runs as a standalone CLI,
    // so load it first. addToCache at the end works either way.
    await businesses.loadActiveBusinesses();
    const row = await bootstrap({
      key: args.key,
      displayName: args["display-name"],
      legalName: args["legal-name"],
      prefix: args.prefix,
      currency: args.currency,
      vatRate: args["vat-rate"] ? parseFloat(args["vat-rate"]) : undefined,
      whtRate: args["wht-rate"] ? parseFloat(args["wht-rate"]) : undefined,
      accentColour: args["accent-colour"],
      fiscalYearStart: args["fiscal-year-start"]
        ? parseInt(args["fiscal-year-start"])
        : undefined,
      missionStatement: args["mission-statement"],
    });
    console.log(
      `\n✔ Business '${row.business_key}' bootstrapped successfully.`,
    );
    console.log(`  config_id: ${row.config_id}`);
    console.log(
      `  Now ready for use — the cache has been refreshed automatically.`,
    );
    process.exit(0);
  } catch (err) {
    console.error(`\n✗ Bootstrap failed: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

// ─────────────────────────────────────────────────────────────
// PS COMMAND
// ─────────────────────────────────────────────────────────────

// Ensure to update template files in templates/ if a template is added or remove shape changes (e.g. adding loyalty_settings) before running command.

// For a new diffusers business, the command would be:
// node scripts/bootstrapBusiness.js --key diffusers --display-name "Hub Diffusers" --legal-name "Hub DIFFUSERS Ltd" --prefix DFS

module.exports = { bootstrap, validateKey, validatePrefix };
