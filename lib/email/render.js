"use strict";

const { getBusinessConfig } = require("../../config/businesses");
const config = require("../../config/config");
const logger = require("../../config/logger");

// ─────────────────────────────────────────────────────────────
// EMAIL TEMPLATE RENDERER
//
// Produces fully branded, responsive HTML emails driven entirely
// by shared.business_config fields set in Business Setup. No
// hardcoded brand names, colours, logos, or addresses.
//
// Usage:
//   const { renderEmail } = require('./render');
//   const html = renderEmail('invite', 'jewelry', { name: 'Tom', link: '...' });
//
// Template contract:
//   Each template is a function(data, brand) => { subject, body }
//   where `body` is the inner HTML (no wrapper) and `brand` is the
//   resolved business_config row.
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
  const hubBaseUrl = config.app.hubBaseUrl || "";
  return {
    display_name:     raw.display_name     || "Hub Platform",
    legal_name:       raw.legal_name       || "",
    address:          raw.address           || "",
    phone:            raw.phone             || "",
    email:            raw.email             || "",
    website:          raw.website           || "",
    logo_path:        resolveLogoUrl(raw.logo_path, hubBaseUrl),
    accent_colour:    raw.accent_colour     || "#C9A86C",
    secondary_colour: raw.secondary_colour  || "#F5F0EB",
    brand_fonts:      raw.brand_fonts       || {},
    social_links:     raw.social_links      || {},
    email_footer_text: raw.email_footer_text || "",
    hub_base_url:     hubBaseUrl,
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

// ─────────────────────────────────────────────────────────────
// SOCIAL ICON SVG DATA
// Inline SVGs so we don't depend on external image hosting.
// Rendered at 24×24 in the footer; only populated links appear.
// ─────────────────────────────────────────────────────────────
const SOCIAL_ICONS = {
  instagram: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="__COLOR__" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
  facebook:  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="__COLOR__" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`,
  tiktok:    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="__COLOR__" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/></svg>`,
  twitter:   `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="__COLOR__" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l11.733 16h4.267l-11.733 -16h-4.267z"/><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"/></svg>`,
  youtube:   `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="__COLOR__" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>`,
  linkedin:  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="__COLOR__" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>`,
};

function renderSocialIcons(socialLinks, accentColour) {
  const entries = Object.entries(socialLinks || {}).filter(([, url]) => url);
  if (!entries.length) return "";

  const icons = entries
    .map(([platform, url]) => {
      const svg = SOCIAL_ICONS[platform];
      if (!svg) return "";
      const coloured = svg.replace(/__COLOR__/g, accentColour);
      // Encode SVG for use as img src (more email-client compatible than inline SVG)
      const encoded = `data:image/svg+xml,${encodeURIComponent(coloured)}`;
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;margin:0 6px;text-decoration:none;">
        <img src="${encoded}" alt="${platform}" width="24" height="24" style="display:block;border:0;" />
      </a>`;
    })
    .filter(Boolean)
    .join("");

  return `<tr><td align="center" style="padding:16px 0 8px 0;">${icons}</td></tr>`;
}

/**
 * Wrap inner body HTML in the responsive base layout.
 *
 * @param {string} bodyHtml   inner body HTML from the template
 * @param {Object} brand      resolved brand config
 * @param {string} [preview]  optional preview/preheader text shown after the subject
 *                            line in inbox views. Falls back to brand.display_name.
 */
function wrapInLayout(bodyHtml, brand, preview) {
  const fontHeading = brand.brand_fonts?.heading || "Georgia, serif";
  const fontBody    = brand.brand_fonts?.body    || "Arial, Helvetica, sans-serif";
  const accent      = brand.accent_colour;
  const secondary   = brand.secondary_colour;
  const logoHtml    = brand.logo_path
    ? `<img src="${escapeHtml(brand.logo_path)}" alt="${escapeHtml(brand.display_name)}" width="140" style="display:block;margin:0 auto;max-width:140px;height:auto;" />`
    : `<span style="font-family:${fontHeading};font-size:24px;font-weight:bold;color:${accent};">${escapeHtml(brand.display_name)}</span>`;

  // Footer pieces — only render non-empty values
  const footerParts = [];
  if (brand.address) footerParts.push(`<span style="color:#444444;">${escapeHtml(brand.address)}</span>`);
  if (brand.phone)   footerParts.push(`<span style="color:#444444;">${escapeHtml(brand.phone)}</span>`);
  if (brand.email)   footerParts.push(`<a href="mailto:${escapeHtml(brand.email)}" style="color:${accent};text-decoration:none;">${escapeHtml(brand.email)}</a>`);
  if (brand.website) footerParts.push(`<a href="${escapeHtml(brand.website)}" style="color:${accent};text-decoration:none;">${escapeHtml(brand.website)}</a>`);

  const socialIconsHtml = renderSocialIcons(brand.social_links, accent);

  // Preheader: use template-supplied preview text, padded with invisible characters
  // so email clients don't pull in body copy after it.
  const previewText = escapeHtml(preview || brand.display_name);
  // 90 zero-width non-joiners pad the preheader to prevent bleed-through in Gmail
  const previewPadding = "&nbsp;&zwnj;".repeat(90);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(brand.display_name)}</title>
  <!--[if mso]>
  <style>table,td{font-family:Arial,Helvetica,sans-serif !important;}</style>
  <![endif]-->
  <style>
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .fluid { width: 100% !important; max-width: 100% !important; height: auto !important; }
      .stack-column { display: block !important; width: 100% !important; }
      .content-padding { padding: 24px 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:${fontBody};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <!-- Preheader: intentional preview text shown in inbox after subject line -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${previewText}${previewPadding}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <!-- Email container -->
        <table role="presentation" class="email-container" width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

          <!-- Accent bar -->
          <tr><td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>

          <!-- Logo header -->
          <tr>
            <td align="center" style="padding:32px 24px 16px 24px;background-color:${secondary};">
              ${logoHtml}
            </td>
          </tr>

          <!-- Body content -->
          <tr>
            <td class="content-padding" style="padding:24px 40px 32px 40px;font-family:${fontBody};font-size:15px;line-height:1.6;color:#333333;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:${secondary};padding:24px 32px;border-top:1px solid rgba(0,0,0,0.06);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${socialIconsHtml}
                ${footerParts.length ? `<tr><td align="center" style="font-family:${fontBody};font-size:12px;line-height:1.8;color:#444444;padding:8px 0;">
                  ${footerParts.join("&nbsp;&nbsp;·&nbsp;&nbsp;")}
                </td></tr>` : ""}
                ${brand.email_footer_text ? `<tr><td align="center" style="font-family:${fontBody};font-size:11px;line-height:1.5;color:#555555;padding:8px 0 0 0;">
                  ${escapeHtml(brand.email_footer_text)}
                </td></tr>` : ""}
              </table>
            </td>
          </tr>

        </table>
        <!-- /Email container -->

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

module.exports = { renderEmail, resolveBrand, wrapInLayout };
