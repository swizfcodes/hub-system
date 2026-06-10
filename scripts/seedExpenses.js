"use strict";

// ============================================================
// Seed real vendor expenses (with invoices + payment history)
//
//   node scripts/seedExpenses.js
//
// Idempotent — safe to run repeatedly (locally or on the live
// server). An expense is skipped if one with the same vendor +
// amount already exists in the target business.
//
// Seeds into the DIFFUSERS (Orika Living) ledger:
//   1. JBS Praxis    — ₦1,500,000  Hub platform (SOW-2026-001)
//        M1 ₦600,000 paid · M2 ₦600,000 paid · M3 ₦300,000 OUTSTANDING
//   2. TheCodeHive   — ₦500,000    orikaliving.com website — PAID IN FULL
//   3. Truehost      — ₦168,000    Cloud VPS 12-month hosting — PAID IN FULL
//
// Invoice PDFs are bundled in seeds/files/ and attached as
// receipts through the documents service (hash-verified storage).
// ============================================================

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool, withBusinessContext } = require("../config/db");

const BUSINESS = process.env.SEED_EXPENSES_BUSINESS || "diffusers";
const FILES_DIR = path.join(__dirname, "..", "seeds", "files");

const SEEDS = [
  {
    vendor_name: "JBS Praxis",
    category: "professional_fees",
    expense_type: "direct_payment",
    amount: 1500000,
    currency: "NGN",
    expense_date: "2026-05-08",
    description:
      "Hub — Custom Business Management Platform (SOW-2026-001, 3 milestones: ₦600k + ₦600k + ₦300k)",
    payments: [
      {
        amount: 600000,
        payment_date: "2026-05-08",
        method: "bank_transfer",
        reference: "INV-2026-106",
        notes: "Milestone 1 of 3 — project commencement (40%)",
      },
      {
        amount: 600000,
        payment_date: "2026-06-01",
        method: "bank_transfer",
        reference: "SOW-2026-001-M2",
        notes: "Milestone 2 of 3 — mid-project demo delivery (40%)",
      },
      // Milestone 3 (₦300,000) intentionally NOT seeded — outstanding.
    ],
    receipt: {
      file: "jbs-praxis-invoice-milestone-1-3.pdf",
      receipt_date: "2026-05-08",
      merchant_name: "JBS Praxis",
      amount_on_receipt: 600000,
    },
  },
  {
    vendor_name: "TheCodeHive",
    category: "professional_fees",
    expense_type: "direct_payment",
    amount: 500000,
    currency: "NGN",
    expense_date: "2026-04-15",
    description:
      "Website development for orikaliving.com — design, frontend, Paystack checkout, SEO, CMS (Invoice ORI-1504-26)",
    payments: [
      {
        amount: 300000,
        payment_date: "2026-04-15",
        method: "bank_transfer",
        reference: "ORI-1504-26",
        notes: "First payment (60%) — before development",
      },
      {
        amount: 200000,
        payment_date: "2026-05-10",
        method: "bank_transfer",
        reference: "ORI-1504-26",
        notes: "Final payment (40%) — site approved, before deployment",
      },
    ],
    receipt: {
      file: "thecodehive-orika-invoice.pdf",
      receipt_date: "2026-04-15",
      merchant_name: "TheCodeHive",
      amount_on_receipt: 500000,
    },
  },
  {
    vendor_name: "Truehost Cloud Nigeria",
    category: "software_subscriptions",
    expense_type: "direct_payment",
    amount: 168000,
    currency: "NGN",
    expense_date: "2026-05-12",
    description:
      "Cloud VPS 2 — www.orikaliving.com hosting, 12 months (12/05/2026 – 11/05/2027), Invoice #501718",
    payments: [
      {
        amount: 168000,
        payment_date: "2026-05-12",
        method: "bank_transfer",
        reference: "Invoice #501718",
        notes: "Annual VPS hosting — paid in full",
      },
    ],
    receipt: {
      file: "truehost-invoice-501718.pdf",
      receipt_date: "2026-05-12",
      merchant_name: "Truehost Cloud Nigeria",
      amount_on_receipt: 168000,
    },
  },
];

async function findOwnerUser() {
  const {
    rows: [owner],
  } = await pool.query(
    `SELECT u.user_id, u.email, ur.role_id
     FROM shared.users u
     JOIN shared.user_roles ur ON ur.user_id = u.user_id
     JOIN shared.roles r ON r.role_id = ur.role_id
     WHERE r.role_name = 'owner' AND u.is_active = true
     ORDER BY u.created_at ASC
     LIMIT 1`,
  );
  if (!owner) {
    throw new Error(
      "No active owner user found — run scripts/createAdmin.js first",
    );
  }
  return owner;
}

async function main() {
  console.log(`\n— Seeding vendor expenses into "${BUSINESS}" —\n`);

  // Standalone scripts must populate the dynamic business cache
  // themselves (server.js does this at boot).
  await require("../config/businesses").loadActiveBusinesses();

  const owner = await findOwnerUser();
  console.log(`  Acting as owner: ${owner.email}`);

  // Required lazily so config/db is initialised first
  const service = require("../modules/expenses/expenses.service");

  let created = 0;
  let skipped = 0;

  for (const seed of SEEDS) {
    // ── Idempotency check ────────────────────────────────
    const exists = await withBusinessContext(BUSINESS, (client) =>
      client
        .query(
          `SELECT expense_id, expense_number, status, amount_paid
           FROM expenses WHERE vendor_name = $1 AND amount = $2 LIMIT 1`,
          [seed.vendor_name, seed.amount],
        )
        .then((r) => r.rows[0] || null),
    );
    if (exists) {
      console.log(
        `  ↷ ${seed.vendor_name} — already seeded as ${exists.expense_number} (${exists.status}), skipping`,
      );
      skipped++;
      continue;
    }

    // ── Create (vendor expense — pending) ────────────────
    const expense = await service.create(BUSINESS, seed, owner);
    console.log(
      `  + ${expense.expense_number}  ${seed.vendor_name}  ₦${Number(seed.amount).toLocaleString()}`,
    );

    // ── Approve ──────────────────────────────────────────
    if (expense.status === "pending") {
      await service.approve(BUSINESS, expense.expense_id, owner);
    }

    // ── Payments (posts journals + rolls up balance) ─────
    for (const p of seed.payments) {
      const after = await service.recordPayment(
        BUSINESS,
        expense.expense_id,
        p,
        owner,
      );
      console.log(
        `      paid ₦${Number(p.amount).toLocaleString()} on ${p.payment_date}` +
          `  → status=${after.status}, balance=₦${Number(after.balance).toLocaleString()}`,
      );
    }

    // ── Receipt (invoice PDF) ────────────────────────────
    const filePath = path.join(FILES_DIR, seed.receipt.file);
    if (fs.existsSync(filePath)) {
      await service.addReceipt(
        BUSINESS,
        expense.expense_id,
        {
          buffer: fs.readFileSync(filePath),
          originalname: seed.receipt.file,
          mimetype: "application/pdf",
        },
        seed.receipt,
        owner,
      );
      console.log(`      receipt attached: ${seed.receipt.file}`);
    } else {
      console.warn(
        `      ! receipt file missing: seeds/files/${seed.receipt.file} — skipped`,
      );
    }

    created++;
  }

  console.log(`\n— Done: ${created} created, ${skipped} skipped —\n`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("\nSeed failed:", err.message);
    console.error(err.stack);
    pool.end().finally(() => process.exit(1));
  });
