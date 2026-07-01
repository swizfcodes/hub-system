"use strict";

const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./stock.service");

// ────────────────────────────────────────────────────────────────────────────
// Route ordering note
//
// Specific paths (/on-hand, /reservations, /transfers, /quality-checks,
// /alerts, /locations) MUST be declared before the parametric
// /:productId/movements catch-all — otherwise Express matches the
// literal word "on-hand" as a productId and the UUID validator throws.
// ────────────────────────────────────────────────────────────────────────────

// ── ROOT — legacy current-stock list (kept for backwards compat) ────────────
router.get("/", can("stock", "view"), async (req, res, next) => {
  try {
    res.json(await service.getCurrentStock(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

// ── ON-HAND ─────────────────────────────────────────────────────────────────

router.get("/on-hand", can("stock", "view"), async (req, res, next) => {
  try {
    res.json(await service.getOnHand(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

router.get(
  "/on-hand/:productId",
  param("productId").isUUID(),
  validate,
  can("stock", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.getOnHandByProduct(req.business, req.params.productId),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ── RESERVATIONS ────────────────────────────────────────────────────────────

router.get("/reservations", can("stock", "view"), async (req, res, next) => {
  try {
    res.json(await service.listReservations(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/reservations",
  body("product_id").isUUID(),
  body("quantity").isInt({ min: 1 }),
  body("expires_at").isISO8601(),
  body("reserved_for").optional({ nullable: true }).isUUID(),
  body("crm_deal_id").optional({ nullable: true }).isUUID(),
  body("notes").optional().isString(),
  validate,
  can("stock", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.createReservationService(
            req.business,
            req.body,
            req.user,
          ),
        );
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/reservations/:id/release",
  param("id").isUUID(),
  validate,
  can("stock", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.releaseReservationService(
          req.business,
          req.params.id,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/reservations/:id/convert",
  param("id").isUUID(),
  validate,
  can("stock", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.convertReservationService(req.business, req.params.id),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ── TRANSFERS ───────────────────────────────────────────────────────────────

router.get("/transfers", can("stock", "view"), async (req, res, next) => {
  try {
    res.json(await service.listTransfers(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

router.get(
  "/transfers/:id",
  param("id").isUUID(),
  validate,
  can("stock", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getTransfer(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/transfers",
  body("from_location_id").isUUID(),
  body("to_location_id").isUUID(),
  body("lines").isArray({ min: 1 }),
  body("lines.*.product_id").isUUID(),
  body("lines.*.quantity").isInt({ min: 1 }),
  body("notes").optional().isString(),
  validate,
  can("stock", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createTransfer(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/transfers/:id/dispatch",
  param("id").isUUID(),
  validate,
  can("stock", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.dispatchTransfer(req.business, req.params.id, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/transfers/:id/receive",
  param("id").isUUID(),
  validate,
  can("stock", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.receiveTransfer(req.business, req.params.id, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/transfers/:id/cancel",
  param("id").isUUID(),
  body("reason").isString().notEmpty(),
  validate,
  can("stock", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.cancelTransfer(
          req.business,
          req.params.id,
          req.body,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

// Legacy singular /transfer path — kept for any internal callers
// that still POST to it.
router.post(
  "/transfer",
  body("from_location_id").isUUID(),
  body("to_location_id").isUUID(),
  body("lines").isArray({ min: 1 }),
  validate,
  can("stock", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createTransfer(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// ── QUALITY CHECKS ──────────────────────────────────────────────────────────

router.get("/quality-checks", can("stock", "view"), async (req, res, next) => {
  try {
    res.json(await service.listQualityChecks(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/quality-checks",
  body("product_id").isUUID(),
  body("check_type").isIn([
    "incoming",
    "periodic",
    "return",
    "pre_consignment",
  ]),
  body("result").isIn(["pass", "fail", "conditional"]),
  body("notes").optional().isString(),
  validate,
  can("stock", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.createQualityCheck(req.business, req.body, req.user),
        );
    } catch (err) {
      next(err);
    }
  },
);

// ── ALERTS / LOCATIONS (existing) ───────────────────────────────────────────

router.get("/alerts", can("stock", "view"), async (req, res, next) => {
  try {
    res.json(await service.getLowStockAlerts(req.business));
  } catch (err) {
    next(err);
  }
});

router.get("/locations", can("stock", "view"), async (req, res, next) => {
  try {
    res.json(await service.getLocations(req.business));
  } catch (err) {
    next(err);
  }
});

// ── ADJUSTMENTS ─────────────────────────────────────────────────────────────

// List adjustment history.
router.get("/adjustment", can("stock", "view"), async (req, res, next) => {
  try {
    res.json(await service.listAdjustments(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/adjustment",
  body("product_id").isUUID(),
  body("location_id").isUUID(),
  body("quantity_after").isInt(),
  body("reason").notEmpty(),
  validate,
  can("stock", "approve"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createAdjustment(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// Batch adjustments (count session) — literal "/adjustment/batch" before the
// parametric "/adjustment/:id/approve" below.
router.post(
  "/adjustment/batch",
  body("adjustments").isArray({ min: 1 }),
  body("adjustments.*.product_id").isUUID(),
  body("adjustments.*.location_id").isUUID(),
  body("adjustments.*.quantity_after").isInt(),
  body("adjustments.*.reason").notEmpty(),
  validate,
  can("stock", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.createBatchAdjustments(
            req.business,
            req.body,
            req.user,
          ),
        );
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/adjustment/:id/approve",
  param("id").isUUID(),
  validate,
  can("stock", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.approveAdjustment(req.business, req.params.id, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ── BATCHES / LOTS ──────────────────────────────────────────────────────────

router.get("/batches", can("stock", "view"), async (req, res, next) => {
  try {
    res.json(await service.listBatches(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/batches",
  body("product_id").isUUID(),
  body("batch_number").isString().notEmpty(),
  body("initial_quantity").isInt({ min: 1 }),
  body("manufactured_date").optional({ nullable: true }).isISO8601(),
  body("expiry_date").optional({ nullable: true }).isISO8601(),
  body("location_id").optional({ nullable: true }).isUUID(),
  body("notes").optional().isString(),
  validate,
  can("stock", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createBatch(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// ── MOVEMENTS ───────────────────────────────────────────────────────────────

// Global movements list (all products). Literal "/movements" MUST come
// before the parametric "/:productId/movements" below, otherwise Express
// matches "movements" as a productId and the UUID validator throws.
router.get("/movements", can("stock", "view"), async (req, res, next) => {
  try {
    res.json(await service.listMovements(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

// Manual stock exit — gift/sample, damage, write-off, consignment-out, or
// return-to-supplier. Literal path segment "manual-exit" so it never collides
// with the parametric "/:productId/movements" catch-all below.
router.post(
  "/movements/manual-exit",
  body("product_id").isUUID(),
  body("from_location_id").isUUID(),
  body("quantity").isInt({ min: 1 }),
  body("movement_type").isIn([
    "sample",
    "gift",
    "sent_to_consignment",
    "write_off",
    "damaged",
    "returned_to_supplier",
  ]),
  body("reason").isString().isLength({ min: 5 }),
  validate,
  can("stock", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.recordManualExit(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// ── MOVEMENTS (parametric catch-all — MUST be last) ─────────────────────────

router.get(
  "/:productId/movements",
  param("productId").isUUID(),
  validate,
  can("stock", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.getMovements(
          req.business,
          req.params.productId,
          req.query,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
