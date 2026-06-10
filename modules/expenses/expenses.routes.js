"use strict";

const express = require("express");
const router = express.Router();
const multer = require("multer");
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./expenses.service");

// Receipt uploads — images + PDFs, 10 MB cap
const RECEIPT_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
]);
const uploadReceipt = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!RECEIPT_MIME.has(file.mimetype)) {
      return cb(
        new Error(
          `Unsupported receipt type "${file.mimetype}". Use PNG, JPG, WEBP or PDF.`,
        ),
      );
    }
    cb(null, true);
  },
});

// ─────────────────────────────────────────────────────────
// IMPORTANT: static paths (/kpis, /advances) MUST be declared
// before /:id, otherwise Express matches them as an :id param
// and the UUID validator rejects them with a 400.
// ─────────────────────────────────────────────────────────

// ── KPIs ──────────────────────────────────────────────────
router.get("/kpis", can("expenses", "view"), async (req, res, next) => {
  try {
    res.json(
      await service.getKpis(req.business, req.user, req.permissionScope),
    );
  } catch (e) {
    next(e);
  }
});

// ── Advances ──────────────────────────────────────────────
router.get("/advances", can("expenses", "view"), async (req, res, next) => {
  try {
    res.json(
      await service.listAdvances(
        req.business,
        req.query,
        req.user,
        req.permissionScope,
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.post(
  "/advances",
  body("purpose").isString().trim().notEmpty(),
  body("amount_requested").isFloat({ gt: 0 }),
  body("reason").isString().trim().notEmpty(),
  validate,
  can("expenses", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createAdvance(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/advances/:id/approve",
  param("id").isUUID(),
  body("amount_approved").isFloat({ gt: 0 }),
  validate,
  can("expenses", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.approveAdvance(
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

// ── Expenses ──────────────────────────────────────────────
router.get(
  "/",
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  query("status")
    .optional()
    .isIn(["pending", "approved", "rejected", "partially_paid", "paid"]),
  validate,
  can("expenses", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.list(
          req.business,
          req.query,
          req.user,
          req.permissionScope,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/",
  body("category").isString().trim().notEmpty(),
  body("amount").isFloat({ gt: 0 }),
  body("description").isString().trim().notEmpty(),
  body("expense_date").isISO8601(),
  body("expense_type")
    .optional()
    .isIn([
      "reimbursement",
      "petty_cash",
      "direct_payment",
      "cash_advance_retirement",
    ]),
  body("vendor_name").optional({ checkFalsy: true }).isString().trim(),
  body("vendor_contact_id").optional({ checkFalsy: true }).isUUID(),
  body("currency").optional({ checkFalsy: true }).isLength({ min: 3, max: 3 }),
  validate,
  can("expenses", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.create(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// KPI summary for the expenses dashboard.
// MUST be declared before "/:id" so the literal "kpis" isn't captured
// as an :id param (which fails UUID validation).
router.get("/kpis", can("expenses", "view"), async (req, res, next) => {
  try {
    res.json(await service.getKpis(req.business));
  } catch (e) {
    next(e);
  }
});

// Advances — literal "/advances" MUST be declared before "/:id" so it isn't
// captured as an :id param (which fails UUID validation → 422).
router.get("/advances", can("expenses", "view"), async (req, res, next) => {
  try {
    res.json(
      await service.listAdvances(
        req.business,
        req.query,
        req.user,
        req.permissionScope,
      ),
    );
  } catch (e) {
    next(e);
  }
});
router.post(
  "/advances",
  body("purpose").notEmpty(),
  body("amount_requested").isNumeric(),
  body("reason").notEmpty(),
  validate,
  can("expenses", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createAdvance(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/advances/:id/approve",
  param("id").isUUID(),
  body("amount_approved").isNumeric(),
  validate,
  can("expenses", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.approveAdvance(
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

router.get(
  "/:id",
  param("id").isUUID(),
  validate,
  can("expenses", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getById(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/:id/approve",
  param("id").isUUID(),
  validate,
  can("expenses", "approve"),
  async (req, res, next) => {
    try {
      res.json(await service.approve(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/:id/reject",
  param("id").isUUID(),
  body("rejection_reason").isString().trim().notEmpty(),
  validate,
  can("expenses", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.reject(req.business, req.params.id, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

// Record a partial or full payment against an approved expense
router.post(
  "/:id/payments",
  param("id").isUUID(),
  body("amount").isFloat({ gt: 0 }),
  body("payment_date").optional({ checkFalsy: true }).isISO8601(),
  body("method")
    .optional({ checkFalsy: true })
    .isIn(["bank_transfer", "cash", "card", "petty_cash", "other"]),
  body("reference").optional({ checkFalsy: true }).isString().trim(),
  body("notes").optional({ checkFalsy: true }).isString().trim(),
  validate,
  can("expenses", "approve"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.recordPayment(
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

// Pay off the full outstanding balance in one step
router.post(
  "/:id/mark-paid",
  param("id").isUUID(),
  body("payment_date").optional({ checkFalsy: true }).isISO8601(),
  body("method")
    .optional({ checkFalsy: true })
    .isIn(["bank_transfer", "cash", "card", "petty_cash", "other"]),
  body("reference").optional({ checkFalsy: true }).isString().trim(),
  validate,
  can("expenses", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.markPaid(req.business, req.params.id, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

// Attach a receipt (image / PDF) to an expense
router.post(
  "/:id/receipts",
  param("id").isUUID(),
  validate,
  can("expenses", "create"),
  uploadReceipt.single("file"),
  body("receipt_date").optional({ checkFalsy: true }).isISO8601(),
  body("merchant_name").optional({ checkFalsy: true }).isString().trim(),
  body("amount_on_receipt").optional({ checkFalsy: true }).isFloat({ gt: 0 }),
  validate,
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "file is required" });
      }
      res
        .status(201)
        .json(
          await service.addReceipt(
            req.business,
            req.params.id,
            req.file,
            req.body,
            req.user,
          ),
        );
    } catch (e) {
      next(e);
    }
  },
);

// ── Multer error formatter ────────────────────────────────
router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "File too large. Max 10MB." });
    }
    return res.status(400).json({ message: err.message });
  }
  if (err?.message?.startsWith("Unsupported receipt type")) {
    return res.status(415).json({ message: err.message });
  }
  next(err);
});

module.exports = router;
