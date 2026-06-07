"use strict";

const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./store.service");

// ── SCENTS ADMIN ─────────────────────────────────────────────
// Manage storefront scent presentation (name/tagline/colour/hero image/
// description). Writes store.scents, which the public store read-path
// merges as an override over the product-derived defaults. Editable
// families are limited to those with a published product.

router.get("/scents", can("settings", "view"), async (req, res, next) => {
  try {
    res.json(await service.listEditableScents());
  } catch (err) {
    next(err);
  }
});

router.put(
  "/scents/:family",
  body("name").notEmpty(),
  validate,
  can("settings", "edit"),
  async (req, res, next) => {
    try {
      // family comes from the URL (the scent_family enum value, which can
      // contain spaces/&, so it's URL-decoded by Express automatically).
      res.json(await service.saveScent(req.params.family, req.body));
    } catch (err) {
      next(err);
    }
  },
);

// ── SIGNATURES ADMIN (full CRUD) ─────────────────────────────
// Manage the "Four formats" cards on the storefront homepage —
// name, size/price labels, blurb, hero image and display order.
// Pre-seeded from the storefront's current four formats (migration
// 000049); staff can add, edit, reorder and delete from here.

router.get("/signatures", can("settings", "view"), async (req, res, next) => {
  try {
    res.json(await service.listSignaturesAdmin());
  } catch (err) {
    next(err);
  }
});

router.post(
  "/signatures",
  body("name").notEmpty(),
  validate,
  can("settings", "edit"),
  async (req, res, next) => {
    try {
      // No slug in the URL on create — service derives it from body.slug || name.
      res.status(201).json(await service.saveSignature(null, req.body));
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/signatures/:slug",
  body("name").notEmpty(),
  validate,
  can("settings", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.saveSignature(req.params.slug, req.body));
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/signatures/:slug",
  can("settings", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.deleteSignature(req.params.slug));
    } catch (err) {
      next(err);
    }
  },
);

// ── SETTINGS ADMIN (storefront content) ──────────────────────
// Singleton row driving the homepage hero + "Range" section copy.

router.get("/settings", can("settings", "view"), async (req, res, next) => {
  try {
    res.json(await service.getSettings());
  } catch (err) {
    next(err);
  }
});

router.put("/settings", can("settings", "edit"), async (req, res, next) => {
  try {
    res.json(await service.saveSettings(req.body));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
