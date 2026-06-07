"use strict";

const axios = require("axios");
const config = require("../../config/config");

const BASE = config.paystack.baseUrl;
const HEADERS = {
  Authorization: `Bearer ${config.paystack.secretKey}`,
  "Content-Type": "application/json",
};

// Send a charge request to a physical POS terminal
async function sendChargeToTerminal({ terminalId, amount, reference }) {
  const { data } = await axios.post(
    `${BASE}/terminal/${terminalId}/event`,
    {
      type: "transaction",
      action: "process",
      data: {
        id: reference,
        amount: Math.round(amount * 100),
        currency: "NGN",
      },
    },
    { headers: HEADERS },
  );
  return data.data;
}

// Check status of a terminal transaction
async function getTerminalStatus(terminalId, eventId) {
  const { data } = await axios.get(
    `${BASE}/terminal/${terminalId}/event/${eventId}`,
    { headers: HEADERS },
  );
  return data.data; // { delivered, terminal_id }
}

// List all terminals on the Paystack account
async function listTerminals() {
  const { data } = await axios.get(`${BASE}/terminal`, { headers: HEADERS });
  return data.data;
}

module.exports = { sendChargeToTerminal, getTerminalStatus, listTerminals };
