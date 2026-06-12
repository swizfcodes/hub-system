"use strict";

/**
 * integrations/optimus/optimus.service.js
 *
 * Optimus Pay (OnePipe) — Banking-as-a-Service integration.
 * Built on top of api.onepipe.io; all requests share the same
 * auth/signature scheme and request envelope.
 *
 * Endpoint selection: always https://api.onepipe.io unless
 * OPTIMUS_PAY_BASE_URL explicitly points local dev at
 * scripts/optimus-mock-server.js (never set it in production).
 *
 * Key concepts:
 *   - Every request needs a unique `request_ref`
 *   - Signature = MD5( request_ref + ";" + client_secret )
 *   - Sensitive fields in auth.secure are Triple-DES encrypted
 *   - Amounts are in KOBO (multiply naira × 100)
 *   - transaction.mock_mode must match the app's dashboard mode
 *     ("Live" | "Inspect") or the API replies "Request mode not supported"
 */

const axios = require("axios");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const config = require("../../config/config");
const logger = require("../../config/logger");

// ── Cryptographic helpers ─────────────────────────────────────────────────────

/**
 * Compute the HMAC-style request signature.
 * Signature = MD5( "<requestRef>;<clientSecret>" )
 */
function computeSignature(requestRef, clientSecret) {
  return crypto
    .createHash("md5")
    .update(`${requestRef};${clientSecret}`)
    .digest("hex");
}

/**
 * Triple-DES encrypt a plaintext value with the client secret.
 *
 * Key derivation (per Optimus Pay spec):
 *   1. Encode clientSecret as UTF-16LE
 *   2. MD5 hash → 16 bytes
 *   3. Append first 8 bytes → 24-byte 3DES key
 *   4. IV: 8 null bytes
 *   5. Cipher: DES-EDE3-CBC with PKCS5 padding
 *   6. Return Base64 string
 */
function encrypt(clientSecret, plainText) {
  const bufferedKey = Buffer.from(clientSecret, "utf16le");
  const key = crypto.createHash("md5").update(bufferedKey).digest();
  const derivedKey = Buffer.concat([key, key.slice(0, 8)]);
  const iv = Buffer.alloc(8, 0);
  const cipher = crypto
    .createCipheriv("des-ede3-cbc", derivedKey, iv)
    .setAutoPadding(true);
  return cipher.update(plainText, "utf8", "base64") + cipher.final("base64");
}

// ── Request builder ────────────────────────────────────────────────────────────

/**
 * Build per-request auth headers.
 * `request_ref` must be unique per API call — we generate a fresh UUID each
 * time, but callers can pass one in if they need it for idempotency.
 */
function buildHeaders(requestRef) {
  const { apiKey, clientSecret } = config.optimusPay;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    Signature: computeSignature(requestRef, clientSecret),
  };
}

/** Generate a collision-resistant unique ref for a single API call. */
function makeRequestRef(prefix = "hub") {
  return `${prefix}-${uuidv4()}`;
}

/**
 * Fail fast with an actionable message when credentials are absent.
 * Without this the API just answers 401 to "Bearer undefined" and the
 * storefront shows a generic failure with no clue it's an env problem.
 */
function assertConfigured() {
  const { apiKey, clientSecret } = config.optimusPay;
  if (!apiKey || !clientSecret) {
    throw Object.assign(
      new Error(
        "Optimus Pay is not configured: set OPTIMUS_PAY_API_KEY and OPTIMUS_PAY_CLIENT_SECRET in the server .env and restart",
      ),
      { status: 503 },
    );
  }
}

/**
 * Normalize a Nigerian mobile number to the international format the API
 * examples use (0803… → 234803…). Non-digits are stripped; anything that
 * isn't a local 11-digit number is passed through as digits unchanged.
 */
function normalizeMsisdn(mobileNo) {
  const digits = String(mobileNo || "").replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("0")) {
    return `234${digits.slice(1)}`;
  }
  return digits;
}

// ── API: Open Virtual Account ─────────────────────────────────────────────────

/**
 * Create (or retrieve) a virtual bank account for a customer.
 *
 * The account is tied to a specific amount and transaction ref so that when
 * the customer transfers exactly that amount the webhook fires with a
 * matching `transaction_ref`.
 *
 * @param {object} opts
 * @param {number}  opts.amountKobo       - Expected payment in KOBO
 * @param {string}  opts.transactionRef   - Unique per-order ref (e.g. order_id)
 * @param {string}  opts.description      - Human-readable description
 * @param {string}  opts.customerRef      - Your internal customer ID
 * @param {string}  opts.firstname
 * @param {string}  opts.surname
 * @param {string}  opts.email
 * @param {string}  opts.mobileNo         - International format, e.g. 2348012345678
 *
 * Per the OptimusVirtual spec, opening a collection virtual account needs NO
 * customer KYC: the call is authenticated solely by the API key
 * (Authorization header) and the request Signature (derived from the client
 * secret). No BVN is sent.
 *
 * @returns {{ accountNumber, bankName, accountName, bankCode, transactionRef, requestRef }}
 */
async function openVirtualAccount({
  amountKobo,
  transactionRef,
  description,
  customerRef,
  firstname,
  surname,
  email,
  mobileNo,
}) {
  assertConfigured();
  const { baseUrl, notificationUrl, accountName, mockMode } =
    config.optimusPay;
  const requestRef = makeRequestRef("openacct");

  // Name to register on the virtual account. Without it the bank's
  // name-enquiry fails and payers cannot transfer in. Prefer a configured
  // business name; otherwise use the customer's full name.
  const nameOnAccount =
    accountName ||
    [firstname, surname].filter(Boolean).join(" ").trim() ||
    (await require("../../lib/branding").getPlatformBrand()).company_name ||
    "Account";

  const body = {
    request_ref: requestRef,
    request_type: "open_account",
    // Virtual-account ops use the OptimusVirtual provider with no auth
    // payload — there is no BVN/account to encrypt into auth.secure.
    auth: {
      type: null,
      secure: null,
      auth_provider: "OptimusVirtual",
      route_mode: null,
    },
    transaction: {
      // Per the Open Account spec, transaction.amount is 0 — the expected
      // inflow goes in meta.amount. mock_mode "Live" processes real txns.
      mock_mode: mockMode,
      transaction_ref: transactionRef,
      transaction_desc: description,
      transaction_ref_parent: null,
      amount: 0,
      customer: {
        customer_ref: String(customerRef),
        firstname,
        surname,
        email,
        mobile_no: normalizeMsisdn(mobileNo),
      },
      meta: {
        // Expected payment for this account, in kobo (per the integration's
        // kobo convention). Verify against your Optimus account if amounts
        // appear off by 100×.
        amount: amountKobo,
      },
      details: {
        // Account-holder name the bank registers; required for payers'
        // name-enquiry to succeed before they can transfer in.
        name_on_account: nameOnAccount,
        middlename: null,
        dob: null,
        gender: null,
        title: null,
        address_line_1: null,
        address_line_2: null,
        city: null,
        state: null,
        country: null,
        // notification_url is NOT part of the documented open_account
        // schema — the live notification URL is configured on the Optimus
        // dashboard (Transaction Notification service). Only sent to the
        // local/mock server, never to the live API, to keep the live
        // payload exactly spec-shaped.
        ...(baseUrl.includes("api.onepipe.io")
          ? {}
          : { notification_url: notificationUrl }),
      },
    },
  };

  logger.info(
    `[optimus] openVirtualAccount request_ref=${requestRef} txn_ref=${transactionRef}`,
  );

  // OnePipe's transact endpoint is versioned: POST {base}/v2/transact
  // (same path for the mock and production servers).
  let data;
  try {
    ({ data } = await axios.post(`${baseUrl}/v2/transact`, body, {
      headers: buildHeaders(requestRef),
      timeout: 30_000,
    }));
  } catch (err) {
    // Axios throws on 4xx/5xx and its err.message hides the response body —
    // which is where OnePipe explains WHAT was wrong (bad payload field,
    // service not approved, invalid key, etc.). Log it in full.
    const httpStatus = err.response?.status;
    const respBody = err.response?.data;
    logger.error(
      `[optimus] openVirtualAccount HTTP ${httpStatus ?? "no-response"} ` +
        `txn_ref=${transactionRef} provider_says=` +
        `${respBody ? JSON.stringify(respBody).slice(0, 800) : err.message}`,
    );
    const provMsg =
      respBody?.message ||
      respBody?.data?.error?.message ||
      respBody?.data?.error ||
      err.message;
    throw Object.assign(
      new Error(`Optimus Pay open_account failed (HTTP ${httpStatus ?? "?"}): ${provMsg}`),
      { status: 502 },
    );
  }

  // "Duplicate": Optimus rejects similar requests made within a 5-minute
  // window. Surface it distinctly so callers can treat the original request
  // as in-flight rather than failed (e.g. a checkout double-click).
  if (data.status === "Duplicate") {
    logger.warn(
      `[optimus] openVirtualAccount duplicate within 5-min window: txn_ref=${transactionRef}`,
    );
    throw Object.assign(
      new Error(
        "A virtual account request for this order is already in flight. Please wait a moment and retry.",
      ),
      { status: 409, duplicate: true },
    );
  }

  if (data.status !== "Successful") {
    const errMsg =
      (typeof data.data?.error === "object"
        ? data.data?.error?.message
        : data.data?.error) ||
      data.data?.errors?.[0]?.message ||
      data.data?.errors?.[0] ||
      data.message ||
      "Optimus Pay request failed";
    logger.error(
      `[optimus] openVirtualAccount failed status=${data.status}: ${errMsg}`,
    );
    if (/request mode/i.test(String(errMsg))) {
      logger.error(
        `[optimus] OPS HINT: the API rejected mock_mode="${mockMode}". ` +
          `OPTIMUS_PAY_MOCK_MODE must match the app's mode on the Optimus ` +
          `dashboard — a Live app accepts only "Live".`,
      );
    }
    throw Object.assign(new Error(errMsg), { status: 502 });
  }

  // Live API nests the account under data.provider_response; the local mock
  // returns a flat data object. Support both.
  const d = data.data || {};
  const acct = d.provider_response || d;

  // A "Successful" envelope with no account number is useless — fail loudly
  // instead of persisting a null virtual account on the order.
  if (!acct.account_number) {
    logger.error(
      `[optimus] openVirtualAccount returned Successful but no account_number ` +
        `txn_ref=${transactionRef} payload=${JSON.stringify(d).slice(0, 500)}`,
    );
    throw Object.assign(
      new Error("Optimus Pay did not return a virtual account number"),
      { status: 502 },
    );
  }

  // Amount-bound accounts are time-boxed (per spec: expires_in_minutes,
  // observed as 30). Surface it so checkout/invoice UIs can warn the payer.
  const expiresInMinutes =
    parseInt(acct.meta?.expires_in_minutes, 10) || null;

  logger.info(
    `[optimus] virtual account provisioned: ${acct.account_number} ` +
      `txn_ref=${transactionRef} expires_in=${expiresInMinutes ?? "n/a"}min`,
  );

  return {
    accountNumber: acct.account_number,
    bankName: acct.bank_name || "Optimus Bank",
    accountName: acct.account_name || `${firstname} ${surname}`,
    bankCode: acct.bank_code || null,
    expiresInMinutes,
    transactionRef,
    requestRef,
    rawStatus: data.status,
  };
}

// ── API: Query Transaction ────────────────────────────────────────────────────

/**
 * Query the status of a transaction server-to-server.
 * POST {base}/v2/transact/query
 *
 * Used by the webhook handler to verify that a Transaction Notification is
 * genuine before fulfilling anything: notification payloads carry no
 * signature we can check, and our transaction refs are guessable
 * (store-{id}, inv-{id}), so a forged POST to the webhook URL must never be
 * enough to release goods.
 *
 * @param {string} transactionRef - The transaction_ref to look up
 * @param {string} requestType    - Service name the txn belongs to.
 *                                  Inflows on virtual accounts are "collect"
 *                                  per the notification's transaction_type.
 * @returns {{ status, providerResponse, raw }}
 */
async function queryTransaction(transactionRef, requestType = "collect") {
  assertConfigured();
  const { baseUrl } = config.optimusPay;
  const requestRef = makeRequestRef("query");

  const body = {
    request_ref: requestRef,
    request_type: requestType,
    auth: {
      secure: null,
      auth_provider: "OptimusVirtual",
    },
    transaction: {
      transaction_ref: transactionRef,
    },
  };

  let data;
  try {
    ({ data } = await axios.post(`${baseUrl}/v2/transact/query`, body, {
      headers: buildHeaders(requestRef),
      timeout: 30_000,
    }));
  } catch (err) {
    const httpStatus = err.response?.status;
    const respBody = err.response?.data;
    logger.error(
      `[optimus] queryTransaction HTTP ${httpStatus ?? "no-response"} ` +
        `ref=${transactionRef} provider_says=` +
        `${respBody ? JSON.stringify(respBody).slice(0, 800) : err.message}`,
    );
    throw err;
  }

  logger.info(
    `[optimus] queryTransaction ref=${transactionRef} → status=${data.status}`,
  );

  return {
    status: data.status,
    providerResponse: data.data?.provider_response || null,
    raw: data,
  };
}

// ── Utility exports ────────────────────────────────────────────────────────────

module.exports = {
  openVirtualAccount,
  queryTransaction,
  computeSignature,
  encrypt,
  makeRequestRef,
  normalizeMsisdn,
};
