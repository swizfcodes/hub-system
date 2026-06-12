"use strict";

const fs = require("fs");
const path = require("path");
const config = require("../../config/config");
const logger = require("../../config/logger");
const { readableOn } = require("./colors");

// ─────────────────────────────────────────────────────────────
// lib/email/assets — hosted images for email footers.
//
// Gmail (and several other clients) strip `data:` URIs, which is how
// social icons used to be embedded — every recipient saw a broken
// image placeholder. Email images must be real, publicly hosted
// files. /uploads is already served publicly (the brand logo loads
// from there), so we rasterise each icon once per brand colour into
// uploads/email-assets/ and reference it by absolute URL.
//
// Generation happens at boot (ensureSocialIcons, fire-and-forget) and
// after branding changes. Rendering stays synchronous: socialIconUrl
// only reports icons whose file already exists — when generation
// hasn't happened (or sharp is unavailable) the footer falls back to
// elegant text links, never a broken image.
// ─────────────────────────────────────────────────────────────

// 24×24 stroke glyphs, rasterised at 3× (72px) for retina sharpness.
const SOCIAL_SVGS = {
  instagram: `<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>`,
  facebook: `<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>`,
  tiktok: `<path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>`,
  twitter: `<path d="M4 4l11.733 16h4.267l-11.733 -16h-4.267z"/><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"/>`,
  youtube: `<path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.43z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>`,
  linkedin: `<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>`,
};

const PLATFORM_LABELS = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  twitter: "X",
  youtube: "YouTube",
  linkedin: "LinkedIn",
};

function assetsDir() {
  return path.resolve(config.storage?.localPath || "./uploads", "email-assets");
}

function iconFileName(platform, colorHex) {
  return `social-${platform}-${String(colorHex).replace(/^#/, "").toLowerCase()}.png`;
}

function fullSvg(platform, colorHex) {
  const glyph = SOCIAL_SVGS[platform];
  if (!glyph) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="${colorHex}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>`;
}

/**
 * The single colour used for footer icons of a brand — the accent,
 * lifted until it reads on the footer surface. Shared by generation
 * and rendering so the URL always matches a generated file.
 */
function socialIconColor(brand) {
  const surface = brand.secondary_colour || "#F5F0EB";
  const accent = brand.accent_colour || "#C9A86C";
  return readableOn(accent, surface, 3.0);
}

// Existence cache so renders don't stat() per email.
const existsCache = new Map(); // fileName → { exists, at }
const EXISTS_TTL_MS = 60_000;

function iconFileExists(fileName) {
  const hit = existsCache.get(fileName);
  if (hit && Date.now() - hit.at < EXISTS_TTL_MS) return hit.exists;
  let exists = false;
  try {
    exists = fs.existsSync(path.join(assetsDir(), fileName));
  } catch {
    exists = false;
  }
  existsCache.set(fileName, { exists, at: Date.now() });
  return exists;
}

/**
 * Absolute URL for a platform icon in the brand's footer colour, or
 * null when the PNG hasn't been generated — callers must fall back to
 * a text link, never emit a broken <img>.
 */
function socialIconUrl(platform, brand, hubBaseUrl) {
  if (!SOCIAL_SVGS[platform]) return null;
  const base = (hubBaseUrl || "").replace(/\/$/, "");
  if (!base) return null;
  const file = iconFileName(platform, socialIconColor(brand));
  if (!iconFileExists(file)) return null;
  return `${base}/uploads/email-assets/${file}`;
}

/**
 * Rasterise footer icons for every active brand that has social
 * links. Idempotent and best-effort: a missing sharp install or an
 * unwritable uploads dir downgrades footers to text links, it never
 * breaks sending. Called at boot and after branding updates.
 */
async function ensureSocialIcons() {
  let sharp;
  try {
    sharp = require("sharp");
  } catch (err) {
    logger.warn(`[email-assets] sharp unavailable — social icons will render as text links (${err.message})`);
    return { generated: 0, skipped: 0 };
  }

  const { getActiveBusinesses, getBusinessConfig } = require("../../config/businesses");
  const dir = assetsDir();
  await fs.promises.mkdir(dir, { recursive: true });

  let generated = 0;
  let skipped = 0;
  for (const key of getActiveBusinesses()) {
    const brand = getBusinessConfig(key) || {};
    const links = brand.social_links || {};
    const color = socialIconColor(brand);
    for (const platform of Object.keys(links)) {
      if (!links[platform] || !SOCIAL_SVGS[platform]) continue;
      const file = iconFileName(platform, color);
      const target = path.join(dir, file);
      if (fs.existsSync(target)) {
        skipped++;
        continue;
      }
      try {
        await sharp(Buffer.from(fullSvg(platform, color)))
          .resize(72, 72)
          .png()
          .toFile(target);
        existsCache.delete(file);
        generated++;
      } catch (err) {
        logger.warn(`[email-assets] could not render ${platform} icon for ${key}: ${err.message}`);
      }
    }
  }
  if (generated) logger.info(`[email-assets] generated ${generated} social icon(s) in ${dir}`);
  return { generated, skipped };
}

module.exports = {
  SOCIAL_SVGS,
  PLATFORM_LABELS,
  socialIconColor,
  socialIconUrl,
  ensureSocialIcons,
};
