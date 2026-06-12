"use strict";

/**
 * scripts/optimus-smoke-test.js
 *
 * One-shot live verification of the Optimus Pay integration. Reads the same
 * .env/config the API server uses, provisions ONE dynamic virtual account
 * (auto-expires ~30 min, no funds move), and prints a pass/fail diagnosis.
 *
 * Run on the server after updating the Optimus section of .env:
 *
 *   NODE_ENV=production node scripts/optimus-smoke-test.js
 *   NODE_ENV=production node scripts/optimus-smoke-test.js --naira 250
 *
 * Expected on success: an Optimus Bank account number + 30-minute expiry.
 * Transfer the exact amount to it if you also want to verify the webhook
 * leg end-to-end (watch logs/error.log and shared.webhook_log).
 */

const config = require("../config/config");
const optimus = require("../integrations/optimus/optimus.service");

const args = process.argv.slice(2);
const nairaFlag = args.indexOf("--naira");
const naira = nairaFlag !== -1 ? Number(args[nairaFlag + 1]) : 100;

function mask(s) {
  if (!s) return "(NOT SET)";
  return s.length <= 8 ? "****" : `${s.slice(0, 6)}…${s.slice(-4)}`;
}

(async () => {
  const { apiKey, clientSecret, baseUrl, mockMode, accountName } =
    config.optimusPay;

  console.log("── Optimus Pay smoke test ─────────────────────────");
  console.log(`  base URL     : ${baseUrl}`);
  console.log(`  mock_mode    : ${mockMode}`);
  console.log(`  api key      : ${mask(apiKey)}`);
  console.log(`  secret       : ${mask(clientSecret)}`);
  console.log(`  account name : ${accountName || "(per-customer fallback)"}`);
  console.log(`  amount       : ₦${naira} (${Math.round(naira * 100)} kobo)`);
  console.log("───────────────────────────────────────────────────");

  if (baseUrl !== "https://api.onepipe.io") {
    console.warn(
      "  ⚠ base URL is overridden — this is NOT testing the live API",
    );
  }

  const transactionRef = `smoke-${Date.now()}`;
  try {
    const result = await optimus.openVirtualAccount({
      amountKobo: Math.round(naira * 100),
      transactionRef,
      description: "Integration smoke test — safe to ignore",
      customerRef: "smoke-test",
      firstname: "Smoke",
      surname: "Test",
      email: "smoke-test@orikaliving.com",
      mobileNo: "2348000000000",
    });
    console.log("\n✅ PASS — virtual account provisioned:");
    console.log(`  account number : ${result.accountNumber}`);
    console.log(`  bank           : ${result.bankName}`);
    console.log(`  account name   : ${result.accountName}`);
    console.log(`  expires in     : ${result.expiresInMinutes ?? "?"} min`);
    console.log(`  transaction ref: ${result.transactionRef}`);
    console.log(
      "\nOptional: transfer the exact amount to it to verify the webhook leg,",
    );
    console.log(
      "then check shared.webhook_log and the order/payment confirmation.",
    );
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ FAIL — ${err.message}`);
    const m = String(err.message);
    if (/request mode/i.test(m)) {
      console.error(
        "  → OPTIMUS_PAY_MOCK_MODE must match the app's mode on the Optimus dashboard (Live).",
      );
    } else if (/401/.test(m) || /unauthoriz/i.test(m) || /invalid.*key/i.test(m)) {
      console.error(
        "  → Check OPTIMUS_PAY_API_KEY / OPTIMUS_PAY_CLIENT_SECRET (exact copy, no spaces),",
      );
      console.error(
        "    and that Open Account + Transaction Notification are APPROVED on the dashboard.",
      );
    } else if (/not configured/i.test(m)) {
      console.error("  → Add the Optimus section to .env and re-run.");
    } else if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(m)) {
      console.error("  → Network problem reaching the API from this server.");
    }
    process.exit(1);
  }
})();
