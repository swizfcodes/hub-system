"use strict";

// ─────────────────────────────────────────────────────────────
// lib/images/optimizeImage.js
//
// Compress + convert raster uploads to WebP before they hit storage.
//
// Added because a ~7 MB JPEG hero banner was timing out on upload and
// bloating the public landing page. WebP at q≈80 typically shrinks a
// photographic JPEG/PNG by 70–90 % with no visible loss of quality.
//
// Behaviour:
//   - JPEG / PNG / WebP / TIFF / AVIF / GIF → auto-oriented, resized to
//     fit within maxWidth × maxHeight (never upscaled) and re-encoded as
//     WebP.
//   - Anything else (PDF, SVG, unknown)     → returned untouched, so a
//     caller can safely pipe EVERY upload through this helper.
//   - On any failure (corrupt file, sharp binary missing, output larger
//     than the source) the ORIGINAL buffer is returned unchanged —
//     optimisation must never block or corrupt an upload.
//
// `sharp` is declared in package.json. If the native binary is not yet
// installed, run `npm install` (or `npm install sharp`). Until then this
// helper degrades gracefully to a pass-through.
// ─────────────────────────────────────────────────────────────

const logger = require("../../config/logger");

let sharp = null;
try {
  // Defensive require so a missing native binary can never crash boot.
  // eslint-disable-next-line global-require
  sharp = require("sharp");
} catch (err) {
  logger.warn(
    `[images] sharp unavailable (${err.message}); image optimisation disabled — run "npm install".`,
  );
}

// MIME types sharp can decode and that we want to convert to WebP.
const OPTIMISABLE = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/avif",
  "image/gif",
]);

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/tiff": "tiff",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

function extFromMime(mime = "") {
  return EXT_BY_MIME[String(mime).toLowerCase()] || "bin";
}

/**
 * Optimise an uploaded image buffer.
 *
 * @param {Buffer} buffer            raw uploaded bytes
 * @param {Object} [opts]
 * @param {string} [opts.mimeType]   source MIME type (decides whether we touch it)
 * @param {number} [opts.maxWidth]   max output width  (default 1920)
 * @param {number} [opts.maxHeight]  max output height (default 1920)
 * @param {number} [opts.quality]    WebP quality 1–100 (default 80)
 * @returns {Promise<{buffer:Buffer, mimeType:string, extension:string,
 *                     optimised:boolean, originalSize:number, optimisedSize:number}>}
 */
async function optimizeImage(buffer, opts = {}) {
  const {
    mimeType = "",
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 80,
  } = opts;

  const originalSize = Buffer.isBuffer(buffer) ? buffer.length : 0;

  const passthrough = (mt = mimeType, ext) => ({
    buffer,
    mimeType: mt,
    extension: ext || extFromMime(mt),
    optimised: false,
    originalSize,
    optimisedSize: originalSize,
  });

  if (
    !sharp ||
    !Buffer.isBuffer(buffer) ||
    !OPTIMISABLE.has(String(mimeType).toLowerCase())
  ) {
    return passthrough();
  }

  try {
    const out = await sharp(buffer, {
      animated: String(mimeType).toLowerCase() === "image/gif",
    })
      .rotate() // honour EXIF orientation, then metadata is dropped on encode
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality, effort: 4 })
      .toBuffer();

    // If WebP somehow came out bigger (e.g. an already-tiny source), keep
    // the smaller original.
    if (out.length >= originalSize && originalSize > 0) {
      return passthrough();
    }

    return {
      buffer: out,
      mimeType: "image/webp",
      extension: "webp",
      optimised: true,
      originalSize,
      optimisedSize: out.length,
    };
  } catch (err) {
    logger.error(
      `[images] optimisation failed (${err.message}); storing original bytes.`,
    );
    return passthrough();
  }
}

module.exports = { optimizeImage, OPTIMISABLE, extFromMime };
