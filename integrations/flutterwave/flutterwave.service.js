"use strict";

const axios = require("axios");
const config = require("../../config/config");
const logger = require("../../config/logger");

const BASE = config.flutterwave.baseUrl;
const HEADERS = {
  Authorization: `Bearer ${config.flutterwave.secretKey}`,
  "Content-Type": "application/json",
};

async function initializePayment({
  email,
  amount,
  reference,
  callbackUrl,
  currency = "NGN",
  name,
  phone,
}) {
  const { data } = await axios.post(
    `${BASE}/payments`,
    {
      tx_ref: reference,
      amount,
      currency,
      redirect_url: callbackUrl,
      customer: { email, name, phonenumber: phone },
      customizations: {
        title: `${(await require("../../lib/branding").getPlatformBrand()).product_name} Payment`,
      },
    },
    { headers: HEADERS },
  );
  return { paymentLink: data.data.link, reference };
}

async function verifyPayment(transactionId) {
  const { data } = await axios.get(
    `${BASE}/transactions/${transactionId}/verify`,
    { headers: HEADERS },
  );
  return {
    status: data.data.status,
    amount: data.data.amount,
    currency: data.data.currency,
    reference: data.data.tx_ref,
    flwRef: data.data.flw_ref,
    paidAt: data.data.created_at,
  };
}

async function initiateTransfer({
  accountNumber,
  bankCode,
  amount,
  reference,
  narration,
  currency = "NGN",
}) {
  const { data } = await axios.post(
    `${BASE}/transfers`,
    {
      account_bank: bankCode,
      account_number: accountNumber,
      amount,
      currency,
      narration,
      reference,
    },
    { headers: HEADERS },
  );
  return data.data;
}

module.exports = { initializePayment, verifyPayment, initiateTransfer };
