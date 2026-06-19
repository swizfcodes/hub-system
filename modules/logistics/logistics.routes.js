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

// ── DELIVERY ZONES / RATE CARD ───────────────────────────────
// Literal paths — declared before "/:id" so they aren't parsed as a UUID.

router.get(
  "/delivery-zones",
  can("logistics", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listZones(req.business));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/delivery-zones",
  body("name").isString().notEmpty(),
  body("scope").isIn(["lagos", "nationwide"]),
  body("rate").isFloat({ min: 0 }),
  body("match_terms").optional().isArray(),
  body("is_default").optional().isBoolean(),
  body("display_order").optional().isInt({ min: 0 }),
  body("is_active").optional().isBoolean(),
  validate,
  can("logistics", "edit"),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createZone(req.business, req.body));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/delivery-zones/:id",
  param("id").isUUID(),
  body("scope").optional().isIn(["lagos", "nationwide"]),
  body("rate").optional().isFloat({ min: 0 }),
  body("match_terms").optional().isArray(),
  validate,
  can("logistics", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.updateZone(req.business, req.params.id, req.body));
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/delivery-zones/:id",
  param("id").isUUID(),
  validate,
  can("logistics", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.deleteZone(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/delivery-settings",
  can("logistics", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getDeliverySettings(req.business));
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/delivery-settings",
  body("bulk_threshold").optional().isInt({ min: 1 }),
  body("bulk_fee_lagos").optional().isFloat({ min: 0 }),
  body("bulk_fee_nationwide").optional().isFloat({ min: 0 }),
  body("lagos_state_name").optional().isString(),
  body("pickup_free").optional().isBoolean(),
  validate,
  can("logistics", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.updateDeliverySettings(req.business, req.body));
    } catch (err) {
      next(err);
    }
  },
);

// Full rate card (active zones + settings) — used by admin previews and as
// the shape the storefront consumes.
router.get(
  "/delivery-rate-card",
  can("logistics", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getRateCard(req.business));
    } catch (err) {
      next(err);
    }
  },
);

// Quote a fee for a destination + cart (admin/internal preview).
router.post(
  "/delivery-quote",
  validate,
  can("logistics", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.quoteDelivery(req.business, {
          fulfilmentType: req.body.fulfilment_type,
          state: req.body.state,
          city: req.body.city,
          itemCount: req.body.item_count,
        }),
      );
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

// POST /api/logistics — create delivery from an order / POS transaction,
// or a standalone ('manual') delivery with its own item list.
router.post(
  "/",
  body("reference_type").isIn(["pos_transaction", "sales_order", "manual"]),
  body("reference_id")
    .if(body("reference_type").not().equals("manual"))
    .isUUID(),
  // Order-linked deliveries inherit contact + address from the source
  // order (resolved in the service) — only standalone deliveries must
  // carry their own.
  body("contact_id")
    .if(body("reference_type").equals("manual"))
    .isUUID(),
  body("contact_id").optional().isUUID(),
  body("delivery_address")
    .if(body("reference_type").equals("manual"))
    .notEmpty(),
  body("courier").isIn(["relay", "chowdeck", "gigl", "manual"]),
  body("items").optional().isArray(),
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

// POST /api/logistics/:id/dispatch — dispatch with manually entered
// courier/driver details (Uber / Bolt / inDrive / any), then email the
// customer the signing link.
router.post(
  "/:id/dispatch",
  param("id").isUUID(),
  body("courier_company").optional().isString().isLength({ max: 80 }),
  body("driver_name").optional().isString().isLength({ max: 120 }),
  body("driver_phone").optional().isString().isLength({ max: 40 }),
  body("waybill_number").optional().isString().isLength({ max: 80 }),
  body("delivery_fee").optional().isFloat({ min: 0 }),
  validate,
  can("logistics", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.dispatchDelivery(
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

// POST /api/logistics/:id/resend-signing-link — fresh token + email
router.post(
  "/:id/resend-signing-link",
  param("id").isUUID(),
  validate,
  can("logistics", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.resendSigningLink(req.business, req.params.id, req.user),
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
