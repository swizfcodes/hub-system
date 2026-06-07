#!/usr/bin/env node
"use strict";

/* ============================================================
 * Hub Platform — stock_movements Resolution Diagnostic
 * JBS Praxis
 *
 * The getCurrentStock query says `FROM stock_movements` (unqualified).
 * Under withBusinessContext('jewelry') the search_path is
 * `jewelry, shared, public`, so Postgres resolves that name to the
 * FIRST stock_movements it finds on the path. If a stale/partial
 * stock_movements exists in shared or public, the query silently
 * binds to the wrong one — which would explain
 * `column "quantity" does not exist` even though
 * jewelry.stock_movements is fine.
 *
 * This script reproduces the app's exact connection + search_path
 * and asks Postgres which table the name actually resolves to.
 *
 * Run from the hub-system folder:
 *   node scripts/diagnoseStock.js
 * ============================================================ */

let pool;
try {
  ({ pool } = require("../config/db"));
} catch (err) {
  console.error("Could not load config/db.js:", err.message);
  process.exit(1);
}

async function show(label, sql, params = []) {
  try {
    const { rows } = await pool.query(sql, params);
    console.log(`\n── ${label} ──`);
    if (rows.length === 0) console.log("  (no rows)");
    else for (const r of rows) console.log("  " + JSON.stringify(r));
    return rows;
  } catch (err) {
    console.log(`\n── ${label} ──`);
    console.log("  ERROR: " + err.message);
    return [];
  }
}

async function main() {
  console.log("stock_movements resolution diagnostic");
  console.log("=".repeat(56));

  // 1. Every object called stock_movements — table OR view — anywhere.
  await show(
    "All objects named stock_movements (kind: r=table v=view m=matview)",
    `SELECT n.nspname AS schema, c.relkind AS kind
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'stock_movements'
     ORDER BY n.nspname`,
  );

  // 2. Columns of EVERY stock_movements found, per schema.
  await show(
    "Columns of each stock_movements, per schema",
    `SELECT table_schema, column_name
     FROM information_schema.columns
     WHERE table_name = 'stock_movements'
     ORDER BY table_schema, ordinal_position`,
  );

  // 3. Now reproduce the app's context EXACTLY and ask Postgres which
  //    table `stock_movements` resolves to on the jewelry search_path.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL search_path TO jewelry, shared, public");

    const sp = await client.query("SHOW search_path");
    console.log(
      `\n── search_path inside withBusinessContext('jewelry') ──\n  ` +
        JSON.stringify(sp.rows[0]),
    );

    // regclass resolves the name the SAME way a query would.
    const reg = await client.query(
      `SELECT 'stock_movements'::regclass AS resolves_to,
              (SELECT n.nspname
               FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.oid = 'stock_movements'::regclass) AS in_schema`,
    );
    console.log(
      `\n── 'stock_movements' resolves to ──\n  ` + JSON.stringify(reg.rows[0]),
    );

    // The actual failing fragment, in isolation, under this context.
    try {
      await client.query(
        `SELECT SUM(quantity * direction) AS q FROM stock_movements`,
      );
      console.log(
        "\n── Test query `SUM(quantity*direction) FROM stock_movements` ──\n" +
          "  ✓ SUCCEEDED — the unqualified query works in this context",
      );
    } catch (err) {
      console.log(
        "\n── Test query `SUM(quantity*direction) FROM stock_movements` ──\n" +
          "  ✗ FAILED: " +
          err.message +
          "\n  → this is the smoke-test bug, reproduced.",
      );
    }

    // And the explicitly-qualified version, for contrast.
    try {
      await client.query(
        `SELECT SUM(quantity * direction) AS q FROM jewelry.stock_movements`,
      );
      console.log(
        "\n── Test query against jewelry.stock_movements explicitly ──\n" +
          "  ✓ SUCCEEDED — the jewelry table itself is fine",
      );
    } catch (err) {
      console.log(
        "\n── Test query against jewelry.stock_movements explicitly ──\n" +
          "  ✗ FAILED: " +
          err.message,
      );
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
  }

  console.log("\n" + "=".repeat(56));
  console.log("Done. Copy ALL output above and send it back.");
  await pool.end();
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
