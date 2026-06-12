"use strict";

const { getBusinessConfig } = require("../../config/businesses");
const config = require("../../config/config");
const logger = require("../../config/logger");
const colors = require("./colors");
const assets = require("./assets");

// ─────────────────────────────────────────────────────────────
// EMAIL TEMPLATE RENDERER
//
// Produces fully branded, responsive HTML emails driven entirely
// by shared.business_config fields set in Business Setup. No
// hardcoded brand names, colours, logos, or addresses — and no
// assumptions about whether the brand palette is light or dark:
// every ink colour is computed from the surface it sits on
// (lib/email/colors), so an espresso-dark footer gets ivory text
// and a cream footer gets espresso text. Verified against Gmail
// (light + dark mode), Apple Mail, and Outlook constraints:
//   • no data: URIs (Gmail strips them) — images are hosted files
//   • single-column 600px table layout, inline styles only
//   • footer lines are short, centred rows that wrap cleanly at 320px
//
// Usage:
//   const { renderEmail } = require('./render');
//   const html = renderEmail('invite', 'jewelry', { name: 'Tom', link: '...' });
//
// Template contract:
//   Each template is a function(data, brand) => { subject, preview, body }
//   where `body` is the inner HTML (no wrapper) and `brand` is the
//   decorated business_config row (see decorateBrand).
// ─────────────────────────────────────────────────────────────

const templates = require("./templates");

/**
 * Render a branded transactional email.
 *
 * @param {string} templateName  — key in templates/index.js
 * @param {string} business      — business_key (e.g. "jewelry")
 * @param {Object} data          — template-specific data
 * @returns {{ subject: string, html: string }}
 */
function renderEmail(templateName, business, data) {
  const brand = resolveBrand(business);
  const template = templates[templateName];
  if (!template) {
    logger.warn(`[email-render] Unknown template "${templateName}", falling back to raw`);
    return { subject: data.subject || "", html: data.html || "" };
  }

  const { subject, body, preview } = template(data, brand);
  const html = wrapInLayout(body, brand, preview);
  return { subject, html };
}

/**
 * Resolve brand config from the in-memory cache, with sensible defaults
 * so emails never fail even if a business_config row is sparse.
 */
function resolveBrand(business) {
  const raw = getBusinessConfig(business) || {};
  return decorateBrand(raw, config.app.hubBaseUrl || "");
}

/**
 * Normalise a raw business_config row into the brand object templates
 * receive, including the computed colour system:
 *
 *   surface_ink — ink palette for text on secondary_colour panels
 *   accent_on_surface / accent_on_white — accent, adjusted until it reads
 *   button_ink  — text colour for solid-accent buttons
 *
 * Exported so preview tooling can build a brand without the DB cache.
 */
function decorateBrand(raw, hubBaseUrl) {
  const accent = raw.accent_colour || "#C9A86C";
  const secondary = raw.secondary_colour || "#F5F0EB";
  return {
    display_name:      raw.display_name      || "Hub Platform",
    legal_name:        raw.legal_name        || "",
    address:           raw.address           || "",
    phone:             raw.phone             || "",
    email:             raw.email             || "",
    website:           raw.website           || "",
    logo_path:         resolveLogoUrl(raw.logo_path, hubBaseUrl),
    accent_colour:     accent,
    secondary_colour:  secondary,
    brand_fonts:       raw.brand_fonts       || {},
    social_links:      raw.social_links      || {},
    email_footer_text: raw.email_footer_text || "",
    hub_base_url:      hubBaseUrl,
    // Computed colour system — everything that sits on a brand surface
    // must use these instead of hardcoded greys.
    surface_is_dark:   colors.isDark(secondary),
    surface_ink:       colors.inkOn(secondary),
    accent_on_surface: colors.readableOn(accent, secondary, 3.2),
    accent_on_white:   colors.readableOn(accent, "#ffffff", 3.0),
    button_ink:        colors.bestInkOn(accent),
  };
}

/**
 * Ensure logo_path is an absolute URL so external email clients can fetch it.
 * Relative paths (e.g. /uploads/logos/orika.png) work inside the app but
 * are unreachable from Gmail, Apple Mail, etc. Prefix with hub_base_url.
 */
function resolveLogoUrl(logoPath, hubBaseUrl) {
  if (!logoPath) return "";
  if (logoPath.startsWith("http://") || logoPath.startsWith("https://")) return logoPath;
  const base = (hubBaseUrl || "").replace(/\/$/, "");
  const path = logoPath.startsWith("/") ? logoPath : `/${logoPath}`;
  return base ? `${base}${path}` : logoPath;
}

/** Strip protocol + trailing slash for display: https://orika.com/ → orika.com */
function displayUrl(url) {
  return String(url || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

// ─────────────────────────────────────────────────────────────
// FOOTER
//
// Stacked, centred rows — each short enough to survive a 320px
// viewport without breaking mid-word. Icons are hosted PNGs
// (lib/email/assets); when a PNG isn't available the platform name
// renders as a small-caps text link instead. Never a broken image.
// ─────────────────────────────────────────────────────────────

function renderSocialRow(brand, fontBody) {
  const entries = Object.entries(brand.social_links || {}).filter(
    ([platform, url]) => url && assets.PLATFORM_LABELS[platform],
  );
  if (!entries.length) return "";

  const ink = brand.surface_ink;
  const resolved = entries.map(([platform, url]) => ({
    url,
    label: assets.PLATFORM_LABELS[platform],
    iconUrl: assets.socialIconUrl(platform, brand, brand.hub_base_url),
  }));

  // All-or-nothing: if any icon PNG is missing, render every platform as
  // a text link so the row stays visually even — never a broken image.
  const content = resolved.every((e) => e.iconUrl)
    ? resolved
        .map(
          (e) =>
            `<a href="${escapeHtml(e.url)}" target="_blank" rel="noopener" style="display:inline-block;margin:0 9px;text-decoration:none;"><img src="${escapeHtml(e.iconUrl)}" alt="${escapeHtml(e.label)}" width="24" height="24" style="display:block;border:0;width:24px;height:24px;" /></a>`,
        )
        .join("")
    : resolved
        .map(
          (e) =>
            `<a href="${escapeHtml(e.url)}" target="_blank" rel="noopener" style="color:${brand.accent_on_surface};font-family:${fontBody};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;">${escapeHtml(e.label)}</a>`,
        )
        .join(`<span style="color:${ink.faint};font-size:11px;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`);

  return `<tr><td align="center" style="padding:0 0 18px 0;">${content}</td></tr>`;
}

function renderFooter(brand, fontBody) {
  const ink = brand.surface_ink;
  const accent = brand.accent_on_surface;
  const rows = [];

  // 1 — social icons / links
  const social = renderSocialRow(brand, fontBody);
  if (social) rows.push(social);

  // 2 — short centred rule
  rows.push(
    `<tr><td align="center" style="padding:0 0 18px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="56" style="width:56px;"><tr><td style="border-top:1px solid ${ink.border};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`,
  );

  // 3 — wordmark
  rows.push(
    `<tr><td align="center" style="font-family:${fontBody};font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${ink.strong};padding:0 0 12px 0;">${escapeHtml(brand.display_name)}</td></tr>`,
  );

  // 4 — address, own line so it wraps by words, never mid-word
  if (brand.address) {
    rows.push(
      `<tr><td align="center" style="font-family:${fontBody};font-size:12px;line-height:1.7;color:${ink.muted};padding:0 0 6px 0;">${escapeHtml(brand.address)}</td></tr>`,
    );
  }

  // 5 — phone · email (two short atoms; fits 320px at 12px)
  const contactBits = [];
  if (brand.phone) contactBits.push(`<span style="color:${ink.muted};">${escapeHtml(brand.phone)}</span>`);
  if (brand.email) contactBits.push(`<a href="mailto:${escapeHtml(brand.email)}" style="color:${accent};text-decoration:none;">${escapeHtml(brand.email)}</a>`);
  if (contactBits.length) {
    rows.push(
      `<tr><td align="center" style="font-family:${fontBody};font-size:12px;line-height:1.7;padding:0 0 6px 0;">${contactBits.join(`<span style="color:${ink.faint};">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`)}</td></tr>`,
    );
  }

  // 6 — website, displayed without protocol
  if (brand.website) {
    rows.push(
      `<tr><td align="center" style="font-family:${fontBody};font-size:12px;line-height:1.7;padding:0 0 6px 0;"><a href="${escapeHtml(brand.website)}" target="_blank" rel="noopener" style="color:${accent};text-decoration:none;letter-spacing:0.5px;">${escapeHtml(displayUrl(brand.website))}</a></td></tr>`,
    );
  }

  // 7 — legal / sign-off line
  if (brand.email_footer_text) {
    rows.push(
      `<tr><td align="center" style="font-family:${fontBody};font-size:11px;line-height:1.8;color:${ink.faint};padding:10px 0 0 0;">${escapeHtml(brand.email_footer_text)}</td></tr>`,
    );
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("\n")}</table>`;
}

/**
 * Wrap inner body HTML in the responsive base layout.
 *
 * @param {string} bodyHtml   inner body HTML from the template
 * @param {Object} brand      decorated brand config
 * @param {string} [preview]  optional preview/preheader text shown after the subject
 *                            line in inbox views. Falls back to brand.display_name.
 */
function wrapInLayout(bodyHtml, brand, preview) {
  const fontHeading = brand.brand_fonts?.heading || "Georgia, 'Times New Roman', serif";
  const fontBody    = brand.brand_fonts?.body    || "Arial, Helvetica, sans-serif";
  const accent      = brand.accent_colour;
  const secondary   = brand.secondary_colour;
  const headerInk   = brand.surface_ink;

  // Logo (transparent PNG recommended — scripts/fixLogoBackground.js) or a
  // letter-spaced wordmark when no logo is configured. Fixed display width
  // 150px keeps Outlook honest; height auto preserves ratio.
  const logoHtml = brand.logo_path
    ? `<img src="${escapeHtml(brand.logo_path)}" alt="${escapeHtml(brand.display_name)}" width="150" style="display:block;margin:0 auto;width:150px;max-width:60%;height:auto;border:0;" />`
    : `<span style="font-family:${fontHeading};font-size:21px;letter-spacing:5px;text-transform:uppercase;color:${headerInk.strong};">${escapeHtml(brand.display_name)}</span>`;

  // Preheader: use template-supplied preview text, padded with invisible
  // characters so email clients don't pull body copy in after it.
  const previewText = escapeHtml(preview || brand.display_name);
  const previewPadding = "&nbsp;&zwnj;".repeat(90);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(brand.display_name)}</title>
  <!--[if mso]>
  <style>table,td{font-family:Arial,Helvetica,sans-serif !important;}</style>
  <![endif]-->
  <style>
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
      .fluid { width: 100% !important; max-width: 100% !important; height: auto !important; }
      .stack-column { display: block !important; width: 100% !important; }
      .content-padding { padding: 28px 22px 32px 22px !important; }
      .header-padding { padding: 30px 20px !important; }
      .footer-padding { padding: 26px 18px !important; }
      h2 { font-size: 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#efedea;font-family:${fontBody};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Preheader: intentional preview text shown in inbox after subject line -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${previewText}${previewPadding}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#efedea;">
    <tr>
      <td align="center" style="padding:28px 12px;">

        <!-- Email container -->
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(28,26,23,0.08);">

          <!-- Accent hairline -->
          <tr><td style="height:3px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- Logo header -->
          <tr>
            <td align="center" class="header-padding" style="padding:36px 24px;background-color:${secondary};">
              ${logoHtml}
            </td>
          </tr>

          <!-- Body content -->
          <tr>
            <td class="content-padding" style="padding:36px 44px 40px 44px;font-family:${fontBody};font-size:15px;line-height:1.65;color:#3d3833;">
              ${bodyHtml}
              <!--hub-signature-slot-->
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="footer-padding" style="background-color:${secondary};padding:30px 32px;">
              ${renderFooter(brand, fontBody)}
            </td>
          </tr>

        </table>
        <!-- /Email container -->

        <!-- Spacer below card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:28px;font-size:0;line-height:0;">&nbsp;</td></tr></table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = { renderEmail, resolveBrand, decorateBrand, wrapInLayout };
