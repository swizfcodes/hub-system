"use strict";

/* eslint-disable no-console */

// ─────────────────────────────────────────────────────────────
// scripts/previewEmails.js
//
// Renders every email template to static HTML for visual review —
// no database, no SMTP, no node_modules beyond core (config modules
// are stubbed). Two brand profiles are rendered so both ends of the
// palette spectrum are checked:
//
//   • a DARK-surface brand (Orika Living espresso + gold) — the
//     palette that used to produce invisible dark-on-dark text
//   • a LIGHT-surface brand (cream + gold, the platform default)
//
// Output: documents/email-previews/
//   index.html                  side-by-side gallery (mobile + desktop)
//   <brand>--<template>.html    raw rendered emails
//
//   node scripts/previewEmails.js
// ─────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

// ── Stub the config layer so rendering needs no DB / env / deps ──
function stub(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

const BRANDS = {
  orika_dark: {
    business_key: "orika_dark",
    display_name: "Orika Living",
    legal_name: "Orika Living Ltd",
    address: "Shop G8, Lekki TownSquare Mall, Providence Street, Lekki Phase 1",
    phone: "+234 803 306 5441",
    email: "sales@orikaliving.com",
    website: "https://orikaliving.com",
    logo_path: "https://app.orikaliving.com/uploads/logos/1780470129810-diffusers.webp",
    accent_colour: "#8A6A30",
    secondary_colour: "#2B2820",
    brand_fonts: {},
    social_links: { instagram: "https://instagram.com/orikaliving" },
    email_footer_text:
      "Orika Living Ltd. Creating exceptional home fragrance experiences inspired by beauty, craftsmanship, and intentional living. All rights reserved.",
  },
  classic_light: {
    business_key: "classic_light",
    display_name: "Orika Living",
    legal_name: "Orika Living Ltd",
    address: "Shop G8, Lekki TownSquare Mall, Providence Street, Lekki Phase 1",
    phone: "+234 803 306 5441",
    email: "sales@orikaliving.com",
    website: "https://orikaliving.com",
    logo_path: "",
    accent_colour: "#C9A86C",
    secondary_colour: "#F5F0EB",
    brand_fonts: {},
    social_links: { instagram: "https://instagram.com/orikaliving" },
    email_footer_text:
      "Orika Living Ltd. Creating exceptional home fragrance experiences inspired by beauty, craftsmanship, and intentional living. All rights reserved.",
  },
};

stub("../config/config", {
  app: { hubBaseUrl: "https://app.orikaliving.com" },
  storage: { localPath: "./uploads" },
});
stub("../config/logger", { info() {}, warn() {}, error() {}, debug() {} });
stub("../config/businesses", {
  getBusinessConfig: (k) => BRANDS[k] || null,
  getActiveBusinesses: () => Object.keys(BRANDS),
});

const { renderEmail } = require("../lib/email/render");

// ── Realistic sample data per template ───────────────────────
const SAMPLES = {
  receipt: {
    contact_name: "Tom-Blake Asaah",
    transaction_number: "DFS-ORD-0006",
    transaction_date: "12 Jun 2026, 10:01",
    lines: [
      { description: "Car Diffuser — Oud Noir", quantity: 1, unit_price: 6500, line_total: 6500 },
      { description: "Reed Diffuser Refill 200ml — Amber Santal", quantity: 2, unit_price: 14500, line_total: 29000 },
    ],
    subtotal: "35500.00", // pg NUMERIC string on purpose — must not NaN
    discount_total: 0,
    vat_amount: 2662.5,
    total_amount: 38162.5,
    payment_methods: "Bank Transfer",
    invoice_number: "DFS-INV-0006",
  },
  receipt_sparse: {
    // worst-case payload (what the old sales module sent) — must
    // degrade gracefully: no NaN, no dangling "—", no empty table
    contact_name: "Tom-Blake Asaah",
    total_amount: 6500,
    invoice_number: "DFS-INV-0006",
  },
  invoice: {
    invoice_number: "DFS-INV-0012",
    contact_name: "Adaeze Okafor",
    total_amount: 145000,
    due_date: "26 Jun 2026",
    payment_url: "https://app.orikaliving.com/pay/inv-0012",
  },
  invite: {
    display_name: "Funmi Adeyemi",
    invited_by: "Tom-Blake Asaah",
    invite_url: "https://app.orikaliving.com/invite/abc123",
  },
  order_confirmation: {
    customer_name: "Adaeze Okafor",
    order_id: "DFS-ORD-0107",
    items: [
      { name: "Signature Candle — Velvet Iris", quantity: 1, price_kobo: 2400000 },
      { name: "Room Mist — Casablanca Lily", quantity: 2, price_kobo: 950000 },
    ],
    total: 43000,
  },
  order_cancellation: {
    customer_name: "Adaeze Okafor",
    order_id: "DFS-ORD-0099",
    reason: "The selected fragrance is temporarily out of stock. Our team has issued a full refund.",
    items: [{ name: "Reed Diffuser — Oud Royale", quantity: 1 }],
  },
  newsletter_welcome: {},
  purchase_order: {
    po_number: "DFS-PO-0021",
    supplier_name: "Lagos Glassworks Ltd",
    expected_delivery: "30 Jun 2026",
    lines: [
      { name: "Amber glass vessel 250ml", sku: "GLS-250-AMB", quantity: 200, unit_price: 1850, line_total: 370000 },
      { name: "Black metal lid", sku: "LID-BLK", quantity: 200, unit_price: 320, line_total: 64000 },
    ],
    subtotal: 434000,
    shipping_cost: 25000,
    total_amount: 459000,
    delivery_address: "Shop G8, Lekki TownSquare Mall, Lekki Phase 1",
    notes: "Please palletise and call ahead before delivery.",
  },
  delivery_dispatched: {
    contact_name: "Adaeze Okafor",
    delivery_number: "DFS-DEL-0034",
    courier_label: "GIG Logistics",
    driver_name: "Emeka Obi",
    driver_phone: "+234 901 234 5678",
    items: [
      { description: "Signature Candle — Velvet Iris", quantity: 1 },
      { description: "Room Mist — Casablanca Lily", quantity: 2 },
    ],
    delivery_address: "14B Admiralty Way, Lekki Phase 1, Lagos",
    signing_url: "https://app.orikaliving.com/sign/xyz789",
  },
  delivery_completed: {
    contact_name: "Adaeze Okafor",
    delivery_number: "DFS-DEL-0034",
    signed_at: "12 Jun 2026, 14:22",
    has_note: true,
  },
  quotation: {
    quotation_number: "DFS-QUO-0008",
    contact_name: "The Wheatbaker Hotel",
    valid_until: "30 Jun 2026",
    quotation_url: "https://app.orikaliving.com/quotes/q-0008",
  },
  payment_reminder: {
    display_name: "Adaeze Okafor",
    invoice_number: "DFS-INV-0009",
    amount_outstanding: 72500,
    payment_url: "https://app.orikaliving.com/pay/inv-0009",
  },
  partner_reminder: {
    settlement_number: "STL-2026-06",
    body: "This is a friendly reminder that settlement STL-2026-06 of ₦1,250,000 falls due on 20 June 2026. Kindly arrange payment to the usual account.",
  },
  payslip: { display_name: "Funmi Adeyemi", period: "June 2026" },
  scheduled_report: {
    report_name: "Weekly Sales Summary",
    start_date: "05 Jun 2026",
    end_date: "12 Jun 2026",
  },
  campaign_lead_welcome: {
    first_name: "Bola",
    campaign_name: "Orika Living Launch Event",
    shop_url: "https://orikaliving.com/shop",
  },
  walkin_welcome: {
    first_name: "Bola",
    shop_url: "https://orikaliving.com/shop",
    wants_birthday: true,
    birthday_month: 9,
    birthday_day: 14,
  },
  birthday: { first_name: "Bola", shop_url: "https://orikaliving.com/shop" },
  password_reset_otp: { otp: "482913" },
  password_changed: { when: "12 Jun 2026, 09:14" },
};

// ── Render everything ────────────────────────────────────────
const OUT_DIR = path.resolve(__dirname, "..", "documents", "email-previews");
fs.mkdirSync(OUT_DIR, { recursive: true });

const cards = [];
for (const brandKey of Object.keys(BRANDS)) {
  for (const [sampleName, data] of Object.entries(SAMPLES)) {
    const templateName = sampleName === "receipt_sparse" ? "receipt" : sampleName;
    const { subject, html } = renderEmail(templateName, brandKey, data);
    if (html.includes("NaN") || html.includes("undefined")) {
      console.error(`✗ ${brandKey}/${sampleName}: rendered output contains NaN/undefined`);
      process.exitCode = 1;
    }
    const file = `${brandKey}--${sampleName}.html`;
    fs.writeFileSync(path.join(OUT_DIR, file), html);
    cards.push({ brandKey, sampleName, subject, file });
    console.log(`✓ ${brandKey.padEnd(14)} ${sampleName.padEnd(22)} → ${file}`);
  }
}

// ── Gallery: every email at phone + desktop width ────────────
const gallery = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Email previews</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;background:#1f1d1a;color:#eee;margin:0;padding:24px;}
  h1{font-weight:normal;font-size:20px;} h2{font-weight:normal;font-size:15px;color:#c9a86c;margin:34px 0 6px;}
  .subject{font-size:12px;color:#999;margin:0 0 10px;}
  .row{display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;}
  iframe{border:1px solid #444;border-radius:8px;background:#fff;}
  .m{width:375px;height:760px;} .d{width:680px;height:760px;}
  .lbl{font-size:11px;color:#777;margin:4px 0;}
</style></head><body>
<h1>Hub email previews — ${new Date().toISOString().slice(0, 10)}</h1>
${cards
  .map(
    (c) => `<h2>${c.brandKey} · ${c.sampleName}</h2>
<p class="subject">Subject: ${c.subject.replace(/</g, "&lt;")}</p>
<div class="row">
  <div><div class="lbl">375px — mobile</div><iframe class="m" src="${c.file}"></iframe></div>
  <div><div class="lbl">680px — desktop</div><iframe class="d" src="${c.file}"></iframe></div>
</div>`,
  )
  .join("\n")}
</body></html>`;

fs.writeFileSync(path.join(OUT_DIR, "index.html"), gallery);
console.log(`\n${cards.length} previews written to ${OUT_DIR}`);
console.log("Open documents/email-previews/index.html in a browser to review.");
