"use strict";

const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./retail-partners.service");

// ─────────────────────────────────────────────────────────────
// PARTNER CRUD
// ─────────────────────────────────────────────────────────────

router.get("/", can("retail_partners", "view"), async (req, res, next) => {
  try {
    res.json(await service.listPartners(req.business, req.query));
  } catch (e) {
    next(e);
  }
});

router.get(
  "/overview",
  can("retail_partners", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getAllPartnersOverview(req.business));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/:id/dashboard",
  param("id").isUUID(),
  validate,
  can("retail_partners", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getPartnerDashboard(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/",
  body("contact_id").isUUID(),
  body("partner_code").isString().notEmpty(),
  body("arrangement_type").isIn(["consignment", "wholesale", "both"]),
  body("consignment_margin_pct").optional().isFloat({ min: 0, max: 100 }),
  body("wholesale_discount_pct").optional().isFloat({ min: 0, max: 100 }),
  body("payment_terms_days").optional().isInt({ min: 0 }),
  body("settlement_cycle").optional().isIn(["weekly", "biweekly", "monthly"]),
  body("credit_limit").optional().isFloat({ min: 0 }),
  validate,
  can("retail_partners", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createPartner(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/:id",
  param("id").isUUID(),
  body("arrangement_type")
    .optional()
    .isIn(["consignment", "wholesale", "both"]),
  body("settlement_cycle").optional().isIn(["weekly", "biweekly", "monthly"]),
  validate,
  can("retail_partners", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updatePartner(
          req.business,
          req.params.id,
          req.body,
          req.user,
        ),
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
  can("retail_partners", "delete"),
  async (req, res, next) => {
    try {
      res.json(
        await service.deactivatePartner(req.business, req.params.id, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// CONSIGNMENT
// ─────────────────────────────────────────────────────────────

router.get(
  "/consignments/stock",
  can("retail_partners", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listConsignmentStock(req.business, req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/consignments",
  body("partner_id").isUUID(),
  body("from_location_id").isUUID(),
  body("items").isArray({ min: 1 }),
  body("items.*.product_id").isUUID(),
  body("items.*.quantity").isInt({ min: 1 }),
  body("items.*.agreed_price").isFloat({ min: 0 }),
  body("sent_date").optional().isISO8601(),
  validate,
  can("retail_partners", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.sendConsignment(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/consignments/:id/recall",
  param("id").isUUID(),
  body("return_to_location_id").isUUID(),
  body("quantity").optional().isInt({ min: 1 }),
  validate,
  can("retail_partners", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.recallConsignment(
          req.business,
          req.params.id,
          req.body,
          req.user,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PARTNER-REPORTED SALES
// ─────────────────────────────────────────────────────────────

router.get("/sales", can("retail_partners", "view"), async (req, res, next) => {
  try {
    res.json(await service.listPartnerSales(req.business, req.query));
  } catch (e) {
    next(e);
  }
});

router.post(
  "/sales",
  body("consignment_id").isUUID(),
  body("partner_id").isUUID(),
  body("quantity_sold").isInt({ min: 1 }),
  body("sale_price").isFloat({ min: 0 }),
  body("sale_date").isISO8601(),
  validate,
  can("retail_partners", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.reportPartnerSale(req.business, req.body, req.user),
        );
    } catch (e) {
      next(e);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// SETTLEMENTS
// ─────────────────────────────────────────────────────────────

router.get(
  "/settlements",
  can("retail_partners", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listSettlements(req.business, req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/settlements/:id",
  param("id").isUUID(),
  validate,
  can("retail_partners", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getSettlement(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/settlements",
  body("partner_id").isUUID(),
  body("period_start").isISO8601(),
  body("period_end").isISO8601(),
  validate,
  can("retail_partners", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.generateSettlement(req.business, req.body, req.user),
        );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/settlements/:id/send",
  param("id").isUUID(),
  validate,
  can("retail_partners", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.markSettlementSent(req.business, req.params.id, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/settlements/:id/mark-paid",
  param("id").isUUID(),
  validate,
  can("retail_partners", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.markSettlementPaid(req.business, req.params.id, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// WHOLESALE
// ─────────────────────────────────────────────────────────────

router.post(
  "/wholesale-dispatch",
  body("partner_id").isUUID(),
  body("from_location_id").isUUID(),
  body("items").isArray({ min: 1 }),
  body("items.*.product_id").isUUID(),
  body("items.*.quantity").isInt({ min: 1 }),
  body("items.*.unit_price").isFloat({ min: 0 }),
  validate,
  can("retail_partners", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.recordWholesaleDispatch(
            req.business,
            req.body,
            req.user,
          ),
        );
    } catch (e) {
      next(e);
    }
  },
);

// Parametric single-partner fetch — declared LAST so literal paths like
// /overview, /sales, /settlements, /consignments aren't captured as an :id.
router.get(
  "/:id",
  param("id").isUUID(),
  validate,
  can("retail_partners", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getPartner(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
