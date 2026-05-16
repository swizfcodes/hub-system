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

module.exports = router;
