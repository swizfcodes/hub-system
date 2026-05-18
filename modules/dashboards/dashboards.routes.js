"use strict";

const express = require("express");
const router = express.Router();
const { param, body } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./dashboards.service");

// GET /api/dashboards/sales
router.get("/sales", can("dashboards", "view"), async (req, res, next) => {
  try {
    res.json(
      await service.getSalesDashboard(req.business, req.query, req.user),
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboards/finance
router.get("/finance", can("dashboards", "view"), async (req, res, next) => {
  try {
    res.json(await service.getFinanceDashboard(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboards/stock
router.get("/stock", can("dashboards", "view"), async (req, res, next) => {
  try {
    res.json(await service.getStockDashboard(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboards/customers
router.get("/customers", can("dashboards", "view"), async (req, res, next) => {
  try {
    res.json(await service.getCustomerDashboard(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboards/retail-partners
router.get(
  "/retail-partners",
  can("dashboards", "view"),
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
router.get("/logistics", can("dashboards", "view"), async (req, res, next) => {
  try {
    res.json(await service.getLogisticsDashboard(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboards/overview — combined high-level summary
router.get("/overview", can("dashboards", "view"), async (req, res, next) => {
  try {
    res.json(await service.getOverview(req.business, req.query, req.user));
  } catch (err) {
    next(err);
  }
});

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

// ─── DASHBOARD CONFIGS ───────────────────────────────────────
// Per-user saved dashboard layouts (widget arrangement). Each user
// manages their own; one may be flagged is_default.
//
//   GET    /dashboards/configs
//   GET    /dashboards/configs/:id
//   POST   /dashboards/configs
//   PATCH  /dashboards/configs/:id
//   DELETE /dashboards/configs/:id

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
  can("dashboards", "edit"),
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
