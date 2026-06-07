"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const svc = require("./purchasing.service");

// ── SUPPLIERS ────────────────────────────────────────────────

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

// POST /suppliers/from-contact/:contactId — convert existing contact to supplier
router.post(
  "/suppliers/from-contact/:contactId",
  param("contactId").isUUID(),
  validate,
  can("purchasing", "create"),
  async (req, res, next) => {
    try {
      // Check if supplier record already exists for this contact
      const existing = await svc.findSupplierByContactId(
        req.business,
        req.params.contactId,
      );
      if (existing) return res.json(existing); // idempotent — return existing
      const supplier = await svc.createSupplier(
        req.business,
        {
          contact_id: req.params.contactId,
          payment_terms_days: req.body.payment_terms_days ?? 30,
          preferred_currency: req.body.preferred_currency ?? "NGN",
          notes: req.body.notes ?? "",
        },
        req.user,
      );
      res.status(201).json(supplier);
    } catch (e) {
      next(e);
    }
  },
);

// POST /suppliers/:id/invite — generate portal access token
router.post(
  "/suppliers/:id/invite",
  param("id").isUUID(),
  validate,
  can("purchasing", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await svc.generateSupplierInvite(req.business, req.params.id, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ── RFQs ─────────────────────────────────────────────────────

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

// ── SUPPLIER QUOTES ──────────────────────────────────────────

// POST /quotes/:quoteId/generate-po — generate a PO from a winning quote
router.post(
  "/quotes/:quoteId/generate-po",
  param("quoteId").isUUID(),
  validate,
  can("purchasing", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await svc.generatePOFromQuote(
            req.business,
            req.params.quoteId,
            req.user,
          ),
        );
    } catch (e) {
      next(e);
    }
  },
);

// ── PURCHASE ORDERS ──────────────────────────────────────────

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

router.post(
  "/purchase-orders/:id/receive",
  param("id").isUUID(),
  body("lines").isArray({ min: 1 }),
  body("receiving_location_id").optional({ checkFalsy: true }).isUUID(),
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

// ── BILLS ────────────────────────────────────────────────────

router.get("/bills", can("purchasing", "view"), async (req, res, next) => {
  try {
    res.json(await svc.listBills(req.business, req.query));
  } catch (e) {
    next(e);
  }
});

router.get(
  "/bills/:id",
  param("id").isUUID(),
  validate,
  can("purchasing", "view"),
  async (req, res, next) => {
    try {
      res.json(await svc.getBill(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/bills",
  body("supplier_id").isUUID(),
  body("supplier_invoice_number").notEmpty(),
  body("invoice_date").isISO8601(),
  body("due_date").isISO8601(),
  body("amount").isFloat({ min: 0.01 }),
  body("currency").notEmpty(),
  body("po_id").optional({ checkFalsy: true }).isUUID(),
  validate,
  can("purchasing", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await svc.createBill(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/bills/:id/approve",
  param("id").isUUID(),
  validate,
  can("purchasing", "approve"),
  async (req, res, next) => {
    try {
      res.json(await svc.approveBill(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/bills/:id/dispute",
  param("id").isUUID(),
  body("reason").notEmpty(),
  validate,
  can("purchasing", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await svc.disputeBill(
          req.business,
          req.params.id,
          req.body.reason,
          req.user,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/bills/:id/pay",
  param("id").isUUID(),
  body("amount").isFloat({ min: 0.01 }),
  validate,
  can("purchasing", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await svc.payBill(req.business, req.params.id, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
