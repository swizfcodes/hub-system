"use strict";

const express = require("express");
const multer = require("multer");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./documents.service");

// In-memory multer storage — we hash and persist via lib/storage,
// no need to write to a temp file first. 25 MB cap protects against
// runaway uploads; can be raised if the use case demands it.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ─── PUBLIC PRODUCT IMAGES ───────────────────────────────────
// Unauthenticated. Only serves documents of type `product_image`
// so no commercial, supplier, or HR documents are ever exposed.

router.get(
  "/:id/image",
  param("id").isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const { buffer, mime_type, document } = await service.downloadDocument(
        req.params.id,
        null,
      );

      if (document.document_type !== "product_image") {
        return res.status(404).json({ message: "Not found" });
      }

      res.set({
        "Content-Type": mime_type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": buffer.length,
        // This is a PUBLIC product image embedded by the storefront, which
        // runs on a different origin. Helmet sets a global CORP of
        // 'same-origin' that would make the browser refuse to render it
        // cross-origin (ERR_BLOCKED_BY_RESPONSE.NotSameOrigin). Relax CORP
        // for this one public route only — all private documents keep the
        // strict global policy.
        "Cross-Origin-Resource-Policy": "cross-origin",
      });
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  },
);

// ─── LIST / GET ──────────────────────────────────────────────

router.get(
  "/",
  query("business").optional().isString(),
  query("document_type").optional().isString(),
  query("reference_type").optional().isString(),
  query("reference_id").optional().isUUID(),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  validate,
  can("documents", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listDocuments(req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/tags",
  query("business").isString().notEmpty(),
  validate,
  can("documents", "view"),
  async (req, res, next) => {
    try {
      res.json({ data: await service.listTags(req.query.business) });
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/:id",
  param("id").isUUID(),
  validate,
  can("documents", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getDocument(req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

// ─── DOWNLOAD ────────────────────────────────────────────────

router.get(
  "/:id/download",
  param("id").isUUID(),
  validate,
  can("documents", "view"),
  async (req, res, next) => {
    try {
      const { buffer, mime_type, filename, verified } =
        await service.downloadDocument(req.params.id, req.user);
      res.set({
        "Content-Type": mime_type,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length,
        // Surface the verification result in a header so the frontend
        // can show the visual checkmark.
        "X-Document-Verified": verified ? "true" : "false",
      });
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/:id/verify",
  param("id").isUUID(),
  validate,
  can("documents", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.verifyDocument(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─── UPLOAD ──────────────────────────────────────────────────

router.post(
  "/",
  upload.single("file"),
  body("business").isString().notEmpty(),
  body("document_type").isString().notEmpty(),
  body("title").optional().isString(),
  body("reference_type").optional().isString(),
  body("reference_id").optional({ checkFalsy: true }).isUUID(),
  body("tags").optional().isString(), // comma-separated in multipart
  validate,
  can("documents", "create"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "file is required" });
      }
      const tags = req.body.tags
        ? req.body.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
      const doc = await service.uploadDocument(
        {
          buffer: req.file.buffer,
          originalFilename: req.file.originalname,
          mimeType: req.file.mimetype,
          business: req.body.business,
          documentType: req.body.document_type,
          title: req.body.title,
          referenceType: req.body.reference_type,
          referenceId: req.body.reference_id,
          tags,
        },
        req.user,
      );
      res.status(201).json(doc);
    } catch (e) {
      next(e);
    }
  },
);

// ─── TAGS ────────────────────────────────────────────────────

router.post(
  "/:id/tags",
  param("id").isUUID(),
  body("tag_name").isString().notEmpty(),
  body("colour")
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage("colour must be a hex code"),
  validate,
  can("documents", "edit"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.addTag(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/:id/tags/:tagName",
  param("id").isUUID(),
  param("tagName").isString().notEmpty(),
  validate,
  can("documents", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.removeTag(req.params.id, req.params.tagName, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ─── SOFT-DELETE ─────────────────────────────────────────────

router.delete(
  "/:id",
  param("id").isUUID(),
  validate,
  can("documents", "delete"),
  async (req, res, next) => {
    try {
      res.json(await service.deleteDocument(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
