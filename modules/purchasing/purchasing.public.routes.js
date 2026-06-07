"use strict";

// ─────────────────────────────────────────────────────────────
// Purchasing public routes — no auth middleware.
// These are token-gated instead: suppliers access them via
// a portal_access_token sent by the internal team.
//
// Mounted in routes/index.js BEFORE the `protect` middleware:
//   router.use("/purchasing/public", require("../modules/purchasing/purchasing.public.routes"));
// ─────────────────────────────────────────────────────────────

const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const svc = require("./purchasing.service");

// GET /purchasing/public/rfq/:token
// Supplier uses their portal token to view the RFQ they were invited to.
router.get("/rfq/:token", async (req, res, next) => {
  try {
    const data = await svc.getRFQByToken(req.params.token);
    res.json(data);
  } catch (e) {
    next(e);
  }
});

// POST /purchasing/public/rfq/submit
// Supplier submits their price quote for a specific RFQ.
router.post(
  "/rfq/submit",
  body("token").notEmpty(),
  body("business").notEmpty(),
  body("rfq_id").isUUID(),
  body("supplier_id").isUUID(),
  body("lines").isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { business, rfq_id, supplier_id, lines, notes } = req.body;
      const result = await svc.submitSupplierQuote(business, {
        rfq_id,
        supplier_id,
        lines,
        notes,
      });
      res.status(201).json(result);
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
