"use strict";

// ─────────────────────────────────────────────────────────────
// PUBLIC BRANDING ENDPOINT — GET /api/branding
//
// Unauthenticated by design: the login page needs the product
// name, fonts and colour theme before any token exists. Returns
// display-level data only (no credentials, keys or settings
// beyond what every rendered page exposes anyway).
// ─────────────────────────────────────────────────────────────

const express = require("express");
const router = express.Router();
const service = require("./settings.service");

router.get("/", async (req, res, next) => {
  try {
    // Branding changes rarely; let browsers/CDNs cache briefly so
    // every page load doesn't hit the DB.
    res.set("Cache-Control", "public, max-age=60");
    res.json(await service.getPublicBranding());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
