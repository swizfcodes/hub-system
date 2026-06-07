"use strict";

const { pool } = require("../../config/db");
const businesses = require("../../config/businesses");
const logger = require("../../config/logger");

// ─────────────────────────────────────────────────────────────
// EMAIL SIGNATURE — Module 12 (Documents & Signatures)
//
// Promise from the product description:
//   "Every staff member has a personal email signature configured
//    with their photo, role, and the business's brand. This is
//    automatically attached to outbound emails sent from the Hub."
//
// What this module does:
//
//   1. render(staffData, businessKey)
//        Given a staff member's profile data and their business,
//        builds the HTML signature block. Pulls brand assets
//        (logo, accent colour, business name, website) from the
//        cached business_config.
//
//   2. getForUser(userId, business)
//        Returns the stored signature row for a (user, business)
//        pair, or null. Cached by (user_id, business).
//
//   3. upsertForUser(userId, business, data)
//        Re-renders and persists. Bumps template_version so a future
//        bulk re-render (e.g. brand refresh) can target specific
//        versions. Invalidates the cache.
//
//   4. appendToHTML(html, userId, business)
//        Convenience for callers: takes an outbound email body and
//        returns body + signature. Handles the no-signature case
//        gracefully (returns body unchanged + debug log).
//
// The renderer is intentionally inline (no external template file)
// so a missing template file never breaks email sends. Brand assets
// come from the in-memory business cache (config/businesses.js), so
// no DB hit per send.
// ─────────────────────────────────────────────────────────────

// In-memory cache: key = `${user_id}::${business}`, value = signature row.
// Same lifetime as the process. Invalidated on upsert.
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TEMPLATE_VERSION = 1;

function cacheKey(userId, business) {
  return `${userId}::${business}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.row;
}

function setCached(key, row) {
  cache.set(key, { row, at: Date.now() });
}

// ─────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────

/**
 * Build the HTML signature block from staff + business brand data.
 *
 * @param {Object} staff      { full_name, job_title, phone, email }
 * @param {string} businessKey
 * @returns {string} HTML
 */
function render(staff, businessKey) {
  if (!staff || !staff.full_name || !staff.job_title) {
    throw new Error("staff.full_name and staff.job_title are required");
  }

  const brand = businesses.getBusinessConfig(businessKey) || {};
  const brandName = brand.display_name || businessKey;
  const accent = brand.accent_colour || "#2563EB";
  const brandPhone = brand.phone || "";
  const brandWebsite = brand.website || "";
  const brandEmail = brand.email || "";
  const logoPath = brand.logo_path || "";

  const phoneRow = staff.phone
    ? `<div style="font-size:12px;color:#555;margin-top:2px">${escapeHtml(staff.phone)}</div>`
    : "";
  const staffEmailRow = staff.email
    ? `<div style="font-size:12px;color:#555;margin-top:2px"><a href="mailto:${escapeHtml(staff.email)}" style="color:${accent};text-decoration:none">${escapeHtml(staff.email)}</a></div>`
    : "";

  // Build the brand contact line conditionally — skip pieces that aren't set.
  const brandBits = [];
  if (brandWebsite) {
    const href = brandWebsite.startsWith("http")
      ? brandWebsite
      : `https://${brandWebsite}`;
    brandBits.push(
      `<a href="${escapeHtml(href)}" style="color:${accent};text-decoration:none">${escapeHtml(brandWebsite)}</a>`,
    );
  }
  if (brandPhone) brandBits.push(escapeHtml(brandPhone));
  if (brandEmail)
    brandBits.push(
      `<a href="mailto:${escapeHtml(brandEmail)}" style="color:${accent};text-decoration:none">${escapeHtml(brandEmail)}</a>`,
    );
  const brandLine = brandBits.length
    ? `<div style="font-size:11px;color:#888;margin-top:6px">${brandBits.join("&nbsp;·&nbsp;")}</div>`
    : "";

  // Logo cell — only render if logo_path is set. We use a public URL
  // (assumes logo_path is publicly servable — e.g. /uploads/logos/X.png).
  const logoCell = logoPath
    ? `<td style="padding-right:14px;vertical-align:top">
         <img src="${escapeHtml(logoPath)}" alt="${escapeHtml(brandName)}"
              style="display:block;width:64px;height:64px;object-fit:contain;border-radius:6px" />
       </td>`
    : "";

  // Each signature is a small two-cell table for predictable email-client
  // rendering. Inline styles only — Gmail/Outlook strip <style> blocks.
  return `
<table cellspacing="0" cellpadding="0" border="0"
       style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
              border-collapse:collapse;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
  <tr>
    ${logoCell}
    <td style="vertical-align:top">
      <div style="font-size:14px;font-weight:600;color:#111">${escapeHtml(staff.full_name)}</div>
      <div style="font-size:12px;color:${accent};margin-top:1px">${escapeHtml(staff.job_title)} · ${escapeHtml(brandName)}</div>
      ${phoneRow}
      ${staffEmailRow}
      ${brandLine}
    </td>
  </tr>
</table>
`.trim();
}

// ─────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────

/**
 * Fetch a stored signature for a user+business. Cached.
 * Returns the row { signature_id, user_id, business, full_name,
 * job_title, phone, html_content, template_version, ... } or null.
 */
async function getForUser(userId, business) {
  if (!userId || !business) return null;
  const k = cacheKey(userId, business);
  const cached = getCached(k);
  if (cached !== null) return cached;

  try {
    const {
      rows: [row],
    } = await pool.query(
      `SELECT signature_id, user_id, business, full_name, job_title,
              phone, html_content, template_version, created_at, updated_at
       FROM shared.email_signatures
       WHERE user_id = $1 AND business = $2`,
      [userId, business],
    );
    setCached(k, row || null);
    return row || null;
  } catch (err) {
    logger.warn(`[signature] DB lookup failed: ${err.message}`);
    return null;
  }
}

/**
 * Insert or update the signature for a user+business pair. Re-renders
 * the HTML from the provided staff data + current business branding,
 * persists, and clears the cache so the next read sees the new copy.
 *
 * @returns the persisted row
 */
async function upsertForUser(
  userId,
  business,
  { full_name, job_title, phone },
) {
  if (!userId) throw new Error("userId is required");
  if (!business) throw new Error("business is required");
  if (!businesses.isValidBusiness(business)) {
    throw new Error(`Unknown business: ${business}`);
  }

  const html = render({ full_name, job_title, phone }, business);

  const {
    rows: [row],
  } = await pool.query(
    `INSERT INTO shared.email_signatures
       (user_id, business, full_name, job_title, phone,
        html_content, template_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, business) DO UPDATE
     SET full_name        = EXCLUDED.full_name,
         job_title        = EXCLUDED.job_title,
         phone            = EXCLUDED.phone,
         html_content     = EXCLUDED.html_content,
         template_version = EXCLUDED.template_version,
         updated_at       = now()
     RETURNING *`,
    [
      userId,
      business,
      full_name,
      job_title,
      phone || null,
      html,
      TEMPLATE_VERSION,
    ],
  );

  invalidateCache(userId, business);
  setCached(cacheKey(userId, business), row);
  return row;
}

/**
 * Remove a signature. Outbound emails from this user/business will no
 * longer have a signature appended (the appendToHTML helper falls back
 * gracefully).
 */
async function deleteForUser(userId, business) {
  const result = await pool.query(
    `DELETE FROM shared.email_signatures
     WHERE user_id = $1 AND business = $2`,
    [userId, business],
  );
  invalidateCache(userId, business);
  return result.rowCount > 0;
}

function invalidateCache(userId, business) {
  cache.delete(cacheKey(userId, business));
}

// ─────────────────────────────────────────────────────────────
// APPEND HELPER
//
// The sender.js sendEmail function calls this when a senderUserId
// + senderBusiness is passed in. Two-line addition there auto-attaches
// the signature to every outbound email.
// ─────────────────────────────────────────────────────────────

/**
 * Append the user's signature to the email body. Idempotent and safe:
 *   - If no signature is stored, returns html unchanged
 *   - If the body already contains the signature_id marker, returns
 *     unchanged (prevents double-append on re-send)
 *
 * @param {string} html       the original email body HTML
 * @param {string} userId
 * @param {string} business
 * @returns {Promise<string>} the augmented HTML
 */
async function appendToHTML(html, userId, business) {
  if (!userId || !business) return html;
  try {
    const sig = await getForUser(userId, business);
    if (!sig || !sig.html_content) return html;

    // Idempotency marker — both halves of the marker must match to be
    // considered a duplicate.
    const marker = `<!--hub-sig:${sig.signature_id}-->`;
    if (html && html.includes(marker)) return html;

    return `${html || ""}\n${marker}\n${sig.html_content}`;
  } catch (err) {
    // Signature is enhancement, not requirement — never fail a send.
    logger.warn(`[signature] append skipped: ${err.message}`);
    return html;
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = {
  render,
  getForUser,
  upsertForUser,
  deleteForUser,
  appendToHTML,
  invalidateCache,
};
