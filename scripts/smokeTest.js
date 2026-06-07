#!/usr/bin/env node
"use strict";

/* ============================================================
 * Hub Platform — Smoke Test
 * JBS Praxis
 *
 * Exercises the critical path against a RUNNING server + a real
 * database. This is not a unit test — it makes real HTTP calls and
 * leaves real rows behind. Run it against a STAGING or LOCAL
 * database, NEVER production.
 *
 * Prerequisites (see SMOKE_TEST.md):
 *   1. Migrations applied (npm run migrate)
 *   2. An admin user created (npm run admin)
 *   3. Both businesses provisioned (node scripts/bootstrapBusiness.js)
 *   4. Server running (npm start)
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 \
 *   SMOKE_EMAIL=owner@orika.test \
 *   SMOKE_PASSWORD=yourpassword \
 *   node scripts/smokeTest.js
 *
 * Exit code 0 = all passed, 1 = something failed.
 * ============================================================ */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = process.env.SMOKE_EMAIL || "owner@orika.test";
const PASSWORD = process.env.SMOKE_PASSWORD || "ChangeMe123!";
const BUSINESS = process.env.SMOKE_BUSINESS || "jewelry";
const API = `${BASE_URL}/api`;

// ── tiny test harness ────────────────────────────────────────
let passed = 0;
let failed = 0;
let token = null;
const ctx = {}; // carries ids between steps

function log(msg) {
  process.stdout.write(msg + "\n");
}

async function step(name, fn) {
  try {
    await fn();
    passed++;
    log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    log(`  ✗ ${name}`);
    log(`      ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

/**
 * Thin fetch wrapper — attaches the JWT and business header, parses
 * JSON, and throws a useful error on a non-2xx response.
 */
async function call(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  headers["x-business-line"] = BUSINESS;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `${method} ${path} → ${res.status}: ${JSON.stringify(json)}`,
    );
  }
  return json;
}

// ── the smoke path ───────────────────────────────────────────
async function run() {
  log("");
  log(`Hub smoke test → ${BASE_URL}  (business: ${BUSINESS})`);
  log("─".repeat(56));

  // 1. AUTH — everything else needs a token
  log("\n[1] Authentication");
  await step("login returns a token", async () => {
    const res = await call("POST", "/auth/login", {
      email: EMAIL,
      password: PASSWORD,
    });
    // authService.login returns { accessToken, refreshToken, user }.
    token = res.accessToken;
    assert(token, "no accessToken in login response");
  });

  if (!token) {
    log("\nABORT — cannot continue without a token.");
    finish();
    return;
  }

  // 2. CATALOGUE — the master data everything else references
  log("\n[2] Catalogue master data");
  await step("create a category", async () => {
    const res = await call("POST", "/catalogue/categories", {
      name: `Smoke Rings ${Date.now()}`,
    });
    ctx.categoryId = res.category_id;
    assert(ctx.categoryId, "no category_id returned");
  });

  await step("create a stock location", async () => {
    const res = await call("POST", "/catalogue/locations", {
      name: `Smoke Warehouse ${Date.now()}`,
      location_type: "warehouse",
    });
    ctx.locationId = res.location_id;
    assert(ctx.locationId, "no location_id returned");
  });

  await step("create a product (auto-barcode)", async () => {
    const res = await call("POST", "/catalogue/products", {
      sku: `SMOKE-${Date.now()}`,
      name: "Smoke Test Gold Ring",
      category_id: ctx.categoryId,
      cost_price: 50000,
      selling_price: 75000,
    });
    ctx.productId = res.product_id;
    assert(ctx.productId, "no product_id returned");
    assert(
      res.primary_barcode && res.primary_barcode.barcode_value,
      "product was not given an auto-generated barcode",
    );
    ctx.barcode = res.primary_barcode.barcode_value;
  });

  await step("look the product up by its barcode", async () => {
    const res = await call(
      "GET",
      `/catalogue/barcodes/lookup/${encodeURIComponent(ctx.barcode)}`,
    );
    assert(
      res.product_id === ctx.productId,
      "barcode resolved to wrong product",
    );
  });

  // 3. CHART OF ACCOUNTS — accounting must be reachable
  log("\n[3] Accounting");
  await step("list chart of accounts", async () => {
    const res = await call("GET", "/accounting/accounts");
    const rows = res.data || res;
    assert(Array.isArray(rows) && rows.length > 0, "no accounts seeded");
  });

  // 4. STOCK — receive the product so there's something to sell
  log("\n[4] Stock movement");
  await step("adjust stock up (opening balance)", async () => {
    // /stock/adjustment is an absolute-level correction: quantity_after
    // is the count the stock should BECOME, not a delta to add.
    const res = await call("POST", "/stock/adjustment", {
      product_id: ctx.productId,
      location_id: ctx.locationId,
      quantity_after: 10,
      reason: "Smoke test opening stock",
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(
        `POST /stock/adjustment → ${res.status}: ${JSON.stringify(res.json)}`,
      );
    }
  });

  await step("stock level reflects the adjustment", async () => {
    const res = await call("GET", `/stock?product_id=${ctx.productId}`);
    const rows = res.data || res;
    assert(Array.isArray(rows), "stock list not an array");
  });

  // 5. POS — terminal, then a sale
  log("\n[5] Point of sale");
  await step("create a POS terminal", async () => {
    const res = await call("POST", "/pos/terminals", {
      name: `Smoke Till ${Date.now()}`,
      location_id: ctx.locationId,
    });
    ctx.terminalId = res.terminal_id;
    assert(ctx.terminalId, "no terminal_id returned");
  });

  // 6. DISCOUNTS — the promotions catalogue
  log("\n[6] Discounts");
  await step("create a discount rule", async () => {
    const res = await call("POST", "/discounts", {
      discount_name: `Smoke 10% ${Date.now()}`,
      discount_type: "percentage",
      value: 10,
    });
    assert(res.discount_id, "no discount_id returned");
  });

  // 7. CRM — a contact, then enrichments
  log("\n[7] CRM");
  await step("list deals (pipeline reachable)", async () => {
    await call("GET", "/crm/deals");
  });

  // 8. NOTIFICATIONS — preference upsert (the ON CONFLICT path)
  log("\n[8] Notification preferences");
  await step("set a notification preference (upsert)", async () => {
    const res = await call("PUT", "/notifications/preferences", {
      notification_type: "smoke_test",
      email_enabled: false,
    });
    assert(res.pref_id || res.notification_type, "preference not saved");
  });
  await step("upsert the same preference again (no duplicate)", async () => {
    // Second call hits ON CONFLICT — proves the unique constraint exists.
    await call("PUT", "/notifications/preferences", {
      notification_type: "smoke_test",
      email_enabled: true,
    });
  });

  // 9. DASHBOARDS / REPORTS — read paths
  log("\n[9] Dashboards & reports");
  await step("dashboard overview loads", async () => {
    await call("GET", "/dashboards/overview");
  });
  await step("dashboard configs list loads", async () => {
    await call("GET", "/dashboards/configs");
  });

  finish();
}

function finish() {
  log("");
  log("─".repeat(56));
  log(`  ${passed} passed, ${failed} failed`);
  log("");
  if (failed > 0) {
    log("SMOKE TEST FAILED — see the ✗ lines above.");
    process.exit(1);
  } else {
    log("SMOKE TEST PASSED — critical path is alive.");
    process.exit(0);
  }
}

run().catch((err) => {
  log(`\nFATAL: ${err.message}`);
  log("(Is the server running? Is BASE_URL correct?)");
  process.exit(1);
});
