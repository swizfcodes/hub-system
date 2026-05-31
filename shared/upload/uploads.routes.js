"use strict";

// ─────────────────────────────────────────────────────────────
// uploads.routes — file upload surface
//
// Mounted in routes/index.js as:
//   router.use("/uploads", protect, require("../shared/uploads/uploads.routes"));
//
// Storage is delegated to the existing storage abstraction
// (config/storage.js → lib/storage/local.js OR lib/storage/s3.js).
// Switching STORAGE_DRIVER=s3 in env makes this endpoint store to S3
// with zero code changes — the URL builder below detects which
// driver is active and returns the correct public URL.
//
// Endpoints:
//   POST /uploads/logo  — business logo (square image)
// ─────────────────────────────────────────────────────────────

const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer");
const { body } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const config = require("../../config/config");
const logger = require("../../config/logger");
const storage = require("../../lib/storage");
const { optimizeImage } = require("../../lib/images/optimizeImage");

// ── Multer (memory storage — we hand the buffer to lib/storage) ─
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(
        new Error(
          `Unsupported logo type "${file.mimetype}". Use PNG, JPG, WEBP or SVG.`,
        ),
      );
    }
    cb(null, true);
  },
});

/**
 * Build a public URL from the storage filePath. For local driver the
 * file is served by server.js at /uploads/<filePath>. For S3 the
 * direct S3 URL is constructed from bucket + region + key.
 *
 * NOTE: If you front S3 with CloudFront, replace the S3 URL builder
 * with the CloudFront origin. Local dev keeps using the express
 * static mount (configured in server.js below routes mounting).
 */
function publicUrlFor(filePath) {
  if (config.storage.driver === "s3") {
    const bucket = config.storage.s3Bucket;
    const region = config.storage.s3Region;
    return `https://${bucket}.s3.${region}.amazonaws.com/${filePath}`;
  }
  // Local — server.js must serve config.storage.localPath at /uploads
  return `/uploads/${filePath.replace(/^\/+/, "")}`;
}

// ─────────────────────────────────────────────────────────────
// POST /uploads/logo
//
// Body (multipart/form-data):
//   file:         the image file
//   business_key: which business this logo is for (used in filename)
//
// Response 201:
//   { url, filename, filePath, size, sha256 }
//
// Permission: settings.edit
// ─────────────────────────────────────────────────────────────
router.post(
  "/logo",
  can("settings", "edit"),
  uploadLogo.single("file"),
  body("business_key")
    .isString()
    .notEmpty()
    .matches(/^[a-z][a-z0-9_]*$/),
  validate,
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file provided" });
      }
      // Use the business_key in the filename so files are easy to
      // identify in a flat S3 listing or local directory.
      let outBuffer = req.file.buffer;
      let ext = path.extname(req.file.originalname).toLowerCase() || ".png";
      // Compress raster logos to WebP. SVGs are vector — leave them as-is.
      if (req.file.mimetype !== "image/svg+xml") {
        const opt = await optimizeImage(req.file.buffer, {
          mimeType: req.file.mimetype,
          maxWidth: 1024,
          maxHeight: 1024,
          quality: 85,
        });
        if (opt.optimised) {
          outBuffer = opt.buffer;
          ext = `.${opt.extension}`;
        }
      }
      const safe = `${req.body.business_key}${ext}`;
      const result = await storage.save(outBuffer, safe, "logos");

      const url = publicUrlFor(result.filePath);
      logger.info(
        `[uploads] Logo saved: ${url} (${result.fileSize} bytes) for ${req.body.business_key}`,
      );

      res.status(201).json({
        url,
        filename: path.basename(result.filePath),
        filePath: result.filePath,
        size: result.fileSize,
        sha256: result.sha256,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── Multer error formatter ──────────────────────────────────
router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        message: `File too large. Max ${MAX_SIZE_BYTES / 1024 / 1024}MB.`,
      });
    }
    return res.status(400).json({ message: err.message });
  }
  if (err?.message?.startsWith("Unsupported logo type")) {
    return res.status(415).json({ message: err.message });
  }
  next(err);
});

module.exports = router;
