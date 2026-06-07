"use strict";

const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const svc = require("./loyalty.service");

// ── TIER MANAGEMENT (settings.approve required) ──────────────

// GET /loyalty/tiers — list all tiers
router.get("/tiers", can("loyalty", "view"), async (req, res, next) => {
  try {
    const tiers = await svc.getTiers(req.business);
    res.json({ data: tiers });
  } catch (err) {
    next(err);
  }
});

// POST /loyalty/tiers — create new tier
router.post(
  "/tiers",
  body("tier_name").isString().notEmpty(),
  body("min_points").isInt({ min: 0 }),
  body("max_points").optional({ nullable: true }).isInt({ min: 0 }),
  body("benefits").optional({ nullable: true }).isObject(),
  body("colour").optional().isString(),
  body("display_order").optional().isInt({ min: 0 }),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      const tier = await svc.createTier(
        req.business,
        {
          tierName: req.body.tier_name,
          minPoints: req.body.min_points,
          maxPoints: req.body.max_points || null,
          benefits: req.body.benefits || {},
          colour: req.body.colour || "#64748B",
          displayOrder: req.body.display_order || 0,
        },
        req.user,
      );
      res.status(201).json(tier);
    } catch (err) {
      next(err);
    }
  },
);

// GET /loyalty/tiers/:tierId — get single tier
router.get(
  "/tiers/:tierId",
  param("tierId").isUUID(),
  validate,
  can("loyalty", "view"),
  async (req, res, next) => {
    try {
      const tier = await svc.getTier(req.business, req.params.tierId);
      res.json(tier);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /loyalty/tiers/:tierId — update tier
router.patch(
  "/tiers/:tierId",
  param("tierId").isUUID(),
  body("tier_name").optional().isString(),
  body("min_points").optional().isInt({ min: 0 }),
  body("max_points").optional({ nullable: true }).isInt({ min: 0 }),
  body("benefits").optional({ nullable: true }).isObject(),
  body("colour").optional().isString(),
  body("display_order").optional().isInt({ min: 0 }),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      const tier = await svc.updateTier(
        req.business,
        req.params.tierId,
        {
          tierName: req.body.tier_name,
          minPoints: req.body.min_points,
          maxPoints: req.body.max_points,
          benefits: req.body.benefits,
          colour: req.body.colour,
          displayOrder: req.body.display_order,
        },
        req.user,
      );
      res.json(tier);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /loyalty/tiers/:tierId — delete tier
router.delete(
  "/tiers/:tierId",
  param("tierId").isUUID(),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      const result = await svc.deleteTier(
        req.business,
        req.params.tierId,
        req.user,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /loyalty/tiers/reorder — reorder tiers
router.put(
  "/tiers/reorder",
  body("tiers").isArray(),
  body("tiers.*.tier_id").isUUID(),
  body("tiers.*.display_order").isInt({ min: 0 }),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      const result = await svc.reorderTiers(
        req.business,
        req.body.tiers,
        req.user,
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// ── CONTACT LOYALTY (public endpoints) ─────────────────────

// GET /loyalty/:contactId — balance + current tier + recent history
router.get("/:contactId", can("loyalty", "view"), async (req, res, next) => {
  try {
    const result = await svc.getHistory(req.business, req.params.contactId, {
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /loyalty/:contactId/redeem — spend points at POS
router.post(
  "/:contactId/redeem",
  can("loyalty", "create"),
  async (req, res, next) => {
    try {
      const { points, reference_type, reference_id } = req.body;
      const row = await svc.redeemPoints(
        req.business,
        req.params.contactId,
        points,
        reference_type || "pos_transaction",
        reference_id || null,
        req.user,
      );
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },
);

// POST /loyalty/:contactId/award — manual bonus or adjustment (manager only)
router.post(
  "/:contactId/award",
  can("loyalty", "approve"),
  async (req, res, next) => {
    try {
      const { points, transaction_type, notes } = req.body;
      const row = await svc.manualAward(
        req.business,
        req.params.contactId,
        { points, transaction_type, notes },
        req.user,
      );
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
