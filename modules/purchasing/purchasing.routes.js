"use strict";

const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const svc = require("./purchasing.service");

router.get("/suppliers", can("purchasing", "view"), async (req, res, next) => {
  try {
    res.json(await svc.listSuppliers(req.business, req.query));
  } catch (e) {
    next(e);
  }
});
router.post(
  "/suppliers",
  body("contact_id").isUUID(),
  validate,
  can("purchasing", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await svc.createSupplier(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);
router.get(
  "/suppliers/:id",
  param("id").isUUID(),
  validate,
  can("purchasing", "view"),
  async (req, res, next) => {
    try {
      res.json(await svc.getSupplier(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

router.get("/rfqs", can("purchasing", "view"), async (req, res, next) => {
  try {
    res.json(await svc.listRFQs(req.business, req.query));
  } catch (e) {
    next(e);
  }
});
router.post(
  "/rfqs",
  body("title").notEmpty(),
  body("lines").isArray({ min: 1 }),
  validate,
  can("purchasing", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await svc.createRFQ(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// GET /rfqs/:id
router.get(
  "/rfqs/:id",
  param("id").isUUID(),
  validate,
  can("purchasing", "view"),
  async (req, res, next) => {
    try {
      res.json(await svc.getRFQ(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

// POST /rfqs/:id/send — draft → sent, dispatches invite tokens to suppliers
router.post(
  "/rfqs/:id/send",
  param("id").isUUID(),
  validate,
  can("purchasing", "edit"),
  async (req, res, next) => {
    try {
      res.json(await svc.sendRFQ(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// POST /rfqs/:id/close
router.post(
  "/rfqs/:id/close",
  param("id").isUUID(),
  validate,
  can("purchasing", "edit"),
  async (req, res, next) => {
    try {
      res.json(await svc.closeRFQ(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// POST /rfqs/:id/cancel
router.post(
  "/rfqs/:id/cancel",
  param("id").isUUID(),
  validate,
  can("purchasing", "edit"),
  async (req, res, next) => {
    try {
      res.json(await svc.cancelRFQ(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/purchase-orders",
  can("purchasing", "view"),
  async (req, res, next) => {
    try {
      res.json(await svc.listPOs(req.business, req.query));
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/purchase-orders",
  body("supplier_id").isUUID(),
  body("lines").isArray({ min: 1 }),
  validate,
  can("purchasing", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await svc.createPO(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);
router.get(
  "/purchase-orders/:id",
  param("id").isUUID(),
  validate,
  can("purchasing", "view"),
  async (req, res, next) => {
    try {
      res.json(await svc.getPO(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/purchase-orders/:id/receive",
  param("id").isUUID(),
  body("lines").isArray({ min: 1 }),
  body("receiving_location_id").optional().isUUID(),
  validate,
  can("purchasing", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await svc.receiveGoods(req.business, req.params.id, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

// PATCH /purchase-orders/:id — edit fields (e.g. expected_delivery, notes)
router.patch(
  "/purchase-orders/:id",
  param("id").isUUID(),
  validate,
  can("purchasing", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await svc.updatePO(req.business, req.params.id, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

// POST /purchase-orders/:id/send — draft → sent
router.post(
  "/purchase-orders/:id/send",
  param("id").isUUID(),
  validate,
  can("purchasing", "edit"),
  async (req, res, next) => {
    try {
      res.json(await svc.sendPO(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// POST /purchase-orders/:id/approve — requires purchasing.approve permission + threshold check
router.post(
  "/purchase-orders/:id/approve",
  param("id").isUUID(),
  validate,
  can("purchasing", "approve"),
  async (req, res, next) => {
    try {
      res.json(await svc.approvePO(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// POST /purchase-orders/:id/cancel
router.post(
  "/purchase-orders/:id/cancel",
  param("id").isUUID(),
  validate,
  can("purchasing", "edit"),
  async (req, res, next) => {
    try {
      res.json(await svc.cancelPO(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// GET /purchase-orders/:id/receipts — GRN list for PO detail page
router.get(
  "/purchase-orders/:id/receipts",
  param("id").isUUID(),
  validate,
  can("purchasing", "view"),
  async (req, res, next) => {
    try {
      res.json(await svc.listReceiptsForPO(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
