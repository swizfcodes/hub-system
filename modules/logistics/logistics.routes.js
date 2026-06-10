"use strict";

const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./logistics.service");

// GET /api/logistics — list all deliveries
router.get("/", can("logistics", "view"), async (req, res, next) => {
  try {
    res.json(await service.listDeliveries(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

// POST /api/logistics/suggest — suggest couriers for a delivery address
// MUST be before /:id to avoid Express matching 'suggest' as a UUID param
router.post(
  "/suggest",
  body("delivery_address").notEmpty(),
  validate,
  can("logistics", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.suggestCouriers(req.body));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/logistics/:id
router.get(
  "/:id",
  param("id").isUUID(),
  validate,
  can("logistics", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getDelivery(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/logistics — create delivery from order/pos transaction
router.post(
  "/",
  body("reference_type").isIn(["pos_transaction", "sales_order"]),
  body("reference_id").isUUID(),
  body("contact_id").isUUID(),
  body("delivery_address").notEmpty(),
  body("courier").isIn(["relay", "chowdeck", "gigl", "manual"]),
  validate,
  can("logistics", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createDelivery(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/logistics/:id — update delivery details (waybill, fee, etc.)
router.patch(
  "/:id",
  param("id").isUUID(),
  validate,
  can("logistics", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateDeliveryDetails(
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

// POST /api/logistics/:id/dispatch — book courier and dispatch
router.post(
  "/:id/dispatch",
  param("id").isUUID(),
  validate,
  can("logistics", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.dispatchDelivery(req.business, req.params.id, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/logistics/:id/mark-delivered
router.post(
  "/:id/mark-delivered",
  param("id").isUUID(),
  validate,
  can("logistics", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.markDelivered(req.business, req.params.id, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/logistics/:id/mark-failed
router.post(
  "/:id/mark-failed",
  param("id").isUUID(),
  body("failure_reason").notEmpty(),
  validate,
  can("logistics", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.markFailed(
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

// POST /api/logistics/:id/mark-returned — restock items after failed return
router.post(
  "/:id/mark-returned",
  param("id").isUUID(),
  body("notes").optional().isString(),
  validate,
  can("logistics", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.markReturned(
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

// GET /api/logistics/:id/tracking
router.get(
  "/:id/tracking",
  param("id").isUUID(),
  validate,
  can("logistics", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getTracking(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/logistics/:id/packing-slip — stream packing slip PDF
router.get(
  "/:id/packing-slip",
  param("id").isUUID(),
  validate,
  can("logistics", "view"),
  async (req, res, next) => {
    try {
      const pdf = await service.generatePackingSlip(
        req.business,
        req.params.id,
      );
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      });
      res.send(pdf);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/logistics/quote — get delivery fee before booking
// NOTE: registered last among non-:id routes; 'suggest' covers the pre-booking flow
router.post(
  "/quote",
  body("courier").isIn(["relay", "chowdeck", "gigl", "manual"]),
  body("pickup_address").notEmpty(),
  body("delivery_address").notEmpty(),
  validate,
  can("logistics", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getQuote(req.body));
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
