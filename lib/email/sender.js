"use strict";

const nodemailer = require("nodemailer");
const config = require("../../config/config");
const logger = require("../../config/logger");
const signature = require("./signature");

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

/**
 * Resolve the "From" header for an email.
 *
 * Priority:
 *   1. Explicit `from` override passed by the caller.
 *   2. Per-brand sender (config.smtp.brands[business]) when `business`
 *      is supplied — mirrors the WhatsApp per-brand pattern.
 *   3. Global default (config.smtp.fromName / fromEmail).
 *
 * @param {string} [from]      Explicit override
 * @param {string} [business]  Brand key (e.g. "jewelry", "diffusers")
 * @returns {string}
 */
function resolveFrom(from, business) {
  const brand = business && config.smtp.brands?.[business];
  // Sender display name: explicit env override → the business's
  // display_name from business_config → the deployment-wide default.
  const { businessLabel } = require("../branding");
  const name =
    brand?.fromName ||
    (business && businessLabel(business)) ||
    config.smtp.fromName;
  const email = brand?.fromEmail || config.smtp.fromEmail;
  // A bare display name (no @) is NOT a valid From header — Gmail
  // silently drops mail sent as `From: Orika Hub`. Campaigns pass
  // from_name this way, so pair it with the configured address.
  if (from && from.includes("@")) return from;
  if (from) return `"${from.replace(/"/g, "'")}" <${email}>`;
  return `"${name}" <${email}>`;
}

/**
 * Send an email.
 *
 * If `senderUserId` and `senderBusiness` are provided, the staff
 * member's stored signature is auto-appended to the HTML body — this
 * is the Module 12 promise that every outbound staff email carries
 * the personalised branded signature.
 *
 * If omitted (e.g. system emails like password resets), no signature
 * is appended.
 *
 * @param {Object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {Array}  [opts.attachments]
 * @param {string} [opts.from]
 * @param {string} [opts.replyTo]
 * @param {string} [opts.business]       brand key for per-brand sender
 * @param {string} [opts.senderUserId]   triggers signature append
 * @param {string} [opts.senderBusiness] triggers signature append
 */
async function sendEmail({
  to,
  subject,
  html,
  attachments = [],
  from,
  replyTo,
  business,
  senderUserId,
  senderBusiness,
}) {
  // Auto-append signature if we know who's sending and from which business.
  // Failures inside appendToHTML are swallowed there — we never want a
  // missing signature to prevent the email from going out.
  let finalHtml = html;
  if (senderUserId && senderBusiness) {
    finalHtml = await signature.appendToHTML(
      html,
      senderUserId,
      senderBusiness,
    );
  }

  const mail = {
    from: resolveFrom(from, business || senderBusiness),
    to,
    subject,
    html: finalHtml,
    attachments,
    replyTo,
  };

  try {
    const info = await transporter.sendMail(mail);
    logger.debug(`Email sent to ${to}: ${info.messageId}`);
    await logToEmailLog({
      to,
      subject,
      business: business || senderBusiness,
      senderUserId: senderUserId,
      status: "sent",
    });
    return info;
  } catch (err) {
    logger.error(`Email failed to ${to}`, err);
    await logToEmailLog({
      to,
      subject,
      business: business || senderBusiness,
      senderUserId: senderUserId,
      status: "failed",
      error: err.message,
    });
    throw err;
  }
}

/**
 * Best-effort audit row in shared.email_log — surfaced in the Messaging
 * UI's "Emails" tab. A logging failure must never block or fail a send.
 */
async function logToEmailLog({
  to,
  subject,
  business,
  senderUserId,
  status,
  error,
}) {
  try {
    const { pool } = require("../../config/db");
    await pool.query(
      `INSERT INTO shared.email_log
         (recipient, subject, business, sender_user_id, status, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        String(to),
        subject || null,
        business || null,
        senderUserId || null,
        status,
        error || null,
      ],
    );
  } catch (logErr) {
    logger.warn(`email_log insert failed: ${logErr.message}`);
  }
}

async function sendWithAttachment({
  to,
  subject,
  html,
  filename,
  pdfBuffer,
  from,
  business,
  senderUserId,
  senderBusiness,
}) {
  return sendEmail({
    to,
    subject,
    html,
    from,
    business,
    senderUserId,
    senderBusiness,
    attachments: [
      { filename, content: pdfBuffer, contentType: "application/pdf" },
    ],
  });
}

module.exports = { sendEmail, sendWithAttachment };
