"use strict";

const axios = require("axios");
const config = require("../../config/config");
const logger = require("../../config/logger");

const BASE = config.paystack.baseUrl;
const HEADERS = {
  Authorization: `Bearer ${config.paystack.secretKey}`,
  "Content-Type": "application/json",
};

// Initialize a payment link (for invoice online payment)
async function initializePayment({
  email,
  amount,
  reference,
  callbackUrl,
  metadata = {},
}) {
  const { data } = await axios.post(
    `${BASE}/transaction/initialize`,
    {
      email,
      amount: Math.round(amount * 100), // Paystack uses kobo
      reference,
      callback_url: callbackUrl,
      metadata,
    },
    { headers: HEADERS },
  );

  return {
    authorizationUrl: data.data.authorization_url,
    accessCode: data.data.access_code,
    reference: data.data.reference,
  };
}

// Verify a payment by reference
async function verifyPayment(reference) {
  const { data } = await axios.get(`${BASE}/transaction/verify/${reference}`, {
    headers: HEADERS,
  });
  return {
    status: data.data.status, // 'success' | 'failed' | 'abandoned'
    amount: data.data.amount / 100,
    currency: data.data.currency,
    paidAt: data.data.paid_at,
    channel: data.data.channel,
    reference: data.data.reference,
    customer: data.data.customer,
  };
}

// Create a transfer recipient (for payouts to retail partners / staff)
async function createRecipient({ name, accountNumber, bankCode }) {
  const { data } = await axios.post(
    `${BASE}/transferrecipient`,
    {
      type: "nuban",
      name,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: "NGN",
    },
    { headers: HEADERS },
  );
  return data.data.recipient_code;
}

// Initiate a bank transfer payout
async function sendTransfer({ recipientCode, amount, reference, reason }) {
  const { data } = await axios.post(
    `${BASE}/transfer`,
    {
      source: "balance",
      amount: Math.round(amount * 100),
      recipient: recipientCode,
      reference,
      reason,
    },
    { headers: HEADERS },
  );
  return data.data;
}

// List Nigerian banks (for bank selection UI)
async function listBanks() {
  const { data } = await axios.get(`${BASE}/bank?currency=NGN`, {
    headers: HEADERS,
  });
  return data.data.map((b) => ({ name: b.name, code: b.code, slug: b.slug }));
}

// Resolve account number to account name (for verification)
async function resolveAccount(accountNumber, bankCode) {
  const { data } = await axios.get(
    `${BASE}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
    { headers: HEADERS },
  );
  return {
    accountName: data.data.account_name,
    accountNumber: data.data.account_number,
  };
}

module.exports = {
  initializePayment,
  verifyPayment,
  createRecipient,
  sendTransfer,
  listBanks,
  resolveAccount,
};
