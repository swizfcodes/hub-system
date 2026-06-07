"use strict";

const axios = require("axios");
const config = require("../../../config/config");
const logger = require("../../../config/logger");

const GRAPH_URL = "https://graph.facebook.com/v18.0";
const TOKEN = config.meta.accessToken;

function parseInbound(messaging) {
  const msg = messaging?.message;
  const sender = messaging?.sender;
  if (!msg || !sender) return null;

  return {
    externalRef: msg.mid,
    senderId: sender.id,
    senderPhone: null,
    senderName: null, // Instagram doesn't send name in webhook — fetch separately if needed
    text: msg.text || "",
    attachments: msg.attachments || [],
  };
}

async function sendMessage({ recipientId, text }) {
  try {
    await axios.post(
      `${GRAPH_URL}/me/messages`,
      { recipient: { id: recipientId }, message: { text } },
      { params: { access_token: TOKEN } },
    );
  } catch (err) {
    logger.error("Instagram DM send error", err.response?.data || err.message);
    throw err;
  }
}

module.exports = { parseInbound, sendMessage };
