"use strict";

// ─────────────────────────────────────────────────────────────
// EMAIL CONTENT TEMPLATES
//
// Each export is a function(data, brand) => { subject, preview, body }
//   • `body`    — inner HTML only (the layout wrapper is added by render.js)
//   • `preview` — short text shown after the subject line in inbox views
//                 (the preheader). Keep it under 90 characters.
//   • `brand`   — resolved business_config row (display_name, accent_colour, etc.)
//
// Keep templates pure — no DB calls, no side effects.
// ─────────────────────────────────────────────────────────────

const MONTHS = [
  "", // 1-indexed
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ctaButton(label, url, accent) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
    <tr><td align="center" style="background:${accent};border-radius:8px;">
      <a href="${esc(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 36px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">
        ${esc(label)}
      </a>
    </td></tr>
  </table>`;
}

function formatCurrency(amount) {
  return `₦${Number(amount).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function divider(accent) {
  return `<hr style="border:none;border-top:1px solid #eeeeee;margin:24px 0;" />`;
}

// ─────────────────────────────────────────────────────────────
// 1. STAFF INVITE
// ─────────────────────────────────────────────────────────────
function invite(data, brand) {
  return {
    subject: `You've been invited to join ${brand.display_name} Hub`,
    preview: `${esc(data.invited_by || "The admin")} has invited you. Accept within 1 hour.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        You've been invited, ${esc(data.display_name)}.
      </h2>
      <p>Your colleague <strong>${esc(data.invited_by || "the admin")}</strong> has added you to <strong>${esc(brand.display_name)}</strong> Hub. Click below to set up your account.</p>
      <p style="font-size:13px;color:#666;">This link expires in <strong>1 hour</strong> and can only be used once.</p>
      ${ctaButton("Accept Invitation", data.invite_url, brand.accent_colour)}
      <p style="font-size:12px;color:#888;">Can't click the button? Copy this link into your browser:<br/>
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
          <td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;">${esc(i.name)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;text-align:center;">${i.quantity}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eee;font-size:14px;text-align:right;">${formatCurrency((i.price_kobo * i.quantity) / 100)}</td>
        </tr>`,
    )
    .join("");

  return {
    subject: `Your order is confirmed — ${brand.display_name}`,
    preview: `Order ${esc(data.order_id)} is being prepared. We'll be in touch when it ships.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Thank you, ${esc(data.customer_name || "valued customer")}.
      </h2>
      <p>Your order <strong>${esc(data.order_id)}</strong> has been received and is now being prepared with care.</p>
      ${items ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
        <tr style="background:${brand.secondary_colour};">
          <td style="padding:10px 0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;color:#666;">Item</td>
          <td style="padding:10px 0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;color:#666;text-align:center;">Qty</td>
          <td style="padding:10px 0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;color:#666;text-align:right;">Total</td>
        </tr>
        ${items}
      </table>` : ""}
      ${data.total ? `<p style="font-size:16px;font-weight:bold;text-align:right;margin-top:8px;">Total: ${formatCurrency(data.total)}</p>` : ""}
      <p>We will notify you as soon as your order is on its way.</p>
      <p style="color:#888;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 3. NEWSLETTER WELCOME
// ─────────────────────────────────────────────────────────────
function newsletter_welcome(data, brand) {
  return {
    subject: `Welcome to ${brand.display_name}`,
    preview: `You'll be first to hear about new arrivals and exclusive offers.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        You're in.
      </h2>
      <p>Thank you for subscribing to <strong>${esc(brand.display_name)}</strong>.</p>
      <p>You'll be among the first to know about new arrivals, limited editions, and offers reserved exclusively for our subscribers. We write only when we have something worth saying.</p>
      ${brand.website ? `${ctaButton("Explore the Collection", brand.website, brand.accent_colour)}` : ""}
      <p style="color:#888;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 4. INVOICE
// ─────────────────────────────────────────────────────────────
function invoice(data, brand) {
  return {
    subject: `Invoice ${data.invoice_number} from ${brand.display_name}`,
    preview: `${formatCurrency(data.total_amount)} due ${esc(data.due_date)} — please see attached.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Invoice ${esc(data.invoice_number)}
      </h2>
      <p>Dear ${esc(data.contact_name)},</p>
      <p>Please find your invoice attached. A summary is below for your convenience.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;width:100%;">
        <tr>
          <td style="padding:16px 20px;background:${brand.secondary_colour};border-radius:8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:13px;color:#666;padding:4px 0;">Invoice number</td>
                <td style="font-size:13px;font-weight:bold;text-align:right;color:#333;">${esc(data.invoice_number)}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#666;padding:4px 0;">Amount due</td>
                <td style="font-size:15px;font-weight:bold;text-align:right;color:#333;">${formatCurrency(data.total_amount)}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#666;padding:4px 0;">Due date</td>
                <td style="font-size:13px;font-weight:bold;text-align:right;color:#333;">${esc(data.due_date)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      ${data.payment_url ? ctaButton("Pay Now", data.payment_url, brand.accent_colour) : ""}
      <p>If you have any questions about this invoice, please reply to this email or contact us directly.</p>
      <p style="color:#888;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 4b. PURCHASE ORDER (outbound to supplier)
// ─────────────────────────────────────────────────────────────
function purchase_order(data, brand) {
  const lineRows = (data.lines || [])
    .map(
      (l, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#fafafa"};">
        <td style="padding:8px 10px;font-size:13px;color:#333;border-bottom:1px solid #eee;">
          ${esc(l.name)}
          ${l.sku ? `<br><span style="font-size:11px;color:#999;">${esc(l.sku)}</span>` : ""}
          ${l.description && l.description !== l.name ? `<br><span style="font-size:11px;color:#777;">${esc(l.description)}</span>` : ""}
        </td>
        <td style="padding:8px 10px;font-size:13px;color:#333;text-align:right;border-bottom:1px solid #eee;">${esc(l.quantity)}</td>
        <td style="padding:8px 10px;font-size:13px;color:#333;text-align:right;border-bottom:1px solid #eee;">${esc(l.unit_price)}</td>
        <td style="padding:8px 10px;font-size:13px;color:#333;text-align:right;border-bottom:1px solid #eee;">${esc(l.line_total)}</td>
      </tr>`,
    )
    .join("");

  const totalsRow = (label, value, bold) =>
    value
      ? `<tr>
          <td colspan="3" style="padding:6px 10px;font-size:13px;text-align:right;color:#666;${bold ? "font-weight:bold;" : ""}">${esc(label)}</td>
          <td style="padding:6px 10px;font-size:${bold ? "15px" : "13px"};text-align:right;color:#333;${bold ? "font-weight:bold;" : ""}">${esc(value)}</td>
        </tr>`
      : "";

  return {
    subject: `Purchase Order ${data.po_number} from ${brand.display_name}`,
    preview: `New purchase order ${esc(data.po_number)} — ${esc(data.total_amount)}.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Purchase Order ${esc(data.po_number)}
      </h2>
      <p>Dear ${esc(data.supplier_name || "Supplier")},</p>
      <p>Please find our purchase order below. Kindly confirm receipt and expected delivery.</p>
      ${
        data.expected_delivery
          ? `<p style="font-size:13px;color:#666;">Requested delivery date: <strong>${esc(data.expected_delivery)}</strong></p>`
          : ""
      }
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0;border:1px solid #eee;border-radius:8px;border-collapse:separate;overflow:hidden;">
        <tr style="background:${brand.secondary_colour};">
          <td style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Item</td>
          <td style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;text-align:right;">Qty</td>
          <td style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;text-align:right;">Unit price</td>
          <td style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;text-align:right;">Total</td>
        </tr>
        ${lineRows}
        ${totalsRow("Subtotal", data.subtotal)}
        ${totalsRow("Shipping", data.shipping_cost)}
        ${totalsRow("Import duty", data.import_duty)}
        ${totalsRow("Other charges", data.other_charges)}
        ${totalsRow("Total", data.total_amount, true)}
      </table>
      ${
        data.delivery_address
          ? `<p style="font-size:13px;color:#666;">Deliver to: ${esc(data.delivery_address)}</p>`
          : ""
      }
      ${data.notes ? `<p style="font-size:13px;color:#666;">Notes: ${esc(data.notes)}</p>` : ""}
      <p>If anything looks off, simply reply to this email.</p>
      <p style="color:#888;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 5. QUOTATION
// ─────────────────────────────────────────────────────────────
function quotation(data, brand) {
  return {
    subject: `Your quotation from ${brand.display_name} — ${data.quotation_number}`,
    preview: `Valid until ${esc(data.valid_until)}. Please see the attached document.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Quotation ${esc(data.quotation_number)}
      </h2>
      <p>Dear ${esc(data.contact_name)},</p>
      <p>Thank you for your interest in ${esc(brand.display_name)}. Please find your quotation attached.</p>
      <p>This quotation is valid until <strong>${esc(data.valid_until)}</strong>. If you have any questions or would like to adjust anything, simply reply to this email — we're happy to help.</p>
      ${data.quotation_url ? ctaButton("View Quotation", data.quotation_url, brand.accent_colour) : ""}
      <p>We look forward to working with you.</p>
      <p style="color:#888;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 6. PAYMENT REMINDER
// ─────────────────────────────────────────────────────────────
function payment_reminder(data, brand) {
  return {
    subject: `Friendly reminder — Invoice ${data.invoice_number} is overdue`,
    preview: `${formatCurrency(data.amount_outstanding)} remains outstanding. Please see details inside.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        A gentle reminder
      </h2>
      <p>Dear ${esc(data.display_name)},</p>
      <p>We hope this message finds you well. We wanted to follow up on invoice <strong>${esc(data.invoice_number)}</strong>, which shows an outstanding balance of <strong>${formatCurrency(data.amount_outstanding)}</strong>.</p>
      <p>If payment has already been made, please disregard this notice — and thank you. If not, we'd appreciate settlement at your earliest convenience.</p>
      ${data.payment_url ? ctaButton("Pay Now", data.payment_url, brand.accent_colour) : ""}
      <p>Should you have any questions or need to discuss payment terms, please reply directly to this email. We're always willing to help find a solution.</p>
      <p style="color:#888;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 7. PARTNER SETTLEMENT REMINDER
// ─────────────────────────────────────────────────────────────
function partner_reminder(data, brand) {
  return {
    subject: `Settlement reminder — ${data.settlement_number}`,
    preview: `A settlement reminder from ${brand.display_name}. Please see details inside.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Settlement reminder
      </h2>
      <p>${esc(data.body)}</p>
      <p style="color:#888;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 8. PAYSLIP
// ─────────────────────────────────────────────────────────────
function payslip(data, brand) {
  return {
    subject: `Your payslip for ${data.period} — ${brand.display_name}`,
    preview: `Your payslip for ${esc(data.period)} is attached. This is a confidential document.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Your payslip is ready
      </h2>
      <p>Dear ${esc(data.display_name)},</p>
      <p>Please find your payslip for <strong>${esc(data.period)}</strong> attached to this email.</p>
      <p style="color:#666;font-size:13px;">This document is confidential. If you believe you have received it in error, please contact your manager immediately and delete this email.</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 9. SCHEDULED REPORT
// ─────────────────────────────────────────────────────────────
function scheduled_report(data, brand) {
  return {
    subject: `${data.report_name} — ${data.start_date} to ${data.end_date}`,
    preview: `Your scheduled report for ${esc(data.start_date)} to ${esc(data.end_date)} is attached.`,
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
//
// Sent after a walk-in sale is completed and payment confirmed.
// Renders a full itemised receipt — no PDF attachment needed;
// the email body IS the receipt. Data shape:
//   transaction_number  TEXT
//   transaction_date    TEXT       e.g. "07 Jun 2026, 14:30"
//   contact_name        TEXT|null
//   lines               Array<{ description, quantity, unit_price, line_total }>
//   subtotal            NUMBER
//   discount_total      NUMBER     0 if none
//   vat_amount          NUMBER
//   total_amount        NUMBER
//   amount_paid         NUMBER
//   change_given        NUMBER     0 if none
//   payment_methods     TEXT       e.g. "Bank Transfer" or "Cash • Bank Transfer"
//   invoice_number      TEXT|null  set when an invoice was generated
// ─────────────────────────────────────────────────────────────
function receipt(data, brand) {
  const accent  = brand.accent_colour  || "#c9a84c";
  const surface = brand.secondary_colour || "#f9f7f5";

  // ── Line items table rows ─────────────────────────────────
  const lineRows = (data.lines || []).map((l, i) => `
    <tr style="border-bottom:1px solid #ebebeb;">
      <td style="padding:10px 0;font-size:13px;color:#333;">${esc(l.description)}</td>
      <td style="padding:10px 0;font-size:13px;color:#888;text-align:center;">${esc(String(l.quantity))}</td>
      <td style="padding:10px 0;font-size:13px;color:#888;text-align:right;">${formatCurrency(l.unit_price)}</td>
      <td style="padding:10px 0;font-size:13px;font-weight:600;color:#333;text-align:right;">${formatCurrency(l.line_total)}</td>
    </tr>`).join("");

  // ── Totals rows ───────────────────────────────────────────
  const showDiscount = parseFloat(data.discount_total || 0) > 0;
  const showChange   = parseFloat(data.change_given   || 0) > 0;

  const discountRow = showDiscount ? `
    <tr>
      <td colspan="3" style="padding:4px 0;font-size:12px;color:#888;">Discount</td>
      <td style="padding:4px 0;font-size:12px;color:#888;text-align:right;">− ${formatCurrency(data.discount_total)}</td>
    </tr>` : "";

  const changeRow = showChange ? `
    <tr>
      <td colspan="3" style="padding:4px 0;font-size:12px;color:#888;">Change given</td>
      <td style="padding:4px 0;font-size:12px;color:#888;text-align:right;">${formatCurrency(data.change_given)}</td>
    </tr>` : "";

  // ── Invoice reference line ────────────────────────────────
  const invoiceNote = data.invoice_number
    ? `<p style="font-size:12px;color:#888;margin:8px 0 0 0;">Invoice reference: <strong>${esc(data.invoice_number)}</strong></p>`
    : "";

  return {
    subject: `Your receipt from ${brand.display_name} — ${esc(data.transaction_number)}`,
    preview: `${formatCurrency(data.total_amount)} paid via ${esc(data.payment_methods || "in-store")}. Thank you for shopping with us.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 4px 0;">
        Thank you, ${esc(data.contact_name || "valued customer")}.
      </h2>
      <p style="color:#888;font-size:13px;margin:0 0 24px 0;">
        ${esc(data.transaction_date || "")} &nbsp;·&nbsp; ${esc(data.transaction_number)}
      </p>

      <!-- Line items -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr style="border-bottom:2px solid #333;">
            <th style="padding:6px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#888;text-align:left;">Item</th>
            <th style="padding:6px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#888;text-align:center;">Qty</th>
            <th style="padding:6px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#888;text-align:right;">Price</th>
            <th style="padding:6px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#888;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows}
        </tbody>
      </table>

      <!-- Totals summary -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;border-collapse:collapse;background:${surface};border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <tr>
          <td style="padding:16px 20px;" colspan="4">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td colspan="3" style="padding:4px 0;font-size:12px;color:#888;">Subtotal</td>
                <td style="padding:4px 0;font-size:12px;color:#888;text-align:right;">${formatCurrency(data.subtotal)}</td>
              </tr>
              ${discountRow}
              <tr>
                <td colspan="3" style="padding:4px 0;font-size:12px;color:#888;">VAT</td>
                <td style="padding:4px 0;font-size:12px;color:#888;text-align:right;">${formatCurrency(data.vat_amount)}</td>
              </tr>
              <tr style="border-top:1px solid #ddd;">
                <td colspan="3" style="padding:10px 0 4px 0;font-size:15px;font-weight:700;color:#1a1a1a;">Total paid</td>
                <td style="padding:10px 0 4px 0;font-size:15px;font-weight:700;color:${accent};text-align:right;">${formatCurrency(data.total_amount)}</td>
              </tr>
              <tr>
                <td colspan="3" style="padding:4px 0;font-size:12px;color:#888;">Payment</td>
                <td style="padding:4px 0;font-size:12px;color:#888;text-align:right;">${esc(data.payment_methods || "")}</td>
              </tr>
              ${changeRow}
            </table>
          </td>
        </tr>
      </table>

      ${invoiceNote}

      <p style="margin:28px 0 8px 0;color:#555;font-size:14px;line-height:1.6;">
        Every piece from ${esc(brand.display_name)} is crafted with intention. We hope you treasure it. If you ever have questions about your purchase, simply reply to this email — we're always here.
      </p>
      <p style="color:#888;font-size:13px;margin:0;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 11. CAMPAIGN QR LEAD — welcome after scanning at a popup event
// ─────────────────────────────────────────────────────────────
function campaign_lead_welcome(data, brand) {
  const shopUrl = data.shop_url || brand.website || "#";
  return {
    subject: `Great to meet you at ${esc(data.campaign_name)} — ${brand.display_name}`,
    preview: `Thank you for stopping by. Here's a link to our full collection.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        Great to meet you, ${esc(data.first_name || "there")}.
      </h2>
      <p>Thank you for stopping by <strong>${esc(data.campaign_name)}</strong>. We're glad you came.</p>
      <p>Explore our full collection online — new arrivals, bestsellers, and exclusive offers, all in one place.</p>
      ${ctaButton("Shop Now", shopUrl, brand.accent_colour)}
      <p style="color:#888;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 12. WALK-IN WELCOME — permanent QR code registration
//
// Sent to every customer who scans the in-store QR code and
// registers. Warm, personal, and unmistakably luxury. Includes
// a birthday promise if the customer opted in.
// ─────────────────────────────────────────────────────────────
function walkin_welcome(data, brand) {
  const shopUrl = data.shop_url || brand.website || "#";
  const firstName = esc(data.first_name || "");

  // Birthday section — only rendered when the customer opted in and
  // provided both month and day.
  let birthdayHtml = "";
  if (data.wants_birthday && data.birthday_month && data.birthday_day) {
    const monthName = MONTHS[parseInt(data.birthday_month)] || "";
    const day       = parseInt(data.birthday_day);
    birthdayHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;width:100%;">
        <tr>
          <td style="padding:20px 24px;background:${brand.secondary_colour};border-radius:8px;border-left:3px solid ${brand.accent_colour};">
            <p style="margin:0 0 6px 0;font-family:Georgia,serif;font-size:15px;font-style:italic;color:#444;">A note about your birthday</p>
            <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">
              You've told us your birthday falls on <strong>${monthName} ${day}</strong>. We have something planned for you — a small gesture from us to you, because we believe the people who choose us deserve to feel it. Watch your inbox when the day comes.
            </p>
          </td>
        </tr>
      </table>`;
  }

  return {
    subject: `Welcome to ${brand.display_name}, ${firstName}.`.trimEnd().replace(/,$/, "."),
    preview: `You're now part of our private client list. Here's what that means for you.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:normal;color:#333;margin:0 0 20px 0;">
        Welcome, ${firstName}.
      </h2>

      <p>We're glad you stepped in.</p>

      <p>You've been added to our private client list — a curated circle of people who appreciate the craft behind fine living. From this moment, you will be among the first to know about new arrivals, limited pieces, and private events that are not announced to the general public.</p>

      ${birthdayHtml}

      <p>Your details are held entirely in confidence. We do not share, sell, or trade your information with any third party — not now, not ever. What you've entrusted to us stays with us.</p>

      ${ctaButton("Explore the Collection", shopUrl, brand.accent_colour)}

      <p style="font-size:14px;color:#666;line-height:1.7;">If there is anything you'd like to know, or if you'd prefer to speak with someone from our team directly, simply reply to this email. It reaches us personally.</p>

      <p style="color:#888;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 13. BIRTHDAY GREETING
// ─────────────────────────────────────────────────────────────
function birthday(data, brand) {
  const firstName = esc(
    (data.first_name || data.display_name || "").split(" ")[0] || "Friend",
  );
  const shopUrl = esc(data.shop_url || brand.website || "#");

  return {
    subject: `Happy Birthday, ${firstName}. Today is yours. 🎂`,
    preview: `A small token of appreciation from all of us at ${brand.display_name} — just for you, today.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:normal;color:#333;margin:0 0 20px 0;">
        Happy Birthday, ${firstName}.
      </h2>

      <p>Of all the days in the year, today belongs to you.</p>

      <p>We hoped you might wake up to something warm in your inbox, so here we are. We haven't forgotten — and we want to mark this day with you in whatever small way we can.</p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;width:100%;">
        <tr>
          <td style="padding:24px 28px;background:${brand.secondary_colour};border-radius:10px;text-align:center;">
            <p style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:22px;color:${brand.accent_colour};font-style:italic;">
              Wishing you a beautiful day.
            </p>
            <p style="margin:0;font-size:14px;color:#555;line-height:1.7;">
              As a small gesture from ${esc(brand.display_name)}, we have something set aside for you. Visit us in-store or reach out to any of our team members and let them know it is your birthday — they will take care of the rest.
            </p>
          </td>
        </tr>
      </table>

      <p>You chose us, and that means the world to the people behind this brand. Today, we are simply giving that feeling back.</p>

      ${ctaButton("Explore the Collection", shopUrl, brand.accent_colour)}

      <p style="font-size:14px;color:#666;line-height:1.7;">
        Have a wonderful birthday, ${firstName}. You deserve every beautiful thing that comes your way.
      </p>

      <p style="color:#888;font-size:13px;">With warm wishes,<br/>— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 14. ORDER CANCELLATION
//
// Sent when staff reject / cancel a campaign order. Data shape:
//   customer_name    TEXT
//   order_id         TEXT   (order_number)
//   reason           TEXT
//   items            Array<{ name, quantity }>  (optional)
// ─────────────────────────────────────────────────────────────
function order_cancellation(data, brand) {
  const itemList = (data.items || [])
    .map((i) => `<li style="font-size:14px;color:#555;padding:4px 0;">${esc(i.name)} × ${i.quantity}</li>`)
    .join("");

  return {
    subject: `Order ${esc(data.order_id)} has been cancelled — ${brand.display_name}`,
    preview: `We're sorry — your order could not be processed. Please see details inside.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#333;margin:0 0 16px 0;">
        We're sorry, ${esc(data.customer_name || "valued customer")}.
      </h2>
      <p>Your order <strong>${esc(data.order_id)}</strong> has been cancelled.</p>
      ${data.reason ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;width:100%;">
        <tr>
          <td style="padding:16px 20px;background:${brand.secondary_colour};border-radius:8px;border-left:3px solid ${brand.accent_colour};">
            <p style="margin:0 0 4px 0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;color:#888;">Reason</p>
            <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">${esc(data.reason)}</p>
          </td>
        </tr>
      </table>` : ""}
      ${itemList ? `
      <p style="font-size:13px;color:#888;margin-bottom:4px;">Items on this order:</p>
      <ul style="padding-left:20px;margin:0 0 20px 0;">${itemList}</ul>` : ""}
      <p>No payment has been charged. If you have any questions or would like to place a new order, please reply to this email — we're here to help.</p>
      <p style="color:#888;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

module.exports = {
  invite,
  order_confirmation,
  order_cancellation,
  newsletter_welcome,
  invoice,
  purchase_order,
  quotation,
  payment_reminder,
  partner_reminder,
  payslip,
  scheduled_report,
  receipt,
  campaign_lead_welcome,
  walkin_welcome,
  birthday,
};
