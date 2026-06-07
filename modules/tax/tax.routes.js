"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./tax.service");

const TAX_TYPES = ["VAT", "WHT", "PAYE", "CIT", "DEV_LEVY"];

// ── Dashboard & profile ─────────────────────────────────────
router.get("/dashboard", can("tax", "view"), async (req, res, next) => {
  try {
    res.json(await service.dashboard(req.business));
  } catch (e) {
    next(e);
  }
});

router.get("/profile", can("tax", "view"), async (req, res, next) => {
  try {
    res.json(await service.getProfile(req.business));
  } catch (e) {
    next(e);
  }
});

router.put("/profile", can("tax", "edit"), async (req, res, next) => {
  try {
    res.json(await service.updateProfile(req.business, req.body, req.user));
  } catch (e) {
    next(e);
  }
});

// ── Live computation (no persistence) ───────────────────────
router.get(
  "/preview",
  query("type").isIn(TAX_TYPES),
  query("period").matches(/^\d{4}(-\d{2})?$/),
  validate,
  can("tax", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.preview(req.business, req.query.type, req.query.period),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ── Filings ─────────────────────────────────────────────────
router.get("/filings", can("tax", "view"), async (req, res, next) => {
  try {
    res.json(await service.listFilings(req.business, req.query));
  } catch (e) {
    next(e);
  }
});

router.post(
  "/filings",
  body("tax_type").isIn(TAX_TYPES),
  body("period_label").matches(/^\d{4}(-\d{2})?$/),
  validate,
  can("tax", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.saveDraft(
            req.business,
            req.body.tax_type,
            req.body.period_label,
            req.user,
          ),
        );
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/filings/:id",
  param("id").isUUID(),
  validate,
  can("tax", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getFiling(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/filings/:id/adjustments",
  param("id").isUUID(),
  body("label").notEmpty(),
  body("amount").isNumeric(),
  validate,
  can("tax", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.addAdjustment(
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

router.post(
  "/filings/:id/confirm",
  param("id").isUUID(),
  validate,
  can("tax", "approve"),
  async (req, res, next) => {
    try {
      res.json(await service.confirm(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/filings/:id/file",
  param("id").isUUID(),
  validate,
  can("tax", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.markFiled(
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

router.post(
  "/filings/:id/settle",
  param("id").isUUID(),
  validate,
  can("tax", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.settle(req.business, req.params.id, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ── Export schedule (CSV) ───────────────────────────────────
router.get(
  "/filings/:id/export",
  param("id").isUUID(),
  validate,
  can("tax", "export"),
  async (req, res, next) => {
    try {
      const { filename, csv } = await service.exportCsv(
        req.business,
        req.params.id,
      );
      res.set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      });
      res.send(csv);
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
