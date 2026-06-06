"use strict";

// ─────────────────────────────────────────────────────────────
// EMAIL CONTENT TEMPLATES
//
// Each export is a function(data, brand) => { subject, body }
//   • `body`  — inner HTML only (the layout wrapper is added by render.js)
//   • `brand` — resolved business_config row (display_name, accent_colour, etc.)
//
// Keep templates pure — no DB calls, no side effects.
// ─────────────────────────────────────────────────────────────

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ctaButton(label, url, accent) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr><td align="center" style="background:${accent};border-radius:8px;">
      <a href="${esc(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 32px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">
        ${esc(label)}
      </a>
    </td></tr>
  </table>`;
}

function formatCurrency(amount) {
  return `₦${Number(amount).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

// ─────────────────────────────────────────────────────────────
// 1. STAFF INVITE
// ─────────────────────────────────────────────────────────────
function invite(data, brand) {
  return {
    subject: `You have been invited to ${brand.display_name} Hub`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Welcome aboard, ${esc(data.display_name)}
      </h2>
      <p>You have been invited to join <strong>${esc(brand.display_name)}</strong> by ${esc(data.invited_by || "the admin")}.</p>
      <p>Click the button below to set up your account. This link expires in <strong>1 hour</strong> and can only be used once.</p>
      ${ctaButton("Accept Invitation", data.invite_url, brand.accent_colour)}
      <p style="font-size:13px;color:#888;">Or copy this link:<br/>
        <a href="${esc(data.invite_url)}" style="color:${brand.accent_colour};word-break:break-all;">${esc(data.invite_url)}</a>
      </p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 2. ORDER CONFIRMATION (storefront)
// ─────────────────────────────────────────────────────────────
function order_confirmation(data, brand) {
  const items = (data.items || [])
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px;">${esc(i.name)}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px;text-align:center;">${i.quantity}</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px;text-align:right;">${formatCurrency((i.price_kobo * i.quantity) / 100)}</td>
        </tr>`,
    )
    .join("");

  return {
    subject: `Your ${brand.display_name} order is confirmed`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Thank you for your order, ${esc(data.customer_name || "customer")}!
      </h2>
      <p>Your order <strong>${esc(data.order_id)}</strong> has been confirmed and is being prepared.</p>
      ${items ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
        <tr style="background:${brand.secondary_colour};">
          <td style="padding:10px 0;font-size:12px;font-weight:bold;text-transform:uppercase;color:#666;">Item</td>
          <td style="padding:10px 0;font-size:12px;font-weight:bold;text-transform:uppercase;color:#666;text-align:center;">Qty</td>
          <td style="padding:10px 0;font-size:12px;font-weight:bold;text-transform:uppercase;color:#666;text-align:right;">Total</td>
        </tr>
        ${items}
      </table>` : ""}
      ${data.total ? `<p style="font-size:16px;font-weight:bold;text-align:right;">Total: ${formatCurrency(data.total)}</p>` : ""}
      <p>We will notify you when your order ships.</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 3. NEWSLETTER WELCOME
// ─────────────────────────────────────────────────────────────
function newsletter_welcome(data, brand) {
  return {
    subject: `Welcome to ${brand.display_name}`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        You're in!
      </h2>
      <p>Thank you for subscribing to <strong>${esc(brand.display_name)}</strong>. You'll be first to hear about new products, collections, and exclusive offers.</p>
      ${brand.website ? `<p><a href="${esc(brand.website)}" style="color:${brand.accent_colour};font-weight:bold;">Visit our store →</a></p>` : ""}
      <p style="color:#888;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 4. INVOICE
// ─────────────────────────────────────────────────────────────
function invoice(data, brand) {
  return {
    subject: `Invoice ${data.invoice_number}`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Invoice ${esc(data.invoice_number)}
      </h2>
      <p>Dear ${esc(data.contact_name)},</p>
      <p>Please find attached your invoice for <strong>${formatCurrency(data.total_amount)}</strong>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;width:100%;">
        <tr>
          <td style="padding:12px 16px;background:${brand.secondary_colour};border-radius:8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="font-size:13px;color:#666;">Invoice</td><td style="font-size:13px;font-weight:bold;text-align:right;">${esc(data.invoice_number)}</td></tr>
              <tr><td style="font-size:13px;color:#666;">Amount</td><td style="font-size:13px;font-weight:bold;text-align:right;">${formatCurrency(data.total_amount)}</td></tr>
              <tr><td style="font-size:13px;color:#666;">Due date</td><td style="font-size:13px;font-weight:bold;text-align:right;">${esc(data.due_date)}</td></tr>
            </table>
          </td>
        </tr>
      </table>
      <p>Please make payment at your earliest convenience.</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 5. QUOTATION
// ─────────────────────────────────────────────────────────────
function quotation(data, brand) {
  return {
    subject: `Quotation ${data.quotation_number}`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Quotation ${esc(data.quotation_number)}
      </h2>
      <p>Dear ${esc(data.contact_name)},</p>
      <p>Please find attached your quotation, valid until <strong>${esc(data.valid_until)}</strong>.</p>
      <p>If you have any questions, feel free to reply to this email.</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 6. PAYMENT REMINDER
// ─────────────────────────────────────────────────────────────
function payment_reminder(data, brand) {
  return {
    subject: `Payment Reminder — ${data.invoice_number}`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Payment reminder
      </h2>
      <p>Dear ${esc(data.display_name)},</p>
      <p>This is a friendly reminder that your invoice <strong>${esc(data.invoice_number)}</strong> for <strong>${formatCurrency(data.amount_outstanding)}</strong> is overdue.</p>
      <p>Please make payment at your earliest convenience.</p>
      <p style="color:#888;font-size:13px;">If you have already made this payment, please disregard this notice.</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 7. PARTNER SETTLEMENT REMINDER
// ─────────────────────────────────────────────────────────────
function partner_reminder(data, brand) {
  return {
    subject: `Settlement reminder — ${data.settlement_number}`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Settlement reminder
      </h2>
      <p>${esc(data.body)}</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 8. PAYSLIP
// ─────────────────────────────────────────────────────────────
function payslip(data, brand) {
  return {
    subject: `Your Payslip — ${data.period}`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Your payslip is ready
      </h2>
      <p>Dear ${esc(data.display_name)},</p>
      <p>Please find your payslip for <strong>${esc(data.period)}</strong> attached to this email.</p>
      <p style="color:#888;font-size:13px;">This is a confidential document. If you did not expect to receive this, please contact your manager.</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 9. SCHEDULED REPORT
// ─────────────────────────────────────────────────────────────
function scheduled_report(data, brand) {
  return {
    subject: `${data.report_name} — ${data.start_date} to ${data.end_date}`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        ${esc(data.report_name)}
      </h2>
      <p>Your scheduled report for the period <strong>${esc(data.start_date)}</strong> to <strong>${esc(data.end_date)}</strong> is attached.</p>
      <p style="color:#888;font-size:13px;">This report was generated automatically by ${esc(brand.display_name)} Hub.</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 10. POS RECEIPT
// ─────────────────────────────────────────────────────────────
function receipt(data, brand) {
  return {
    subject: `Receipt ${data.transaction_number}`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Your receipt
      </h2>
      <p>Dear ${esc(data.contact_name || "Customer")},</p>
      <p>Thank you for your purchase. Your receipt is attached.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;width:100%;">
        <tr>
          <td style="padding:12px 16px;background:${brand.secondary_colour};border-radius:8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="font-size:13px;color:#666;">Receipt</td><td style="font-size:13px;font-weight:bold;text-align:right;">${esc(data.transaction_number)}</td></tr>
              <tr><td style="font-size:13px;color:#666;">Total</td><td style="font-size:13px;font-weight:bold;text-align:right;">${formatCurrency(data.total_amount)}</td></tr>
            </table>
          </td>
        </tr>
      </table>
      <p>We appreciate your business.</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 11. CAMPAIGN QR LEAD — welcome after scanning at a popup event
// ─────────────────────────────────────────────────────────────
function campaign_lead_welcome(data, brand) {
  // data: { first_name, campaign_name, shop_url, accent_colour? }
  const shopUrl = data.shop_url || brand.website || "https://orikaliving.com/products";
  return {
    subject: `Thanks for joining us at ${esc(data.campaign_name)} 🎉`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Great to meet you, ${esc(data.first_name || "there")}!
      </h2>
      <p>Thank you for stopping by <strong>${esc(data.campaign_name)}</strong>. We're so glad you came.</p>
      <p>Explore our full collection online — new arrivals, bestsellers, and exclusive offers all in one place.</p>
      ${ctaButton("Shop Now", shopUrl, brand.accent_colour)}
      <p style="color:#888;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

module.exports = {
  invite,
  order_confirmation,
  newsletter_welcome,
  invoice,
  quotation,
  payment_reminder,
  partner_reminder,
  payslip,
  scheduled_report,
  receipt,
  campaign_lead_welcome,
};
