"use strict";

const { Pool } = require("pg");
const config = require("./config");
const logger = require("./logger");

// ── Connection pool ───────────────────────────────────────
const pool = new Pool({
  host: config.pg.host,
  port: config.pg.port,
  database: config.pg.database,
  user: config.pg.user,
  password: config.pg.password,
  ssl: config.pg.ssl,
  ...config.pg.pool,
});

pool.on("connect", (client) => {
  // Set default search_path to shared only on raw connections
  // businessContext middleware overrides this per-request using SET LOCAL
  client.query("SET search_path TO shared, public");
});

pool.on("error", (err) => {
  logger.error("Unexpected PG pool error", err);
});

// ── Transaction wrapper with business context ─────────────
// USE THIS for every request that touches the database.
// SET LOCAL means search_path reverts when the transaction ends —
// safe to reuse the pooled connection across different businesses.
async function withBusinessContext(business, callback) {
  // Use the dynamic business cache, not the hardcoded config.app.businesses.
  // The cache is populated at startup by server.js calling
  // businesses.loadActiveBusinesses(), and refreshed whenever a business
  // is created or deactivated.
  const businesses = require("./businesses"); // lazy — avoids circular import
  if (!businesses.isValidBusiness(business)) {
    throw new Error(`Invalid business context: ${business}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO ${business}, shared, public`);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Shared-only transaction (no business schema) ──────────
// Use for operations that only touch shared schema:
// auth, contacts, notifications, audit, staff, settings
async function withSharedContext(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL search_path TO shared, public");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Store context ─────────────────────────────────────────
// Sets search_path to the `store` schema for the Orika Living
// storefront. The storefront is single-tenant (diffusers brand),
// so there's no business key — just a fixed schema, like
// withSharedContext but pointed at `store`.
async function withStoreContext(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL search_path TO store, public");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Document sequence — atomic increment ──────────────────
// Always use this to get the next document number.
// SELECT FOR UPDATE prevents duplicate numbers under concurrency.
async function nextDocumentNumber(client, business, documentType) {
  const result = await client.query(
    `UPDATE shared.document_numbering
     SET next_number = next_number + 1
     WHERE business = $1 AND document_type = $2
     RETURNING prefix, next_number, padding`,
    [business, documentType],
  );
  if (!result.rows.length) {
    throw new Error(`No sequence defined for ${business}/${documentType}`);
  }
  const { prefix, next_number, padding } = result.rows[0];
  return `${prefix}-${String(next_number).padStart(padding, "0")}`;
}

// ── Graceful shutdown ─────────────────────────────────────
async function shutdown() {
  logger.info("Closing PostgreSQL pool...");
  await pool.end();
  logger.info("PostgreSQL pool closed.");
}

// ── Health check ──────────────────────────────────────────
async function healthCheck() {
  const result = await pool.query("SELECT now() AS time");
  return result.rows[0].time;
}

module.exports = {
  pool,
  withBusinessContext,
  withSharedContext,
  withStoreContext,
  nextDocumentNumber,
  shutdown,
  healthCheck,
};
