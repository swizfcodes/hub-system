"use strict";

// SMTP adapter — wraps lib/email/sender with message-channel awareness
// Used by Smartcomm when channel type is 'email'
const { sendEmail } = require("../../../lib/email/sender");
const logger = require("../../../config/logger");

async function sendChannelMessage({
  to,
  subject,
  html,
  from,
  attachments = [],
  business,
}) {
  try {
    const info = await sendEmail({ to, subject, html, from, attachments, business });
    return { messageId: info.messageId, delivered: true };
  } catch (err) {
    logger.error(`SMTP channel message failed to ${to}`, err);
    throw err;
  }
}

// Parse inbound email webhook (e.g. from Mailgun/SendGrid inbound routing)
function parseInbound(payload) {
  return {
    externalRef: payload["Message-Id"] || payload.messageId,
    senderId: payload.sender || payload.from,
    senderPhone: null,
    senderName: payload.from_name || null,
    text: payload["body-plain"] || payload.text || "",
    subject: payload.subject || "",
  };
}

module.exports = { sendChannelMessage, parseInbound };
