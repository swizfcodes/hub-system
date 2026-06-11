"use strict";

const express = require("express");
const router = express.Router();
const { param, body } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can, canAny } = require("../../middleware/permissions");
const service = require("./dashboards.service");

// GET /api/dashboards/sales
// Requires: sales:view OR pos:view OR invoicing:view
router.get(
  "/sales",
  canAny([
    { module: "sales", action: "view" },
    { module: "pos", action: "view" },
    { module: "invoicing", action: "view" },
  ]),
  async (req, res, next) => {
    try {
      res.json(
        await service.getSalesDashboard(req.business, req.query, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/dashboards/finance
// Requires: accounting:view OR invoicing:view OR expenses:view
router.get(
  "/finance",
  canAny([
    { module: "accounting", action: "view" },
    { module: "invoicing", action: "view" },
    { module: "expenses", action: "view" },
  ]),
  async (req, res, next) => {
    try {
      res.json(await service.getFinanceDashboard(req.business, req.query));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/dashboards/stock
// Requires: stock:view OR catalogue:view OR purchasing:view
router.get(
  "/stock",
  canAny([
    { module: "stock", action: "view" },
    { module: "catalogue", action: "view" },
    { module: "purchasing", action: "view" },
  ]),
  async (req, res, next) => {
    try {
      res.json(await service.getStockDashboard(req.business, req.query));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/dashboards/customers
// Requires: crm:view OR contacts:view
router.get(
  "/customers",
  canAny([
    { module: "crm", action: "view" },
    { module: "contacts", action: "view" },
  ]),
  async (req, res, next) => {
    try {
      res.json(await service.getCustomerDashboard(req.business, req.query));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/dashboards/retail-partners
// Requires: retail-partners:view
router.get(
  "/retail-partners",
  can("retail_partners", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.getRetailPartnerDashboard(req.business, req.query),
      );
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/dashboards/logistics
// Requires: logistics:view
router.get(
  "/logistics",
  can("logistics", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getLogisticsDashboard(req.business, req.query));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/dashboards/overview — combined high-level summary
// Requires at least one data-producing module to prevent open access.
router.get(
  "/overview",
  canAny([
    { module: "sales", action: "view" },
    { module: "invoicing", action: "view" },
    { module: "accounting", action: "view" },
    { module: "stock", action: "view" },
    { module: "logistics", action: "view" },
    { module: "crm", action: "view" },
  ]),
  async (req, res, next) => {
    try {
      res.json(await service.getOverview(req.business, req.query, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/dashboards/yesterday — morning-briefing summary (contains revenue)
// Requires: sales:view OR invoicing:view OR pos:view
router.get(
  "/yesterday",
  canAny([
    { module: "sales", action: "view" },
    { module: "invoicing", action: "view" },
    { module: "pos", action: "view" },
  ]),
  async (req, res, next) => {
    try {
      res.json(await service.getYesterdaySummary(req.business, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// ─── DASHBOARD CONFIGS ───────────────────────────────────────
// Per-user saved dashboard layouts.
//   GET    /dashboards/configs        — list (own only)
//   GET    /dashboards/configs/:id    — one
//   POST   /dashboards/configs        — create
//   PATCH  /dashboards/configs/:id    — edit
//   DELETE /dashboards/configs/:id    — delete

router.get("/configs", can("dashboards", "view"), async (req, res, next) => {
  try {
    res.json(await service.listDashboardConfigs(req.business, req.user));
  } catch (e) {
    next(e);
  }
});

router.get(
  "/configs/:id",
  param("id").isUUID(),
  validate,
  can("dashboards", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.getDashboardConfig(req.business, req.params.id, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/configs",
  body("dashboard_name").isString().notEmpty(),
  body("layout").optional().isArray(),
  body("widgets").optional().isArray(),
  body("is_default").optional().isBoolean(),
  validate,
  can("dashboards", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.createDashboardConfig(req.business, req.body, req.user),
        );
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/configs/:id",
  param("id").isUUID(),
  body("dashboard_name").optional().isString(),
  body("layout").optional().isArray(),
  body("widgets").optional().isArray(),
  body("is_default").optional().isBoolean(),
  validate,
  can("dashboards", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateDashboardConfig(
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
  "/configs/:id",
  param("id").isUUID(),
  validate,
  can("dashboards", "delete"),
  async (req, res, next) => {
    try {
      res.json(
        await service.deleteDashboardConfig(
          req.business,
          req.params.id,
          req.user,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);
module.exports = router;
