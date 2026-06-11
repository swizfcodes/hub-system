"use strict";

/**
 * scripts/optimus-mock-server.js
 *
 * Local stand-in for OnePipe / Optimus Pay so the storefront flow
 *   checkout → virtual account → "paid" → redirect
 * can be tested end-to-end on your own machine, with no real bank and
 * no real money. Replaces the dead Postman mock URL.
 *
 * ── Run ────────────────────────────────────────────────────────────
 *   node scripts/optimus-mock-server.js
 *
 * Then in the hub's .env.local point Optimus at it and restart the hub:
 *   OPTIMUS_PAY_BASE_URL=http://localhost:7100
 *
 * ── What it does ───────────────────────────────────────────────────
 *   POST /v2/transact   → returns a Successful open_account response
 *                         with a fake virtual account. By default it
 *                         then AUTO-FIRES the confirmation webhook a few
 *                         seconds later, simulating the customer's bank
 *                         transfer landing — the storefront poll picks
 *                         it up and redirects to the order page.
 *   POST /pay/:ref      → fire the confirmation webhook on demand for a
 *                         given transaction_ref (e.g. store-<orderId>).
 *   GET  /              → tiny help page.
 *
 * ── Knobs (env) ────────────────────────────────────────────────────
 *   OPTIMUS_MOCK_PORT     default 7100
 *   HUB_WEBHOOK_URL       default http://localhost:7000/api/webhooks/optimus
 *   OPTIMUS_MOCK_AUTOPAY  seconds before auto-confirm; 0 disables (default 8)
 *
 * Uses express + axios, both already in the hub's node_modules.
 */

const express = require("express");
const axios = require("axios");

const PORT = Number(process.env.OPTIMUS_MOCK_PORT || 7100);
const HUB_WEBHOOK_URL =
  process.env.HUB_WEBHOOK_URL ||
  "http://localhost:7000/api/webhooks/optimus";
const AUTO_CONFIRM_SECONDS = Number(process.env.OPTIMUS_MOCK_AUTOPAY ?? 8);

const app = express();
app.use(express.json());

// transaction_ref → { amount, accountNumber } so a later webhook is realistic.
const provisioned = new Map();

function fireWebhook(ref) {
  const info = provisioned.get(ref);
  if (!info) return Promise.reject(new Error(`unknown transaction_ref ${ref}`));

  // Matches what integrations/optimus/optimus.webhook.js expects:
  // status "Successful" + data.provider_response_code "00" + transaction_ref.
  const payload = {
    status: "Successful",
    message: "Transaction Notification",
    data: {
      provider: "Optimus",
      provider_response_code: "00",
      transaction_ref: ref,
      amount: info.amount, // kobo
      account_number: info.accountNumber,
    },
  };
  return axios.post(HUB_WEBHOOK_URL, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 15000,
  });
}

// ── Open virtual account ────────────────────────────────────────────
app.post("/v2/transact", (req, res) => {
  const txn = (req.body && req.body.transaction) || {};
  const ref = txn.transaction_ref || `mock-${Date.now()}`;
  // Open Account puts the expected amount in meta.amount (transaction.amount
  // is 0); fall back to transaction.amount for older callers.
  const expectedAmount = txn.meta?.amount ?? txn.amount ?? 0;
  const accountNumber =
    "99" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

  provisioned.set(ref, { amount: expectedAmount, accountNumber });
  console.log(
    `[optimus-mock] open_account ref=${ref} amount=${expectedAmount} kobo → acct ${accountNumber}`,
  );

  if (AUTO_CONFIRM_SECONDS > 0) {
    setTimeout(() => {
      fireWebhook(ref)
        .then(() => console.log(`[optimus-mock] auto-confirmed ref=${ref}`))
        .catch((e) =>
          console.error(
            `[optimus-mock] webhook failed ref=${ref}: ${e.message}`,
          ),
        );
    }, AUTO_CONFIRM_SECONDS * 1000);
  }

  // Mirror the live OptimusVirtual shape: account details nested under
  // data.provider_response.
  res.json({
    status: "Successful",
    message: "Request processed successfully",
    data: {
      provider: "OptimusVirtual",
      provider_response_code: "00",
      errors: null,
      error: null,
      provider_response: {
        reference: ref,
        account_number: accountNumber,
        account_reference: ref,
        account_name: `ORIKA LIVING / ${txn.customer?.firstname || "Customer"}`,
        currency: "NGN",
        bank_name: "Optimus Bank (Mock)",
        bank_code: "107",
        account_type: "VIRTUAL",
        status: "ACTIVE",
      },
    },
  });
});

// ── Manually confirm a transfer ─────────────────────────────────────
app.post("/pay/:ref", async (req, res) => {
  try {
    await fireWebhook(req.params.ref);
    res.json({ ok: true, fired: req.params.ref });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

app.get("/", (_req, res) =>
  res
    .type("text")
    .send(
      "Optimus Pay mock\n" +
        "  POST /v2/transact   open a virtual account\n" +
        "  POST /pay/:ref      confirm a transfer (transaction_ref)\n",
    ),
);

app.listen(PORT, () => {
  console.log(`[optimus-mock] listening on http://localhost:${PORT}`);
  console.log(`[optimus-mock] webhooks → ${HUB_WEBHOOK_URL}`);
  console.log(
    `[optimus-mock] auto-confirm: ${
      AUTO_CONFIRM_SECONDS > 0 ? AUTO_CONFIRM_SECONDS + "s" : "off"
    }`,
  );
});
