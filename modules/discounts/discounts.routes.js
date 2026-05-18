"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./discounts.service");

// ─────────────────────────────────────────────────────────────
// modules/discounts/discounts.routes — mounted at /api/discounts
//
// The promotions catalogue: reusable discount rules an admin
// defines for POS / quotations to apply.
//   GET    /discounts            — list (filters: active_only, valid_now)
//   GET    /discounts/:id        — one rule
//   POST   /discounts            — create a rule
//   PATCH  /discounts/:id        — edit a rule
//   DELETE /discounts/:id        — soft-delete (is_active=false)
// ─────────────────────────────────────────────────────────────

router.get(
  "/",
  query("active_only").optional().isBoolean(),
  query("valid_now").optional().isBoolean(),
  validate,
  can("discounts", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.list(req.business, req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/:id",
  param("id").isUUID(),
  validate,
  can("discounts", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getById(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/",
  body("discount_name").isString().notEmpty(),
  body("discount_type").isIn(["percentage", "fixed"]),
  body("value").isFloat({ gt: 0 }),
  body("applies_to").optional().isIn(["all", "product", "category"]),
  body("valid_from").optional().isISO8601(),
  body("valid_to").optional().isISO8601(),
  body("min_order_value").optional().isFloat({ min: 0 }),
  body("usage_limit").optional().isInt({ min: 1 }),
  validate,
  can("discounts", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.create(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/:id",
  param("id").isUUID(),
  body("discount_name").optional().isString(),
  body("discount_type").optional().isIn(["percentage", "fixed"]),
  body("value").optional().isFloat({ gt: 0 }),
  body("applies_to").optional().isIn(["all", "product", "category"]),
  body("valid_from").optional().isISO8601(),
  body("valid_to").optional().isISO8601(),
  body("min_order_value").optional().isFloat({ min: 0 }),
  body("usage_limit").optional().isInt({ min: 1 }),
  body("is_active").optional().isBoolean(),
  validate,
  can("discounts", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.update(req.business, req.params.id, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/:id",
  param("id").isUUID(),
  validate,
  can("discounts", "delete"),
  async (req, res, next) => {
    try {
      res.json(await service.remove(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
