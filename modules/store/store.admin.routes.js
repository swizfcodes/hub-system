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

module.exports = router;
