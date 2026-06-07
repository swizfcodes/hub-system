"use strict";

const axios = require("axios");
const config = require("../../../config/config");
const logger = require("../../../config/logger");

// Resolve the WhatsApp phone-number id for the calling business. Falls
// back to the legacy single phoneNumberId so callers that don't pass a
// `business` keep working.
function resolvePhoneId(business) {
  const numbers = config.whatsapp.phoneNumbers || {};
  return (
    numbers[business] ||
    config.whatsapp.phoneNumberId ||
    numbers.jewelry ||
    numbers.diffusers
  );
}
function baseFor(business) {
  return `${config.whatsapp.baseUrl}/${resolvePhoneId(business)}`;
}
const HEADERS = {
  Authorization: `Bearer ${config.whatsapp.apiToken}`,
  "Content-Type": "application/json",
};

function parseInbound(change) {
  const msg = change?.value?.messages?.[0];
  const contact = change?.value?.contacts?.[0];
  if (!msg) return null;

  return {
    externalRef: msg.id,
    senderId: msg.from,
    senderPhone: msg.from,
    senderName: contact?.profile?.name || msg.from,
    text: msg.text?.body || "",
    timestamp: msg.timestamp,
    type: msg.type,
  };
}

async function sendMessage({ to, text, business }) {
  try {
    await axios.post(
      `${baseFor(business)}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      },
      { headers: HEADERS },
    );
  } catch (err) {
    logger.error("WhatsApp send error", err.response?.data || err.message);
    throw err;
  }
}

async function sendTemplate({
  to,
  templateName,
  languageCode = "en",
  components = [],
  business,
}) {
  await axios.post(
    `${baseFor(business)}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    },
    { headers: HEADERS },
  );
}

async function sendDocument({ to, documentUrl, filename, caption, business }) {
  await axios.post(
    `${baseFor(business)}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: { link: documentUrl, filename, caption },
    },
    { headers: HEADERS },
  );
}

module.exports = { parseInbound, sendMessage, sendTemplate, sendDocument };
