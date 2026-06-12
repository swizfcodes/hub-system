"use strict";

const colors = require("../colors");

// ─────────────────────────────────────────────────────────────
// EMAIL CONTENT TEMPLATES
//
// Each export is a function(data, brand) => { subject, preview, body }
//   • `body`    — inner HTML only (the layout wrapper is added by render.js)
//   • `preview` — short text shown after the subject line in inbox views
//                 (the preheader). Keep it under 90 characters.
//   • `brand`   — decorated business_config row (see render.decorateBrand):
//                 display_name, accent_colour, secondary_colour, plus the
//                 computed colour system (surface_ink, accent_on_surface…).
//
// Two hard rules, learned the expensive way:
//   1. Anything that sits ON a brand surface (secondary_colour panel)
//      must use surfaceInk(brand) — never a hardcoded grey. Brands are
//      free to pick a dark espresso surface; #1a1a1a text on it is
//      invisible.
//   2. Money goes through money()/formatCurrency — never raw template
//      interpolation. Callers pass numbers, numeric strings from pg,
//      or already-formatted "₦…" strings; missing values must render
//      as nothing (omit the row), never as "₦NaN".
//
// Keep templates pure — no DB calls, no side effects.
// ─────────────────────────────────────────────────────────────

const MONTHS = [
  "", // 1-indexed
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function esc(str) {
  if (str === null || str === undefined || str === "") return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Format a money value, or return null when it can't be represented.
 * Accepts numbers, pg NUMERIC strings ("6500.00"), comma-grouped
 * strings, and pre-formatted "₦…" strings (passed through untouched).
 */
function money(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.trim().startsWith("₦")) return value.trim();
  const n = Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return `₦${n.toLocaleString("en-NG", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** money() with a safe fallback for places that must print something. */
function formatCurrency(amount) {
  return money(amount) ?? "₦0";
}

/** Ink palette for text on the brand's secondary surface (defensive). */
function surfaceInk(brand) {
  return brand.surface_ink || colors.inkOn(brand.secondary_colour || "#F5F0EB");
}

/** Accent guaranteed to read on the brand's secondary surface. */
function accentOnSurface(brand) {
  return (
    brand.accent_on_surface ||
    colors.readableOn(brand.accent_colour || "#C9A86C", brand.secondary_colour || "#F5F0EB", 3.2)
  );
}

function ctaButton(label, url, brand) {
  const accent = brand.accent_colour || "#C9A86C";
  const ink = brand.button_ink || colors.bestInkOn(accent);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:30px auto;">
    <tr><td align="center" style="background:${accent};border-radius:6px;">
      <a href="${esc(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:15px 40px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${ink};text-decoration:none;border-radius:6px;">
        ${esc(label)}
      </a>
    </td></tr>
  </table>`;
}

// ─────────────────────────────────────────────────────────────
// 1. STAFF INVITE
// ─────────────────────────────────────────────────────────────
function invite(data, brand) {
  return {
    subject: `You've been invited to join ${brand.display_name} Hub`,
    preview: `${esc(data.invited_by || "The admin")} has invited you. Accept within 1 hour.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        You've been invited, ${esc(data.display_name)}.
      </h2>
      <p>Your colleague <strong>${esc(data.invited_by || "the admin")}</strong> has added you to <strong>${esc(brand.display_name)}</strong> Hub. Click below to set up your account.</p>
      <p style="font-size:13px;color:#6e675e;">This link expires in <strong>1 hour</strong> and can only be used once.</p>
      ${ctaButton("Accept Invitation", data.invite_url, brand)}
      <p style="font-size:12px;color:#8a847c;">Can't click the button? Copy this link into your browser:<br/>
        <a href="${esc(data.invite_url)}" style="color:${brand.accent_on_white || brand.accent_colour};word-break:break-all;">${esc(data.invite_url)}</a>
      </p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 2. ORDER CONFIRMATION (storefront)
// ─────────────────────────────────────────────────────────────
function order_confirmation(data, brand) {
  const ink = surfaceInk(brand);
  const items = (data.items || [])
    .map((i) => {
      const lineTotal =
        i.price_kobo != null && i.quantity != null
          ? money((Number(i.price_kobo) * Number(i.quantity)) / 100)
          : null;
      return `<tr>
          <td style="padding:10px 8px 10px 0;border-bottom:1px solid #eceae6;font-size:14px;color:#3d3833;">${esc(i.name)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eceae6;font-size:14px;color:#8a847c;text-align:center;">${esc(i.quantity)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #eceae6;font-size:14px;color:#3d3833;text-align:right;">${lineTotal ?? "—"}</td>
        </tr>`;
    })
    .join("");

  const total = money(data.total);

  return {
    subject: `Your order is confirmed — ${brand.display_name}`,
    preview: `Order ${esc(data.order_id)} is being prepared. We'll be in touch when it ships.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        Thank you, ${esc(data.customer_name || "valued customer")}.
      </h2>
      <p>Your order <strong>${esc(data.order_id)}</strong> has been received and is now being prepared with care.</p>
      ${items ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
        <tr style="background:${brand.secondary_colour};">
          <td style="padding:10px 8px;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;color:${ink.muted};">Item</td>
          <td style="padding:10px 0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;color:${ink.muted};text-align:center;">Qty</td>
          <td style="padding:10px 8px;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;color:${ink.muted};text-align:right;">Total</td>
        </tr>
        ${items}
      </table>` : ""}
      ${total ? `<p style="font-size:16px;font-weight:bold;color:#2f2b26;text-align:right;margin-top:8px;">Total: ${total}</p>` : ""}
      <p>We will notify you as soon as your order is on its way.</p>
      <p style="color:#8a847c;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
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
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        You're in.
      </h2>
      <p>Thank you for subscribing to <strong>${esc(brand.display_name)}</strong>.</p>
      <p>You'll be among the first to know about new arrivals, limited editions, and offers reserved exclusively for our subscribers. We write only when we have something worth saying.</p>
      ${brand.website ? ctaButton("Explore the Collection", brand.website, brand) : ""}
      <p style="color:#8a847c;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 4. INVOICE
// ─────────────────────────────────────────────────────────────
function invoice(data, brand) {
  const ink = surfaceInk(brand);
  const accent = accentOnSurface(brand);
  const amount = money(data.total_amount);

  const summaryRow = (label, value, { strong = false } = {}) =>
    value
      ? `<tr>
          <td style="font-size:13px;color:${ink.muted};padding:4px 0;">${esc(label)}</td>
          <td style="font-size:${strong ? "16px" : "13px"};font-weight:bold;text-align:right;color:${strong ? accent : ink.text};">${esc(value)}</td>
        </tr>`
      : "";

  return {
    subject: `Invoice ${data.invoice_number} from ${brand.display_name}`,
    preview: `${amount ? `${amount} due` : "Due"} ${esc(data.due_date)} — please see attached.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        Invoice ${esc(data.invoice_number)}
      </h2>
      <p>Dear ${esc(data.contact_name)},</p>
      <p>Please find your invoice attached. A summary is below for your convenience.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;width:100%;">
        <tr>
          <td style="padding:18px 22px;background:${brand.secondary_colour};border-radius:8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${summaryRow("Invoice number", data.invoice_number)}
              ${summaryRow("Amount due", amount, { strong: true })}
              ${summaryRow("Due date", data.due_date)}
            </table>
          </td>
        </tr>
      </table>
      ${data.payment_url ? ctaButton("Pay Now", data.payment_url, brand) : ""}
      <p>If you have any questions about this invoice, please reply to this email or contact us directly.</p>
      <p style="color:#8a847c;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 4b. PURCHASE ORDER (outbound to supplier)
// ─────────────────────────────────────────────────────────────
function purchase_order(data, brand) {
  const ink = surfaceInk(brand);
  const lineRows = (data.lines || [])
    .map(
      (l, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#faf9f7"};">
        <td style="padding:8px 10px;font-size:13px;color:#3d3833;border-bottom:1px solid #eceae6;">
          ${esc(l.name)}
          ${l.sku ? `<br><span style="font-size:11px;color:#a39d93;">${esc(l.sku)}</span>` : ""}
          ${l.description && l.description !== l.name ? `<br><span style="font-size:11px;color:#8a847c;">${esc(l.description)}</span>` : ""}
        </td>
        <td style="padding:8px 10px;font-size:13px;color:#3d3833;text-align:right;border-bottom:1px solid #eceae6;">${esc(l.quantity)}</td>
        <td style="padding:8px 10px;font-size:13px;color:#3d3833;text-align:right;border-bottom:1px solid #eceae6;">${money(l.unit_price) ?? esc(l.unit_price)}</td>
        <td style="padding:8px 10px;font-size:13px;color:#3d3833;text-align:right;border-bottom:1px solid #eceae6;">${money(l.line_total) ?? esc(l.line_total)}</td>
      </tr>`,
    )
    .join("");

  const totalsRow = (label, value, bold) => {
    const display = money(value) ?? (value ? esc(value) : null);
    return display
      ? `<tr>
          <td colspan="3" style="padding:6px 10px;font-size:13px;text-align:right;color:#6e675e;${bold ? "font-weight:bold;" : ""}">${esc(label)}</td>
          <td style="padding:6px 10px;font-size:${bold ? "15px" : "13px"};text-align:right;color:#2f2b26;${bold ? "font-weight:bold;" : ""}">${display}</td>
        </tr>`
      : "";
  };

  return {
    subject: `Purchase Order ${data.po_number} from ${brand.display_name}`,
    preview: `New purchase order ${esc(data.po_number)}${money(data.total_amount) ? ` — ${money(data.total_amount)}` : ""}.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        Purchase Order ${esc(data.po_number)}
      </h2>
      <p>Dear ${esc(data.supplier_name || "Supplier")},</p>
      <p>Please find our purchase order below. Kindly confirm receipt and expected delivery.</p>
      ${
        data.expected_delivery
          ? `<p style="font-size:13px;color:#6e675e;">Requested delivery date: <strong>${esc(data.expected_delivery)}</strong></p>`
          : ""
      }
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0;border:1px solid #eceae6;border-radius:8px;border-collapse:separate;overflow:hidden;">
        <tr style="background:${brand.secondary_colour};">
          <td style="padding:9px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:${ink.muted};">Item</td>
          <td style="padding:9px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:${ink.muted};text-align:right;">Qty</td>
          <td style="padding:9px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:${ink.muted};text-align:right;">Unit price</td>
          <td style="padding:9px 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:${ink.muted};text-align:right;">Total</td>
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
          ? `<p style="font-size:13px;color:#6e675e;">Deliver to: ${esc(data.delivery_address)}</p>`
          : ""
      }
      ${data.notes ? `<p style="font-size:13px;color:#6e675e;">Notes: ${esc(data.notes)}</p>` : ""}
      <p>If anything looks off, simply reply to this email.</p>
      <p style="color:#8a847c;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 4c. DELIVERY DISPATCHED (signing link + driver details)
// ─────────────────────────────────────────────────────────────
function delivery_dispatched(data, brand) {
  const ink = surfaceInk(brand);
  const itemRows = (data.items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:7px 12px;font-size:13px;color:#3d3833;border-bottom:1px solid #eceae6;">${esc(item.description)}</td>
        <td style="padding:7px 12px;font-size:13px;color:#6e675e;text-align:right;border-bottom:1px solid #eceae6;">× ${esc(item.quantity)}</td>
      </tr>`,
    )
    .join("");

  return {
    subject: `Your order is on its way — ${data.delivery_number}`,
    preview: `${esc(data.courier_label || "Your courier")} is bringing your order. Please confirm receipt on arrival.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        Your order is on its way
      </h2>
      <p>Dear ${esc(data.contact_name)},</p>
      <p>Your order <strong>${esc(data.delivery_number)}</strong> has been dispatched${
        data.courier_label ? ` via <strong>${esc(data.courier_label)}</strong>` : ""
      }.</p>
      ${
        data.driver_name || data.driver_phone
          ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;width:100%;">
              <tr><td style="padding:16px 20px;background:${brand.secondary_colour};border-radius:8px;">
                <p style="margin:0;font-size:11px;color:${ink.muted};text-transform:uppercase;letter-spacing:0.8px;">Your driver</p>
                <p style="margin:6px 0 0 0;font-size:15px;font-weight:bold;color:${ink.strong};">${esc(data.driver_name || "—")}</p>
                ${data.driver_phone ? `<p style="margin:2px 0 0 0;font-size:13px;color:${ink.text};">${esc(data.driver_phone)}</p>` : ""}
              </td></tr>
            </table>`
          : ""
      }
      ${
        itemRows
          ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0;border:1px solid #eceae6;border-radius:8px;border-collapse:separate;overflow:hidden;">${itemRows}</table>`
          : ""
      }
      <p style="font-size:13px;color:#6e675e;">Delivering to: ${esc(data.delivery_address)}</p>
      ${
        data.signing_url
          ? `<p>When your order arrives, please confirm receipt by signing below — it takes a few seconds on your phone:</p>
             ${ctaButton("Confirm Receipt & Sign", data.signing_url, brand)}
             <p style="font-size:12px;color:#a39d93;">The signing link is valid for 48 hours.</p>`
          : ""
      }
      <p>If anything looks wrong, simply reply to this email.</p>
      <p style="color:#8a847c;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 4d. DELIVERY COMPLETED (signed delivery note attached)
// ─────────────────────────────────────────────────────────────
function delivery_completed(data, brand) {
  return {
    subject: `Delivered — ${data.delivery_number} from ${brand.display_name}`,
    preview: `Your order has been delivered. ${data.has_note ? "Your signed delivery note is attached." : "Thank you for shopping with us."}`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        Delivered ✓
      </h2>
      <p>Dear ${esc(data.contact_name)},</p>
      <p>Your order <strong>${esc(data.delivery_number)}</strong> has been delivered${
        data.signed_at ? ` and confirmed on ${esc(data.signed_at)}` : ""
      }.</p>
      ${
        data.has_note
          ? `<p>Your signed delivery note is attached to this email for your records.</p>`
          : ""
      }
      <p>Thank you for shopping with ${esc(brand.display_name)} — we hope you love it.</p>
      <p style="color:#8a847c;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
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
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        Quotation ${esc(data.quotation_number)}
      </h2>
      <p>Dear ${esc(data.contact_name)},</p>
      <p>Thank you for your interest in ${esc(brand.display_name)}. Please find your quotation attached.</p>
      <p>This quotation is valid until <strong>${esc(data.valid_until)}</strong>. If you have any questions or would like to adjust anything, simply reply to this email — we're happy to help.</p>
      ${data.quotation_url ? ctaButton("View Quotation", data.quotation_url, brand) : ""}
      <p>We look forward to working with you.</p>
      <p style="color:#8a847c;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 6. PAYMENT REMINDER
// ─────────────────────────────────────────────────────────────
function payment_reminder(data, brand) {
  const outstanding = money(data.amount_outstanding);
  return {
    subject: `Friendly reminder — Invoice ${data.invoice_number} is overdue`,
    preview: `${outstanding ? `${outstanding} remains outstanding.` : "A balance remains outstanding."} Please see details inside.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        A gentle reminder
      </h2>
      <p>Dear ${esc(data.display_name)},</p>
      <p>We hope this message finds you well. We wanted to follow up on invoice <strong>${esc(data.invoice_number)}</strong>${outstanding ? `, which shows an outstanding balance of <strong>${outstanding}</strong>` : ""}.</p>
      <p>If payment has already been made, please disregard this notice — and thank you. If not, we'd appreciate settlement at your earliest convenience.</p>
      ${data.payment_url ? ctaButton("Pay Now", data.payment_url, brand) : ""}
      <p>Should you have any questions or need to discuss payment terms, please reply directly to this email. We're always willing to help find a solution.</p>
      <p style="color:#8a847c;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
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
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        Settlement reminder
      </h2>
      <p>${esc(data.body)}</p>
      <p style="color:#8a847c;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
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
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        Your payslip is ready
      </h2>
      <p>Dear ${esc(data.display_name)},</p>
      <p>Please find your payslip for <strong>${esc(data.period)}</strong> attached to this email.</p>
      <p style="color:#6e675e;font-size:13px;">This document is confidential. If you believe you have received it in error, please contact your manager immediately and delete this email.</p>
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
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        ${esc(data.report_name)}
      </h2>
      <p>Your scheduled report for the period <strong>${esc(data.start_date)}</strong> to <strong>${esc(data.end_date)}</strong> is attached.</p>
      <p style="color:#8a847c;font-size:13px;">This report was generated automatically by ${esc(brand.display_name)} Hub.</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 10. RECEIPT (POS walk-in + direct sales)
//
// Sent after a sale is completed and payment confirmed. Renders a
// full itemised receipt. Data shape (all money fields accept numbers,
// numeric strings, or pre-formatted "₦…" strings):
//   transaction_number  TEXT|null  e.g. "POS-0042" or order number
//   transaction_date    TEXT|null  e.g. "07 Jun 2026, 14:30"
//   contact_name        TEXT|null
//   lines               Array<{ description, quantity|qty, unit_price, line_total }>
//   subtotal            money|null
//   discount_total      money|null (0/absent → row hidden)
//   vat_amount          money|null
//   total_amount        money
//   change_given        money|null (0/absent → row hidden)
//   payment_methods     TEXT|null  e.g. "Bank Transfer" (absent → row hidden)
//   invoice_number      TEXT|null  set when an invoice was generated
//
// Every field degrades gracefully: missing values remove their row —
// they never render "₦NaN", "undefined", or a dangling "—".
// ─────────────────────────────────────────────────────────────
function receipt(data, brand) {
  const ink = surfaceInk(brand);
  const accent = accentOnSurface(brand);

  // ── Line items table rows ─────────────────────────────────
  const lineRows = (data.lines || [])
    .map((l) => {
      const qty = l.quantity ?? l.qty;
      return `
    <tr>
      <td style="padding:11px 8px 11px 0;font-size:14px;color:#3d3833;border-bottom:1px solid #eceae6;">${esc(l.description)}</td>
      <td style="padding:11px 0;font-size:13px;color:#8a847c;text-align:center;border-bottom:1px solid #eceae6;">${esc(qty)}</td>
      <td style="padding:11px 0 11px 8px;font-size:13px;color:#8a847c;text-align:right;border-bottom:1px solid #eceae6;">${money(l.unit_price) ?? ""}</td>
      <td style="padding:11px 0 11px 8px;font-size:14px;font-weight:600;color:#2f2b26;text-align:right;border-bottom:1px solid #eceae6;">${money(l.line_total) ?? ""}</td>
    </tr>`;
    })
    .join("");

  const itemsTable = lineRows
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        <thead>
          <tr>
            <th style="padding:0 0 8px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#8a847c;text-align:left;border-bottom:2px solid #2f2b26;">Item</th>
            <th style="padding:0 0 8px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#8a847c;text-align:center;border-bottom:2px solid #2f2b26;">Qty</th>
            <th style="padding:0 0 8px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#8a847c;text-align:right;border-bottom:2px solid #2f2b26;">Price</th>
            <th style="padding:0 0 8px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#8a847c;text-align:right;border-bottom:2px solid #2f2b26;">Total</th>
          </tr>
        </thead>
        <tbody>${lineRows}
        </tbody>
      </table>`
    : "";

  // ── Totals rows — each renders only when its value exists ──
  const subtotal = money(data.subtotal);
  const vat = money(data.vat_amount);
  const total = money(data.total_amount);
  const showDiscount = Number(String(data.discount_total ?? 0).replace(/[₦,]/g, "")) > 0;
  const showChange = Number(String(data.change_given ?? 0).replace(/[₦,]/g, "")) > 0;

  const smallRow = (label, value, prefix = "") =>
    value
      ? `<tr>
          <td style="padding:5px 0;font-size:13px;color:${ink.muted};">${esc(label)}</td>
          <td style="padding:5px 0;font-size:13px;color:${ink.text};text-align:right;">${prefix}${value}</td>
        </tr>`
      : "";

  const totalsRows = [
    smallRow("Subtotal", subtotal),
    showDiscount ? smallRow("Discount", money(data.discount_total), "− ") : "",
    smallRow("VAT", vat),
    total
      ? `<tr>
          <td style="padding:12px 0 0 0;font-size:15px;font-weight:700;color:${ink.strong};border-top:1px solid ${ink.border};">Total paid</td>
          <td style="padding:12px 0 0 0;font-size:18px;font-weight:700;color:${accent};text-align:right;border-top:1px solid ${ink.border};">${total}</td>
        </tr>`
      : "",
    data.payment_methods
      ? `<tr>
          <td style="padding:8px 0 0 0;font-size:12px;color:${ink.muted};">Payment</td>
          <td style="padding:8px 0 0 0;font-size:12px;color:${ink.text};text-align:right;">${esc(data.payment_methods)}</td>
        </tr>`
      : "",
    showChange ? smallRow("Change given", money(data.change_given)) : "",
  ].join("");

  // ── Receipt reference: transaction number, else invoice/order no. ──
  const reference =
    data.transaction_number || data.invoice_number || data.order_number || "";
  const metaParts = [data.transaction_date, reference].filter(Boolean).map(esc);

  const invoiceNote = data.invoice_number
    ? `<p style="font-size:12px;color:#8a847c;margin:8px 0 0 0;">Invoice reference: <strong style="color:#3d3833;">${esc(data.invoice_number)}</strong></p>`
    : "";

  return {
    subject: `Your receipt from ${brand.display_name}${reference ? ` — ${esc(reference)}` : ""}`,
    preview: `${total ? `${total} paid` : "Payment received"}${data.payment_methods ? ` via ${esc(data.payment_methods)}` : ""}. Thank you for shopping with us.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 4px 0;">
        Thank you, ${esc(data.contact_name || "valued customer")}.
      </h2>
      ${metaParts.length ? `<p style="color:#8a847c;font-size:13px;margin:0 0 26px 0;">${metaParts.join("&nbsp;&nbsp;·&nbsp;&nbsp;")}</p>` : `<div style="height:18px;font-size:0;line-height:0;">&nbsp;</div>`}

      ${itemsTable}

      <!-- Totals summary -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin-bottom:20px;">
        <tr>
          <td style="padding:18px 22px;background:${brand.secondary_colour};border-radius:8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${totalsRows}
            </table>
          </td>
        </tr>
      </table>

      ${invoiceNote}

      <p style="margin:28px 0 8px 0;color:#55504a;font-size:14px;line-height:1.7;">
        Every piece from ${esc(brand.display_name)} is crafted with intention. We hope you treasure it. If you ever have questions about your purchase, simply reply to this email — we're always here.
      </p>
      <p style="color:#8a847c;font-size:13px;margin:0;">— The ${esc(brand.display_name)} Team</p>
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
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        Great to meet you, ${esc(data.first_name || "there")}.
      </h2>
      <p>Thank you for stopping by <strong>${esc(data.campaign_name)}</strong>. We're glad you came.</p>
      <p>Explore our full collection online — new arrivals, bestsellers, and exclusive offers, all in one place.</p>
      ${ctaButton("Shop Now", shopUrl, brand)}
      <p style="color:#8a847c;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
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
  const ink = surfaceInk(brand);
  const shopUrl = data.shop_url || brand.website || "#";
  const firstName = esc(data.first_name || "");

  // Birthday section — only rendered when the customer opted in and
  // provided both month and day.
  let birthdayHtml = "";
  if (data.wants_birthday && data.birthday_month && data.birthday_day) {
    const monthName = MONTHS[parseInt(data.birthday_month)] || "";
    const day = parseInt(data.birthday_day);
    birthdayHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;width:100%;">
        <tr>
          <td style="padding:20px 24px;background:${brand.secondary_colour};border-radius:8px;border-left:3px solid ${accentOnSurface(brand)};">
            <p style="margin:0 0 6px 0;font-family:Georgia,serif;font-size:15px;font-style:italic;color:${ink.strong};">A note about your birthday</p>
            <p style="margin:0;font-size:14px;color:${ink.text};line-height:1.6;">
              You've told us your birthday falls on <strong>${monthName} ${day}</strong>. We have something planned for you — a small gesture from us to you, because we believe the people who choose us deserve to feel it. Watch your inbox when the day comes.
            </p>
          </td>
        </tr>
      </table>`;
  }

  return {
    subject: firstName
      ? `Welcome to ${brand.display_name}, ${firstName}.`
      : `Welcome to ${brand.display_name}.`,
    preview: `You're now part of our private client list. Here's what that means for you.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:normal;color:#2f2b26;margin:0 0 20px 0;">
        Welcome${firstName ? `, ${firstName}` : ""}.
      </h2>

      <p>We're glad you stepped in.</p>

      <p>You've been added to our private client list — a curated circle of people who appreciate the craft behind fine living. From this moment, you will be among the first to know about new arrivals, limited pieces, and private events that are not announced to the general public.</p>

      ${birthdayHtml}

      <p>Your details are held entirely in confidence. We do not share, sell, or trade your information with any third party — not now, not ever. What you've entrusted to us stays with us.</p>

      ${ctaButton("Explore the Collection", shopUrl, brand)}

      <p style="font-size:14px;color:#6e675e;line-height:1.7;">If there is anything you'd like to know, or if you'd prefer to speak with someone from our team directly, simply reply to this email. It reaches us personally.</p>

      <p style="color:#8a847c;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 13. BIRTHDAY GREETING
// ─────────────────────────────────────────────────────────────
function birthday(data, brand) {
  const ink = surfaceInk(brand);
  const firstName = esc(
    (data.first_name || data.display_name || "").split(" ")[0] || "Friend",
  );
  const shopUrl = esc(data.shop_url || brand.website || "#");

  return {
    subject: `Happy Birthday, ${firstName}. Today is yours. 🎂`,
    preview: `A small token of appreciation from all of us at ${brand.display_name} — just for you, today.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:24px;font-weight:normal;color:#2f2b26;margin:0 0 20px 0;">
        Happy Birthday, ${firstName}.
      </h2>

      <p>Of all the days in the year, today belongs to you.</p>

      <p>We hoped you might wake up to something warm in your inbox, so here we are. We haven't forgotten — and we want to mark this day with you in whatever small way we can.</p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;width:100%;">
        <tr>
          <td style="padding:24px 28px;background:${brand.secondary_colour};border-radius:10px;text-align:center;">
            <p style="margin:0 0 8px 0;font-family:Georgia,serif;font-size:22px;color:${accentOnSurface(brand)};font-style:italic;">
              Wishing you a beautiful day.
            </p>
            <p style="margin:0;font-size:14px;color:${ink.text};line-height:1.7;">
              As a small gesture from ${esc(brand.display_name)}, we have something set aside for you. Visit us in-store or reach out to any of our team members and let them know it is your birthday — they will take care of the rest.
            </p>
          </td>
        </tr>
      </table>

      <p>You chose us, and that means the world to the people behind this brand. Today, we are simply giving that feeling back.</p>

      ${ctaButton("Explore the Collection", shopUrl, brand)}

      <p style="font-size:14px;color:#6e675e;line-height:1.7;">
        Have a wonderful birthday, ${firstName}. You deserve every beautiful thing that comes your way.
      </p>

      <p style="color:#8a847c;font-size:13px;">With warm wishes,<br/>— The ${esc(brand.display_name)} Team</p>
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
  const ink = surfaceInk(brand);
  const itemList = (data.items || [])
    .map((i) => `<li style="font-size:14px;color:#55504a;padding:4px 0;">${esc(i.name)} × ${esc(i.quantity)}</li>`)
    .join("");

  return {
    subject: `Order ${esc(data.order_id)} has been cancelled — ${brand.display_name}`,
    preview: `We're sorry — your order could not be processed. Please see details inside.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        We're sorry, ${esc(data.customer_name || "valued customer")}.
      </h2>
      <p>Your order <strong>${esc(data.order_id)}</strong> has been cancelled.</p>
      ${data.reason ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;width:100%;">
        <tr>
          <td style="padding:16px 20px;background:${brand.secondary_colour};border-radius:8px;border-left:3px solid ${accentOnSurface(brand)};">
            <p style="margin:0 0 4px 0;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.8px;color:${ink.muted};">Reason</p>
            <p style="margin:0;font-size:14px;color:${ink.text};line-height:1.6;">${esc(data.reason)}</p>
          </td>
        </tr>
      </table>` : ""}
      ${itemList ? `
      <p style="font-size:13px;color:#8a847c;margin-bottom:4px;">Items on this order:</p>
      <ul style="padding-left:20px;margin:0 0 20px 0;">${itemList}</ul>` : ""}
      <p>No payment has been charged. If you have any questions or would like to place a new order, please reply to this email — we're here to help.</p>
      <p style="color:#8a847c;font-size:13px;">— The ${esc(brand.display_name)} Team</p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 15. PASSWORD RESET OTP — self-service "forgot password" code
// ─────────────────────────────────────────────────────────────
function password_reset_otp(data, brand) {
  const ink = surfaceInk(brand);
  return {
    subject: `${esc(data.otp)} is your ${brand.display_name} reset code`,
    preview: `Your password reset code expires in 10 minutes.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        Password reset requested
      </h2>
      <p>Use this code to reset your ${esc(brand.display_name)} password. It expires in <strong>10 minutes</strong>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto;">
        <tr>
          <td align="center" style="padding:18px 40px;background:${brand.secondary_colour};border:1px dashed ${accentOnSurface(brand)};border-radius:10px;">
            <span style="font-family:'Courier New',monospace;font-size:32px;font-weight:bold;letter-spacing:10px;color:${ink.strong};">${esc(data.otp)}</span>
          </td>
        </tr>
      </table>
      <p style="font-size:13px;color:#8a847c;line-height:1.6;">
        If you didn't request this, you can safely ignore this email — your
        password stays unchanged and the code expires on its own. Never share
        this code with anyone, including staff.
      </p>
    `,
  };
}

// ─────────────────────────────────────────────────────────────
// 16. PASSWORD CHANGED — security notice after a successful reset
// ─────────────────────────────────────────────────────────────
function password_changed(data, brand) {
  return {
    subject: `Your ${brand.display_name} password was changed`,
    preview: `Your account password was just reset. All sessions were signed out.`,
    body: `
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#2f2b26;margin:0 0 16px 0;">
        Password changed
      </h2>
      <p>Your ${esc(brand.display_name)} account password was reset just now${data.when ? ` (${esc(data.when)})` : ""}. For safety, all active sessions were signed out.</p>
      <p style="font-size:13px;color:#8a847c;line-height:1.6;">
        If this was you, no action is needed. If it wasn't, contact your
        system administrator immediately so they can secure the account.
      </p>
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
  delivery_dispatched,
  delivery_completed,
  quotation,
  payment_reminder,
  partner_reminder,
  payslip,
  scheduled_report,
  receipt,
  campaign_lead_welcome,
  walkin_welcome,
  birthday,
  password_reset_otp,
  password_changed,
};
