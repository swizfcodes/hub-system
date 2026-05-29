"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./invoicing.service");

// GET /api/invoicing
router.get("/", can("invoicing", "view"), async (req, res, next) => {
  try {
    const result = await service.list(
      req.business,
      req.query,
      req.permissionScope,
      req.user,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── KPI endpoint (MUST be before /:id) ─────────────────────────────────────
router.get("/kpis", can("invoicing", "view"), async (req, res, next) => {
  try {
    res.json(await service.getKpis(req.business));
  } catch (err) {
    next(err);
  }
});

// ─── CREDIT NOTES (MUST be before /:id) ─────────────────────────────────────
//   GET    /invoicing/credit-notes
//   GET    /invoicing/credit-notes/:id
//   POST   /invoicing/credit-notes
//   POST   /invoicing/credit-notes/:id/issue
//   POST   /invoicing/credit-notes/:id/status   ('applied' | 'refunded')

router.get(
  "/credit-notes",
  query("invoice_id").optional().isUUID(),
  query("status").optional().isIn(["draft", "issued", "applied", "refunded"]),
  validate,
  can("invoicing", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listCreditNotes(req.business, req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/credit-notes/:id",
  param("id").isUUID(),
  validate,
  can("invoicing", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getCreditNote(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/credit-notes",
  body("invoice_id").isUUID(),
  body("reason").isString().notEmpty(),
  body("lines").isArray({ min: 1 }),
  body("lines.*.description").optional().isString(),
  body("lines.*.quantity").isInt({ min: 1 }),
  body("lines.*.unit_price").isFloat({ min: 0 }),
  validate,
  can("invoicing", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createCreditNote(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/credit-notes/:id/issue",
  param("id").isUUID(),
  validate,
  can("invoicing", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.issueCreditNote(req.business, req.params.id, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/credit-notes/:id/status",
  param("id").isUUID(),
  body("status").isIn(["applied", "refunded"]),
  validate,
  can("invoicing", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.setCreditNoteApplied(
          req.business,
          req.params.id,
          req.body.status,
          req.user,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ─── /:id routes ─────────────────────────────────────────────────────────────

// GET /api/invoicing/:id
router.get(
  "/:id",
  param("id").isUUID(),
  validate,
  can("invoicing", "view"),
  async (req, res, next) => {
    try {
      const inv = await service.getById(req.business, req.params.id);
      if (!inv) return res.status(404).json({ message: "Invoice not found" });
      res.json(inv);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/invoicing — create manual invoice
router.post(
  "/",
  body("contact_id").isUUID(),
  body("due_date").isISO8601(),
  body("lines").isArray({ min: 1 }),
  validate,
  can("invoicing", "create"),
  async (req, res, next) => {
    try {
      const inv = await service.create(req.business, req.body, req.user);
      res.status(201).json(inv);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/invoicing/:id/send — email / WhatsApp invoice to customer
router.post(
  "/:id/send",
  param("id").isUUID(),
  validate,
  can("invoicing", "edit"),
  async (req, res, next) => {
    try {
      await service.send(req.business, req.params.id, req.body, req.user);
      res.json({ message: "Invoice sent" });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/invoicing/:id/payments — record a payment
router.post(
  "/:id/payments",
  param("id").isUUID(),
  body("amount").isNumeric(),
  body("payment_method").notEmpty(),
  validate,
  can("invoicing", "edit"),
  async (req, res, next) => {
    try {
      const payment = await service.recordPayment(
        req.business,
        req.params.id,
        req.body,
        req.user,
      );
      res.status(201).json(payment);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/invoicing/:id/void
router.post(
  "/:id/void",
  param("id").isUUID(),
  validate,
  can("invoicing", "delete"),
  async (req, res, next) => {
    try {
      await service.voidInvoice(req.business, req.params.id, req.user);
      res.json({ message: "Invoice voided" });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/invoicing/:id/write-off — manager write-off with bad debt journal
router.post(
  "/:id/write-off",
  param("id").isUUID(),
  body("reason").isString().notEmpty(),
  validate,
  can("invoicing", "approve"), // manager/owner only
  async (req, res, next) => {
    try {
      res.json(
        await service.writeOff(req.business, req.params.id, req.body, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/invoicing/:id/pdf
router.get(
  "/:id/pdf",
  param("id").isUUID(),
  validate,
  can("invoicing", "view"),
  async (req, res, next) => {
    try {
      const pdfBuffer = await service.generatePDF(req.business, req.params.id);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      });
      res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
