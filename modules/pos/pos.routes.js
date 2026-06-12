"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./pos.service");

router.get("/terminals", can("pos", "view"), async (req, res, next) => {
  try {
    res.json(await service.getTerminals(req.business));
  } catch (e) {
    next(e);
  }
});

router.post(
  "/terminals",
  body("name").isString().notEmpty(),
  body("location_id").isUUID(),
  validate,
  can("pos", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createTerminal(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/terminals/:id",
  param("id").isUUID(),
  body("name").optional().isString(),
  body("location_id").optional({ checkFalsy: true }).isUUID(),
  body("is_active").optional().isBoolean(),
  validate,
  can("pos", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateTerminal(
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

// ─── SESSIONS ──────────────────────────────────────────────

router.post(
  "/sessions/open",
  body("terminal_id").isUUID(),
  body("opening_float").optional().isNumeric(),
  validate,
  can("pos", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.openSession(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.get("/sessions", can("pos", "view"), async (req, res, next) => {
  try {
    res.json(await service.listSessionsWithVariance(req.business, req.query));
  } catch (e) {
    next(e);
  }
});

router.get(
  "/sessions/:id",
  param("id").isUUID(),
  validate,
  can("pos", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getSession(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/sessions/:id/close",
  param("id").isUUID(),
  body("actual_cash").isNumeric(),
  validate,
  can("pos", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.closeSession(
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

// X report — mid-shift snapshot, no DB writes.
router.get(
  "/sessions/:id/x-report",
  param("id").isUUID(),
  validate,
  can("pos", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getXReport(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

// Z report — historic totals for a closed session.
router.get(
  "/sessions/:id/z-report",
  param("id").isUUID(),
  validate,
  can("pos", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getZReport(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

// Reconcile — manager sign-off. Transitions closed → reconciled and
// locks the session. Permission level is "approve" (not "edit") to
// keep it firmly with managers / finance, not cashiers.
router.post(
  "/sessions/:id/reconcile",
  param("id").isUUID(),
  body("sign_off_notes").optional().isString(),
  validate,
  can("pos", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.markReconciled(
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

// ─── TRANSACTIONS ──────────────────────────────────────────

router.post(
  "/transactions",
  body("session_id").isUUID(),
  body("lines").isArray({ min: 1 }),
  body("payments").isArray({ min: 1 }),
  validate,
  can("pos", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.createTransaction(req.business, req.body, req.user),
        );
    } catch (e) {
      next(e);
    }
  },
);

// Offline queue flush — replay queued sales idempotently (dedupe on
// offline_id). Returns a per-item result list.
router.post(
  "/sync",
  body("transactions").isArray(),
  validate,
  can("pos", "create"),
  async (req, res, next) => {
    try {
      res.json(
        await service.syncOfflineTransactions(req.business, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/transactions/:id",
  param("id").isUUID(),
  validate,
  can("pos", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getTransaction(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/transactions/:id/void",
  param("id").isUUID(),
  body("void_reason").notEmpty(),
  validate,
  can("pos", "delete"),
  async (req, res, next) => {
    try {
      res.json(
        await service.voidTransaction(
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

// POST /api/pos/transactions/:id/invoice — formal invoice from a
// completed sale. The frontend has always called this; the route was
// never mounted (service createInvoiceFromTransaction existed unused).
// Idempotent — repeat calls return the existing invoice. A fully paid
// till sale produces an invoice born 'paid' (no second collection).
router.post(
  "/transactions/:id/invoice",
  param("id").isUUID(),
  body("due_date").optional().isISO8601(),
  validate,
  can("pos", "create"),
  async (req, res, next) => {
    try {
      res.status(201).json(
        await service.createInvoiceFromTransaction(
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

// POST /api/pos/transactions/:id/confirm-payment — staff confirms a
// bank transfer landed (checked in the banking app). Settles the
// linked invoice via recordPayment, which now guards against double
// settlement. Also previously unmounted while the frontend called it.
router.post(
  "/transactions/:id/confirm-payment",
  param("id").isUUID(),
  body("reference").optional().isString(),
  body("notes").optional().isString(),
  validate,
  can("pos", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.confirmTransactionPayment(
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

// ─── RECEIPTS ──────────────────────────────────────────────

router.post(
  "/transactions/:id/receipt",
  param("id").isUUID(),
  body("channel").optional().isIn(["whatsapp", "email", "both", "auto"]),
  body("overrideTo").optional().isString(),
  validate,
  can("pos", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.sendReceipt(
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

// Download receipt as PDF — streams to the browser.
router.get(
  "/transactions/:id/receipt.pdf",
  param("id").isUUID(),
  validate,
  can("pos", "view"),
  async (req, res, next) => {
    try {
      const pdf = await service.downloadReceiptPDF(req.business, req.params.id);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="receipt-${req.params.id}.pdf"`,
        "Content-Length": pdf.length,
      });
      res.send(pdf);
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
