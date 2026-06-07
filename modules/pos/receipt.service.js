"use strict";

const { renderToPDF } = require("../../lib/pdf/generator");
const { sendEmail, sendWithAttachment } = require("../../lib/email/sender");
const { renderEmail } = require("../../lib/email/render");
const whatsapp = require("../../integrations/messaging/adapters/whatsapp");
const auditService = require("../../shared/audit/audit.service");
const logger = require("../../config/logger");
const repo = require("./pos.repository");

// ─────────────────────────────────────────────────────────────
// RECEIPT SUB-SERVICE
//
// Receipt generation and delivery for POS transactions. Two distinct
// concerns handled here:
//
//   1. Rendering — turn a pos_transaction row + its lines + payment
//      splits into either an HTML body (for email/screen) or a PDF
//      buffer (for attachment).
//
//   2. Delivery — send via WhatsApp (preferred — cheap, immediate, and
//      what Nigerian customers expect), email (with PDF attachment),
//      or both. Failures are logged but do not roll back the sale.
//
// pos.service.sendReceipt is currently a stub that does an inline
// WhatsApp message. This sub-service replaces it with proper HTML/PDF
// rendering and multi-channel delivery, while keeping the same
// invocation pattern.
// ─────────────────────────────────────────────────────────────

const VALID_CHANNELS = ["whatsapp", "email", "both"];
const RECEIPT_TEMPLATE = "pos-receipt"; // looked up under /templates/pos-receipt/index.html
const FALLBACK_HTML_TEMPLATE = buildInlineTemplate();

/**
 * Public entrypoint — sends a receipt for a completed transaction via
 * the requested channel. Channel auto-picks if 'auto':
 *   - WhatsApp number on contact → WhatsApp
 *   - else email on contact → email
 *   - else no contact → returns { sent: false, reason: 'no_contact_method' }
 *
 * @param {string} business
 * @param {string} transactionId
 * @param {Object} options
 * @param {string} [options.channel] 'whatsapp' | 'email' | 'both' | 'auto'
 * @param {string} [options.overrideTo] explicit destination — overrides
 *                                       the contact's stored method
 * @param {Object} user                  acting user (for audit log)
 */
async function sendReceipt(
  business,
  transactionId,
  { channel = "auto", overrideTo } = {},
  user,
) {
  if (channel !== "auto" && !VALID_CHANNELS.includes(channel)) {
    throw Object.assign(
      new Error(
        `Invalid channel — must be one of ${VALID_CHANNELS.join(", ")}, or 'auto'`,
      ),
      { status: 400 },
    );
  }

  const tx = await fetchTransactionForReceipt(business, transactionId);
  if (!tx) {
    throw Object.assign(new Error("Transaction not found"), { status: 404 });
  }
  if (tx.status !== "completed") {
    throw Object.assign(
      new Error(`Cannot send receipt — transaction status is ${tx.status}`),
      { status: 400 },
    );
  }

  // Resolve auto channel.
  if (channel === "auto") {
    if (tx.whatsapp_number || tx.primary_phone) channel = "whatsapp";
    else if (tx.email) channel = "email";
    else {
      return { sent: false, reason: "no_contact_method" };
    }
  }

  const results = {};

  if (channel === "whatsapp" || channel === "both") {
    results.whatsapp = await sendViaWhatsApp(tx, overrideTo);
  }
  if (channel === "email" || channel === "both") {
    results.email = await sendViaEmail(business, tx, overrideTo);
  }

  await auditAttempt(business, transactionId, user, channel, results);

  return {
    sent: Object.values(results).some((r) => r.success),
    transaction_id: transactionId,
    channel,
    results,
  };
}

// ─────────────────────────────────────────────────────────────
// CHANNEL: WHATSAPP
// Sends a text message with the totals + change. No PDF — WhatsApp
// is for fast confirmation, not formal records.
// ─────────────────────────────────────────────────────────────

async function sendViaWhatsApp(tx, overrideTo) {
  const to = overrideTo || tx.whatsapp_number || tx.primary_phone;
  if (!to) {
    return { success: false, reason: "no_phone_number" };
  }
  try {
    const body = formatWhatsAppMessage(tx);
    await whatsapp.sendMessage({ to, text: body });
    return { success: true, channel: "whatsapp", recipient: to };
  } catch (err) {
    logger.error(
      `Receipt WhatsApp send failed for tx ${tx.transaction_id}: ${err.message}`,
    );
    return { success: false, reason: err.message };
  }
}

function formatWhatsAppMessage(tx) {
  const total = formatCurrency(tx.total_amount);
  const change = formatCurrency(tx.change_given);
  // M7 fix: show all items with per-line price and total
  const itemLine = (tx.lines || [])
    .map((l) => `  • ${l.description} ×${l.quantity} @ ${formatCurrency(l.unit_price)} = ${formatCurrency(l.line_total)}`)
    .join("\n");

  return [
    `Receipt ${tx.transaction_number}`,
    "",
    itemLine,
    "",
    `Total: ${total}`,
    parseFloat(tx.change_given || 0) > 0 ? `Change: ${change}` : null,
    "",
    "Thank you for your purchase!",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─────────────────────────────────────────────────────────────
// CHANNEL: EMAIL
// Renders a PDF receipt and attaches it. Body of the email is a short
// HTML message — the PDF is the actual record.
// ─────────────────────────────────────────────────────────────

async function sendViaEmail(business, tx, overrideTo) {
  const to = overrideTo || tx.email;
  if (!to) {
    return { success: false, reason: "no_email_address" };
  }
  try {
    const pdf = await generateReceiptPDF(business, tx);
    const { subject: subj, html: body } = renderEmail("receipt", business, {
      contact_name: tx.contact_name,
      transaction_number: tx.transaction_number,
      total_amount: tx.total_amount,
    });
    await sendWithAttachment({
      to,
      subject: subj,
      html: body,
      filename: `${tx.transaction_number}.pdf`,
      pdfBuffer: pdf,
      business,
    });
    return { success: true, channel: "email", recipient: to };
  } catch (err) {
    logger.error(
      `Receipt email send failed for tx ${tx.transaction_id}: ${err.message}`,
    );
    return { success: false, reason: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// PDF GENERATION
//
// Tries the templates/pos-receipt/ folder first (so the design team
// can theme it per business line via business_config). Falls back to
// a built-in inline template so a missing template file never breaks
// a sale.
// ─────────────────────────────────────────────────────────────

async function generateReceiptPDF(business, tx) {
  try {
    const data = buildTemplateData(business, tx);
    return await renderToPDF(RECEIPT_TEMPLATE, data);
  } catch (err) {
    // Template file missing or render failure — fall back to inline HTML.
    logger.warn(
      `Receipt template render failed (${err.message}) — using inline fallback`,
    );
    return renderInlineFallbackPDF(business, tx);
  }
}

function buildTemplateData(business, tx) {
  const lines = (tx.lines || []).map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unit_price: formatCurrency(l.unit_price),
    line_total: formatCurrency(l.line_total),
  }));

  // Pre-render lines array → HTML rows for the template
  const linesHtml = lines
    .map(
      (l, i) => `
    <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
      <td class="c-desc">${escapeHtml(l.description)}</td>
      <td class="c-qty">${l.quantity}</td>
      <td class="c-price">${l.unit_price}</td>
      <td class="c-total">${l.line_total}</td>
    </tr>`,
    )
    .join("");

  const showDiscount = parseFloat(tx.discount_total || 0) > 0;
  const showChange = parseFloat(tx.change_given || 0) > 0;

  return {
    business: escapeHtml(business.toUpperCase()),
    transaction_number: escapeHtml(tx.transaction_number),
    transaction_date: formatDate(tx.created_at),
    contact_name: escapeHtml(tx.contact_name || "Walk-in Customer"),
    lines_html: linesHtml,
    subtotal: formatCurrency(tx.subtotal),
    discount_total: formatCurrency(tx.discount_total),
    vat_amount: formatCurrency(tx.vat_amount),
    total_amount: formatCurrency(tx.total_amount),
    amount_paid: formatCurrency(tx.amount_paid),
    change_given: formatCurrency(tx.change_given),
    payments: (tx.payments || [])
      .map(
        (p) =>
          `${labelForMethod(p.payment_method)}: ${formatCurrency(p.amount)}`,
      )
      .join(" • "),
    discount_row_style: showDiscount ? "" : "display:none",
    change_row_style: showChange ? "" : "display:none",
  };
}

/**
 * Builds a minimal but presentable receipt PDF entirely from inline HTML.
 * Used when the customisable template isn't on disk. Keeps the build
 * usable from day one — the design team can replace it later.
 */
// H1 fix: reuse a shared browser instance instead of launching per receipt
let _sharedBrowser = null;
async function getSharedBrowser() {
  if (_sharedBrowser && _sharedBrowser.isConnected()) return _sharedBrowser;
  const puppeteer = require("puppeteer");
  _sharedBrowser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  _sharedBrowser.on("disconnected", () => { _sharedBrowser = null; });
  return _sharedBrowser;
}

async function renderInlineFallbackPDF(business, tx) {
  const html = FALLBACK_HTML_TEMPLATE(business, tx);
  const browser = await getSharedBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A5",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });
    return pdf;
  } finally {
    await page.close();
  }
}

function buildInlineTemplate() {
  return (business, tx) => {
    const linesHtml = (tx.lines || [])
      .map(
        (l) => `
          <tr>
            <td>${escapeHtml(l.description)}</td>
            <td style="text-align:center">${l.quantity}</td>
            <td style="text-align:right">${formatCurrency(l.unit_price)}</td>
            <td style="text-align:right">${formatCurrency(l.line_total)}</td>
          </tr>`,
      )
      .join("");
    const paymentsHtml = (tx.payments || [])
      .map(
        (p) =>
          `<div>${labelForMethod(p.payment_method)}: ${formatCurrency(p.amount)}</div>`,
      )
      .join("");

    return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111; font-size: 12px; }
  h1 { font-size: 16px; margin: 0 0 4px 0; letter-spacing: 1px; }
  .meta { color: #555; font-size: 11px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th { text-align: left; border-bottom: 1px solid #ccc; padding: 4px 2px; font-size: 11px; color: #555; font-weight: 500; }
  td { padding: 4px 2px; vertical-align: top; }
  .totals { margin-top: 12px; border-top: 1px solid #ccc; padding-top: 8px; }
  .totals div { display: flex; justify-content: space-between; padding: 2px 0; }
  .totals .grand { font-weight: 700; font-size: 13px; border-top: 1px solid #111; margin-top: 4px; padding-top: 4px; }
  .payments { margin-top: 12px; font-size: 11px; color: #333; }
  .footer { margin-top: 20px; text-align: center; font-size: 10px; color: #777; }
</style></head>
<body>
  <h1>${escapeHtml(business.toUpperCase())}</h1>
  <div class="meta">
    Receipt ${escapeHtml(tx.transaction_number)}<br>
    ${formatDate(tx.created_at)}<br>
    Customer: ${escapeHtml(tx.contact_name || "Walk-in")}
  </div>

  <table>
    <thead>
      <tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr>
    </thead>
    <tbody>${linesHtml}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${formatCurrency(tx.subtotal)}</span></div>
    ${
      parseFloat(tx.discount_total || 0) > 0
        ? `<div><span>Discount</span><span>− ${formatCurrency(tx.discount_total)}</span></div>`
        : ""
    }
    <div><span>VAT${tx.vat_rate ? ` (${(tx.vat_rate * 100).toFixed(1)}%)` : ""}</span><span>${formatCurrency(tx.vat_amount)}</span></div>
    <div class="grand"><span>Total</span><span>${formatCurrency(tx.total_amount)}</span></div>
    <div><span>Paid</span><span>${formatCurrency(tx.amount_paid)}</span></div>
    ${
      parseFloat(tx.change_given || 0) > 0
        ? `<div><span>Change</span><span>${formatCurrency(tx.change_given)}</span></div>`
        : ""
    }
  </div>

  <div class="payments">${paymentsHtml}</div>

  <div class="footer">
    Thank you for your purchase.<br>
    Powered by Hub
  </div>
</body></html>`;
  };
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

async function fetchTransactionForReceipt(business, transactionId) {
  const { withBusinessContext } = require("../../config/db");
  return withBusinessContext(business, (client) =>
    repo.findTransactionById(client, transactionId),
  );
}

async function auditAttempt(business, transactionId, user, channel, results) {
  const { withBusinessContext } = require("../../config/db");
  return withBusinessContext(business, (client) =>
    auditService.log(client, {
      userId: user?.user_id || null,
      userName: user?.display_name || "system",
      business,
      module: "pos",
      action: "send_receipt",
      table: "pos_transactions",
      recordId: transactionId,
      metadata: { channel, results },
    }),
  );
}

function formatCurrency(amount) {
  const n = parseFloat(amount || 0);
  return `₦${n.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(d) {
  const date = new Date(d);
  return date.toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function labelForMethod(m) {
  return (
    {
      cash: "Cash",
      bank_transfer: "Bank Transfer",
      pos_card: "POS Card",
      mobile_money: "Mobile Money",
      paystack: "Paystack",
      loyalty_redemption: "Loyalty",
      credit: "Credit",
    }[m] || String(m || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Helper used by other modules — returns just the PDF buffer (for an
// integrations webhook that wants to email a re-print, for example).
async function generatePDF(business, transactionId) {
  const tx = await fetchTransactionForReceipt(business, transactionId);
  if (!tx)
    throw Object.assign(new Error("Transaction not found"), { status: 404 });
  return generateReceiptPDF(business, tx);
}

module.exports = {
  sendReceipt,
  generatePDF,
  // exposed for unit tests / advanced callers
  formatWhatsAppMessage,
  buildTemplateData,
};
