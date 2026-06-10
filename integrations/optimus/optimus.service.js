"use strict";

/**
 * integrations/optimus/optimus.service.js
 *
 * Optimus Pay (OnePipe) — Banking-as-a-Service integration.
 * Built on top of api.onepipe.io; all requests share the same
 * auth/signature scheme and request envelope.
 *
 * Environment toggle (one-line swap):
 *   NODE_ENV=production  → https://api.onepipe.io
 *   otherwise            → mock server (config.optimusPay.baseUrl)
 *
 * Key concepts:
 *   - Every request needs a unique `request_ref`
 *   - Signature = MD5( request_ref + ";" + client_secret )
 *   - Sensitive fields in auth.secure are Triple-DES encrypted
 *   - Amounts are in KOBO (multiply naira × 100)
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
  const { baseUrl, notificationUrl } = config.optimusPay;
  const requestRef = makeRequestRef("openacct");

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
      amount: amountKobo,
      transaction_ref: transactionRef,
      transaction_desc: description,
      customer: {
        customer_ref: customerRef,
        firstname,
        surname,
        email,
        mobile_no: mobileNo,
      },
      meta: {},
      details: {
        notification_url: notificationUrl,
      },
    },
  };

  logger.info(
    `[optimus] openVirtualAccount request_ref=${requestRef} txn_ref=${transactionRef}`,
  );

  // OnePipe's transact endpoint is versioned: POST {base}/v2/transact
  // (same path for the mock and production servers).
  const { data } = await axios.post(`${baseUrl}/v2/transact`, body, {
    headers: buildHeaders(requestRef),
    timeout: 30_000,
  });

  if (data.status === "Failed") {
    const errMsg =
      data.data?.error ||
      data.data?.errors?.[0] ||
      data.message ||
      "Optimus Pay request failed";
    logger.error(`[optimus] openVirtualAccount failed: ${errMsg}`);
    throw Object.assign(new Error(errMsg), { status: 502 });
  }

  // Live API nests the account under data.provider_response; the local mock
  // returns a flat data object. Support both.
  const d = data.data || {};
  const acct = d.provider_response || d;

  logger.info(
    `[optimus] virtual account provisioned: ${acct.account_number} txn_ref=${transactionRef}`,
  );

  return {
    accountNumber: acct.account_number,
    bankName: acct.bank_name || "Optimus Bank",
    accountName: acct.account_name || `${firstname} ${surname}`,
    bankCode: acct.bank_code || null,
    transactionRef,
    requestRef,
    rawStatus: data.status,
  };
}

// ── Utility exports ────────────────────────────────────────────────────────────

module.exports = {
  openVirtualAccount,
  computeSignature,
  encrypt,
  makeRequestRef,
};
