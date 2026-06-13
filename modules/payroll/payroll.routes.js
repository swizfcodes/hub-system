"use strict";

const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./payroll.service");

// GET /api/payroll/runs
router.get("/runs", can("payroll", "view"), async (req, res, next) => {
  try {
    res.json(await service.listRuns(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

// POST /api/payroll/runs — initiate new payroll run
//
// period_year accepts any year within 5 years of the current one — this
// covers backdating corrections and pre-funding future periods, while
// preventing typos that would create payslips for 1999 or 9999.
const MIN_YEAR = new Date().getFullYear() - 5;
const MAX_YEAR = new Date().getFullYear() + 5;

router.post(
  "/runs",
  body("period_month").isInt({ min: 1, max: 12 }),
  body("period_year").isInt({ min: MIN_YEAR, max: MAX_YEAR }),
  body("mode").optional().isIn(["full_paye", "simplified"]),
  validate,
  can("payroll", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.initiateRun(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/payroll/runs/:id
router.get(
  "/runs/:id",
  param("id").isUUID(),
  validate,
  can("payroll", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getRun(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/payroll/runs/:id/approve
router.post(
  "/runs/:id/approve",
  param("id").isUUID(),
  validate,
  can("payroll", "approve"),
  async (req, res, next) => {
    try {
      res.json(await service.approveRun(req.business, req.params.id, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/payroll/runs/:id/mark-paid
router.post(
  "/runs/:id/mark-paid",
  param("id").isUUID(),
  validate,
  can("payroll", "approve"),
  async (req, res, next) => {
    try {
      res.json(await service.markPaid(req.business, req.params.id, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/payroll/runs/:id/payslips
router.get(
  "/runs/:id/payslips",
  param("id").isUUID(),
  validate,
  can("payroll", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getPayslips(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/payroll/payslips/:id — individual payslip (staff can view own)
router.get(
  "/payslips/:id",
  param("id").isUUID(),
  validate,
  can("payroll", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getPayslip(req.business, req.params.id, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/payroll/payslips/:id/pdf
router.get(
  "/payslips/:id/pdf",
  param("id").isUUID(),
  validate,
  can("payroll", "view"),
  async (req, res, next) => {
    try {
      const pdf = await service.generatePayslipPDF(
        req.business,
        req.params.id,
        req.user,
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

// GET /api/payroll/commission-rules
router.get(
  "/commission-rules",
  can("payroll", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listCommissionRules(req.business));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/payroll/commission-rules
router.post(
  "/commission-rules",
  body("rule_type").isIn(["percentage_of_sales", "fixed_per_item", "tiered"]),
  validate,
  can("payroll", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.createCommissionRule(req.business, req.body, req.user),
        );
    } catch (err) {
      next(err);
    }
  },
);

// ── COMPLIANCE OUTPUTS (CSV) ─────────────────────────────────

function complianceRoute(suffix, method, filename) {
  router.get(
    `/runs/:id/compliance/${suffix}`,
    param("id").isUUID(),
    validate,
    can("payroll", "view"),
    async (req, res, next) => {
      try {
        const csv = await service[method](req.business, req.params.id);
        res.set({
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${filename}"`,
        });
        res.send(csv);
      } catch (err) {
        next(err);
      }
    },
  );
}

complianceRoute("paye-schedule", "generatePayeSchedule", "paye-schedule.csv");
complianceRoute("pencom", "generatePencomFile", "pencom-schedule.csv");
complianceRoute("nhf", "generateNhfSchedule", "nhf-schedule.csv");
complianceRoute(
  "payment-schedule",
  "generatePaymentSchedule",
  "payment-schedule.csv",
);

// ── SEND PAYSLIP ─────────────────────────────────────────────
router.post(
  "/payslips/:id/send",
  param("id").isUUID(),
  body("channel").optional().isIn(["email", "whatsapp", "both"]),
  validate,
  can("payroll", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.sendPayslip(
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

module.exports = router;
