#!/usr/bin/env node
"use strict";

/* ============================================================
 * Hub Platform — Storefront (Orika Living) Smoke Test
 * JBS Praxis
 *
 * Exercises the /api/store/* surface against a RUNNING server and a
 * real database. Verifies the storefront migration end to end:
 * product reads resolve through the diffusers ERP, checkout
 * re-prices server-side, newsletter / enquiry flows work, and the
 * cross-schema JOINs actually execute.
 *
 * What it CANNOT do automatically: the Paystack fulfilment path
 * (verifyAndFulfil) needs a real successful payment. That part is a
 * manual checklist printed at the end — follow it to confirm a web
 * sale truly balances with the ERP books.
 *
 * Run AGAINST LOCAL / STAGING ONLY. It creates a real pending
 * order and a real enquiry row.
 *
 * Prerequisites:
 *   1. Migrations applied through 000030 (npm run migrate)
 *   2. The diffusers business provisioned
 *   3. At least one store.products row linked to a diffusers SKU
 *      that has stock (see SETUP below)
 *   4. Server running (npm start)
 *
 * Usage:
 *   BASE_URL=http://localhost:7000 node scripts/storeSmokeTest.js
 *
 * Exit 0 = all automated checks passed, 1 = something failed.
 * ============================================================ */

const BASE_URL = process.env.BASE_URL || "http://localhost:7000";
const API = `${BASE_URL}/api`;

let passed = 0;
let failed = 0;
let skipped = 0;
const ctx = {};

function log(m) {
  process.stdout.write(m + "\n");
}

async function step(name, fn) {
  try {
    const result = await fn();
    if (result === "skip") {
      skipped++;
      log(`  ○ ${name} — skipped`);
    } else {
      passed++;
      log(`  ✓ ${name}`);
    }
  } catch (err) {
    failed++;
    log(`  ✗ ${name}`);
    log(`      ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function expectOk(method, path, body) {
  const { status, json } = await call(method, path, body);
  if (status < 200 || status >= 300) {
    throw new Error(`${method} ${path} → ${status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// ── the smoke path ───────────────────────────────────────────
async function run() {
  log("");
  log(`Orika Living storefront smoke test → ${BASE_URL}`);
  log("─".repeat(58));

  // 1. PRODUCTS — the cross-schema JOIN to diffusers.products
  log("\n[1] Product reads (store.products → diffusers ERP)");

  await step("GET /store/products returns a list", async () => {
    const res = await expectOk("GET", "/store/products");
    const data = res.data || res;
    assert(Array.isArray(data), "products response is not a list");
    if (data.length === 0) {
      log("      (no published in-stock products — see SETUP below)");
      return;
    }
    // Stash the first product for later steps.
    ctx.product = data[0];
  });

  await step(
    "product carries ERP-derived price_kobo and stock_qty",
    async () => {
      if (!ctx.product) return "skip";
      const p = ctx.product;
      // These fields come from the diffusers JOIN, not store.products.
      assert(
        typeof p.price_kobo === "number" || typeof p.price_kobo === "string",
        "price_kobo missing — the diffusers.products JOIN may be broken",
      );
      assert(
        typeof p.stock_qty === "number",
        "stock_qty missing — the stock_movements SUM may be broken",
      );
      assert(p.slug, "product has no slug");
    },
  );

  await step("GET /store/products/:slug resolves one product", async () => {
    if (!ctx.product) return "skip";
    const res = await expectOk(
      "GET",
      `/store/products/${encodeURIComponent(ctx.product.slug)}`,
    );
    assert(res.slug === ctx.product.slug, "slug mismatch on detail fetch");
  });

  await step("GET /store/products/featured filters by format", async () => {
    if (!ctx.product) return "skip";
    const res = await expectOk(
      "GET",
      `/store/products/featured?format=${encodeURIComponent(ctx.product.format)}&limit=4`,
    );
    const data = res.data || res;
    assert(Array.isArray(data), "featured response is not a list");
  });

  await step("GET /store/products/:slug/related works", async () => {
    if (!ctx.product) return "skip";
    const res = await expectOk(
      "GET",
      `/store/products/${encodeURIComponent(ctx.product.slug)}/related` +
        `?family=${encodeURIComponent(ctx.product.scent_family)}` +
        `&exclude=${ctx.product.id}&limit=4`,
    );
    const data = res.data || res;
    assert(Array.isArray(data), "related response is not a list");
  });

  await step("unknown slug returns 404 (not 500)", async () => {
    const { status } = await call(
      "GET",
      "/store/products/this-slug-does-not-exist-xyz",
    );
    assert(status === 404, `expected 404, got ${status}`);
  });

  // 2. SCENTS & SIGNATURES
  log("\n[2] Scents & signatures");
  await step("GET /store/scents returns a list", async () => {
    const res = await expectOk("GET", "/store/scents");
    assert(Array.isArray(res.data || res), "scents not a list");
  });
  await step("GET /store/signatures returns a list", async () => {
    const res = await expectOk("GET", "/store/signatures");
    assert(Array.isArray(res.data || res), "signatures not a list");
  });

  // 3. CHECKOUT — server-side pricing + ERP contact creation
  log("\n[3] Checkout (server-side re-pricing)");

  await step("POST /store/orders creates a pending order", async () => {
    if (!ctx.product) {
      log("      (no product available — checkout cannot be tested)");
      return "skip";
    }
    if (ctx.product.stock_qty < 1) {
      log("      (product out of stock — checkout cannot be tested)");
      return "skip";
    }
    const res = await expectOk("POST", "/store/orders", {
      delivery_address: {
        full_name: "Smoke Test Buyer",
        phone: "08000000000",
        email: `smoke+${Date.now()}@orikaliving.test`,
        street: "1 Test Street",
        city: "Lagos",
        state: "Lagos",
      },
      items: [{ product_id: ctx.product.id, quantity: 1 }],
    });
    assert(res.ok === true, "order response not ok");
    assert(res.order_id, "no order_id returned");
    assert(res.reference, "no Paystack reference returned");
    ctx.orderId = res.order_id;
    ctx.reference = res.reference;

    // The server-derived total must equal the ERP price, NOT anything
    // the client could have sent (the client sent no price at all).
    const erpKobo = Number(ctx.product.price_kobo);
    assert(
      Number(res.amount_kobo) === erpKobo,
      `order total ${res.amount_kobo} != ERP price ${erpKobo} — ` +
        `server-side pricing is wrong`,
    );
  });

  await step("GET /store/orders/:id returns the pending order", async () => {
    if (!ctx.orderId) return "skip";
    const res = await expectOk("GET", `/store/orders/${ctx.orderId}`);
    assert(res.status === "pending", `order status is ${res.status}`);
  });

  await step("checkout rejects an invalid product id", async () => {
    const { status } = await call("POST", "/store/orders", {
      delivery_address: {
        full_name: "Bad Buyer",
        phone: "08000000000",
        email: "bad@orikaliving.test",
        street: "x",
        city: "x",
        state: "x",
      },
      items: [
        { product_id: "00000000-0000-0000-0000-000000000000", quantity: 1 },
      ],
    });
    assert(status >= 400 && status < 500, `expected 4xx, got ${status}`);
  });

  // 4. NEWSLETTER
  log("\n[4] Newsletter");
  await step("POST /store/newsletter/subscribe works", async () => {
    const res = await expectOk("POST", "/store/newsletter/subscribe", {
      email: `smoke+nl${Date.now()}@orikaliving.test`,
      source: "smoke-test",
    });
    assert(res.ok === true, "subscribe not ok");
  });
  await step("subscribe rejects a bad email", async () => {
    const { status } = await call("POST", "/store/newsletter/subscribe", {
      email: "not-an-email",
    });
    assert(status === 400, `expected 400, got ${status}`);
  });
  await step("unsubscribe rejects an unknown token", async () => {
    const { status } = await call("POST", "/store/newsletter/unsubscribe", {
      token: "00000000-0000-0000-0000-000000000000",
    });
    assert(status === 404, `expected 404, got ${status}`);
  });

  // 5. ENQUIRIES
  log("\n[5] Enquiries");
  await step("POST /store/enquiries submits an enquiry", async () => {
    const res = await expectOk("POST", "/store/enquiries", {
      name: "Smoke Tester",
      email: `smoke+enq${Date.now()}@orikaliving.test`,
      phone: "08000000000",
      type: "General Enquiry",
      message: "This is an automated smoke-test enquiry.",
    });
    assert(res.ok === true, "enquiry not ok");
  });
  await step("enquiry rejects an invalid type", async () => {
    const { status } = await call("POST", "/store/enquiries", {
      name: "X",
      email: "x@x.com",
      phone: "080",
      type: "Not A Real Type",
      message: "hello there",
    });
    assert(status === 400, `expected 400, got ${status}`);
  });

  finish();
}

function finish() {
  log("");
  log("─".repeat(58));
  log(`  ${passed} passed, ${failed} failed, ${skipped} skipped`);
  log("");

  if (skipped > 0) {
    log("SETUP — some checks were skipped because no usable product");
    log("was found. To exercise the full path you need at least one");
    log("store.products row that:");
    log("  • links (product_id) to a real diffusers.products SKU");
    log("  • has is_published = true");
    log("  • whose SKU has positive stock in diffusers.stock_movements");
    log("");
  }

  log("MANUAL — the Paystack fulfilment path (cannot be automated):");
  log("This is the check that proves a web sale balances with the ERP.");
  log("  1. Take the order created above (or make a fresh one) and pay");
  log("     for it with a Paystack TEST card via the storefront.");
  log("  2. Hit GET /api/store/paystack/verify?reference=<ref>.");
  log("  3. In the ERP database, confirm for that order:");
  log("     • store.orders.status flipped to 'paid'");
  log("     • store.orders.journal_entry_id and cogs_entry_id are set");
  log("     • a diffusers.stock_movements row exists (movement_type");
  log("       'sold', referenceType 'store_order')");
  log("     • diffusers journal entries exist for the revenue and the");
  log("       COGS — and each one balances (debits = credits)");
  log("  4. Call verify a SECOND time with the same reference — it");
  log("     must return { already: true } and NOT post anything again");
  log("     (idempotency).");
  log("");

  if (failed > 0) {
    log("STORE SMOKE TEST FAILED — see the ✗ lines above.");
    process.exit(1);
  } else {
    log("STORE SMOKE TEST PASSED — automated checks are green.");
    log("Do the MANUAL fulfilment check before going live.");
    process.exit(0);
  }
}

run().catch((err) => {
  log(`\nFATAL: ${err.message}`);
  log("(Is the server running? Is BASE_URL correct?)");
  process.exit(1);
});
