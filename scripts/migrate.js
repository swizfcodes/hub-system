// ============================================================
// Hub Platform — Database Migrator
// Usage:
//   node migrate.js run       — apply all pending migrations
//   node migrate.js status    — show applied / pending
//   node migrate.js verify    — check table counts per schema
// ============================================================

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ── Config ────────────────────────────────────────────────
// Copy .env.example to .env and fill in your values
require("dotenv").config();

const DB_CONFIG = {
  host: process.env.PG_HOST || "localhost",
  port: parseInt(process.env.PG_PORT || "5432"),
  database: process.env.PG_DATABASE || "hub_db",
  user: process.env.PG_USER || "postgres",
  password: process.env.PG_PASSWORD || "",
};

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

// ── Helpers ───────────────────────────────────────────────
function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function getMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function ensureMigrationsTable(client) {
  // If shared schema doesn't exist yet, we can't check migrations
  // Migration 000001 creates shared schema and the migrations table
  // For the very first run we just proceed
  try {
    await client.query(`
      SELECT 1 FROM shared.migrations LIMIT 1
    `);
  } catch {
    console.log(
      "  shared.migrations table not yet created — first run detected",
    );
  }
}

async function getAppliedMigrations(client) {
  try {
    const result = await client.query(
      `SELECT filename, applied_at, status FROM shared.migrations ORDER BY applied_at`,
    );
    return new Set(result.rows.map((r) => r.filename));
  } catch {
    return new Set();
  }
}

async function runMigration(client, filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const content = fs.readFileSync(filepath, "utf8");
  const checksum = sha256(content);
  const start = Date.now();

  console.log(`\n  → Applying: ${filename}`);

  try {
    await client.query("BEGIN");
    await client.query(content);

    // Record the migration (table may not exist for first migration)
    try {
      await client.query(
        `INSERT INTO shared.migrations (filename, applied_by, checksum, execution_ms, status)
         VALUES ($1, $2, $3, $4, 'applied')
         ON CONFLICT (filename) DO UPDATE SET status = 'applied', applied_at = now()`,
        [
          filename,
          process.env.HOSTNAME || "local",
          checksum,
          Date.now() - start,
        ],
      );
    } catch {
      // Table doesn't exist yet — first migration creates it
    }

    await client.query("COMMIT");
    console.log(`  ✓ Done in ${Date.now() - start}ms`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`  ✗ FAILED: ${err.message}`);
    throw err;
  }
}

// ── Commands ──────────────────────────────────────────────
async function runMigrations() {
  const client = new Client(DB_CONFIG);
  await client.connect();
  console.log(
    `\nConnected to: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`,
  );

  try {
    const applied = await getAppliedMigrations(client);
    const files = getMigrationFiles();
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log("\n✓ All migrations already applied. Nothing to do.\n");
      return;
    }

    console.log(`\nPending migrations: ${pending.length}`);
    for (const file of pending) {
      await runMigration(client, file);
    }
    console.log("\n✓ All migrations applied successfully.\n");
  } finally {
    await client.end();
  }
}

async function showStatus() {
  const client = new Client(DB_CONFIG);
  await client.connect();

  try {
    const applied = await getAppliedMigrations(client);
    const files = getMigrationFiles();

    console.log("\n Migration Status\n");
    console.log(" Status    File");
    console.log(" ────────────────────────────────────────────────────────");
    for (const f of files) {
      const status = applied.has(f) ? "✓ applied" : "○ pending";
      console.log(` ${status.padEnd(10)} ${f}`);
    }
    console.log(
      `\n Total: ${files.length} | Applied: ${applied.size} | Pending: ${files.length - applied.size}\n`,
    );
  } finally {
    await client.end();
  }
}

async function verify() {
  const client = new Client(DB_CONFIG);
  await client.connect();

  try {
    console.log("\n Schema Verification\n");

    const result = await client.query(`
      SELECT table_schema, COUNT(*) as table_count
      FROM information_schema.tables
      WHERE table_schema IN ('shared','jewelry','diffusers')
      AND table_type = 'BASE TABLE'
      GROUP BY table_schema ORDER BY table_schema
    `);

    result.rows.forEach((r) => {
      console.log(`  ${r.table_schema.padEnd(12)} ${r.table_count} tables`);
    });

    const triggers = await client.query(`
      SELECT COUNT(*) as trigger_count FROM information_schema.triggers
      WHERE trigger_schema IN ('shared','jewelry','diffusers')
    `);
    console.log(`\n  Triggers:    ${triggers.rows[0].trigger_count}`);

    const indexes = await client.query(`
      SELECT COUNT(*) as index_count FROM pg_indexes
      WHERE schemaname IN ('shared','jewelry','diffusers')
    `);
    console.log(`  Indexes:     ${indexes.rows[0].index_count}`);

    const roles = await client.query(
      `SELECT role_name, COALESCE(business,'(all)') as business FROM shared.roles ORDER BY role_name`,
    );
    console.log(`\n  Roles seeded: ${roles.rows.length}`);
    roles.rows.forEach((r) =>
      console.log(`    • ${r.role_name} — ${r.business}`),
    );

    console.log("");
  } finally {
    await client.end();
  }
}

// ── Entry point ───────────────────────────────────────────
const command = process.argv[2] || "run";

(async () => {
  try {
    if (command === "run") await runMigrations();
    else if (command === "status") await showStatus();
    else if (command === "verify") await verify();
    else {
      console.log("Usage: node migrate.js [run|status|verify]");
      process.exit(1);
    }
  } catch (err) {
    console.error("\nMigrator error:", err.message);
    process.exit(1);
  }
})();
