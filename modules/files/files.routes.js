"use strict";

// ─────────────────────────────────────────────────────────────
// Files — generic public-friendly file upload endpoint.
//
// Used by the storefront proof-of-payment flow, where the
// customer has no JWT but needs to attach an image to a
// pending campaign order. Mounted in app.js BEFORE /api so
// no verifyToken runs.
//
// Hardening:
//   - 5MB max file size (multer limits)
//   - image MIME whitelist (no executables / archives)
//   - rate-limited at the route level
//   - storage uses the same lib/storage abstraction as /uploads
// ─────────────────────────────────────────────────────────────

const express = require("express");
const multer = require("multer");
const path = require("path");
const rateLimit = require("express-rate-limit");
const config = require("../../config/config");
const logger = require("../../config/logger");
const storage = require("../../lib/storage");
const { optimizeImage } = require("../../lib/images/optimizeImage");

const router = express.Router();

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(
        new Error("Unsupported file type. Allowed: PNG, JPEG, WebP, PDF."),
      );
    }
    cb(null, true);
  },
});

// Cap unauthenticated upload attempts.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads, please try again later" },
});

function publicUrlFor(filePath) {
  if (config.storage && config.storage.driver === "s3") {
    const bucket = config.storage.s3Bucket;
    const region = config.storage.s3Region;
    return `https://${bucket}.s3.${region}.amazonaws.com/${filePath}`;
  }
  const base =
    (config.app && config.app.hubBaseUrl) ||
    process.env.HUB_BASE_URL ||
    "";
  return `${base.replace(/\/+$/, "")}/${filePath}`;
}

// POST /api/files/upload — multipart/form-data with single `file` field
router.post("/upload", uploadLimiter, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  try {
    let outBuffer = req.file.buffer;
    let ext = path.extname(req.file.originalname).toLowerCase() || "";
    // Compress receipt images to WebP (PDFs pass through untouched).
    if (req.file.mimetype !== "application/pdf") {
      const opt = await optimizeImage(req.file.buffer, {
        mimeType: req.file.mimetype,
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 80,
      });
      if (opt.optimised) {
        outBuffer = opt.buffer;
        ext = `.${opt.extension}`;
      }
    }
    // Random filename so customers can't enumerate /uploads listing.
    const id = require("crypto").randomBytes(16).toString("hex");
    const safe = `${id}${ext}`;
    const result = await storage.save(outBuffer, safe, "proofs");

    const url = publicUrlFor(result.filePath);
    logger.info(
      `[files] proof upload: ${url} (${result.fileSize} bytes) from ${req.ip}`,
    );
    res.json({ url });
  } catch (err) {
    logger.error("[files] upload failed", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

module.exports = router;
