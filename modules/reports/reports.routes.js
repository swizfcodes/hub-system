"use strict";

const express = require("express");
const router = express.Router();
const { query, param, body } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./reports.service");

// ─────────────────────────────────────────────────────────────
// REPORTS ROUTES
//
// One endpoint pattern per family. Format negotiated via the
// ?format=  query param (default: json). When format is binary
// (pdf/excel) the response streams the buffer with the right
// Content-Type/Content-Disposition headers; otherwise JSON.
//
// Permission keys are per-family so payroll reports can be
// restricted to HR/owners separately from sales reports being
// available to managers.
// ─────────────────────────────────────────────────────────────

router.get("/", can("reports", "view"), (req, res) => {
  res.json({
    available_families: service.REPORT_FAMILIES,
    supported_formats: service.SUPPORTED_FORMATS,
    docs: "See README for per-family report types and options",
  });
});

// ─── SALES ───────────────────────────────────────────────────

router.get(
  "/sales/:reportType",
  param("reportType").isIn(["by_period", "by_product", "by_customer"]),
  query("start_date").isISO8601(),
  query("end_date").isISO8601(),
  query("format").optional().isIn(["json", "csv", "pdf", "excel"]),
  query("group_by").optional().isIn(["day", "week", "month"]),
  query("limit").optional().isInt({ min: 1, max: 1000 }),
  query("archive").optional().isBoolean(),
  validate,
  can("reports", "view"),
  async (req, res, next) => {
    try {
      await handle(req, res, "sales");
    } catch (e) {
      next(e);
    }
  },
);

// ─── FINANCE ─────────────────────────────────────────────────

router.get(
  "/finance/:reportType",
  param("reportType").isIn([
    "profit_and_loss",
    "outstanding_invoices",
    "expenses_by_category",
  ]),
  query("start_date").optional().isISO8601(),
  query("end_date").optional().isISO8601(),
  query("as_of_date").optional().isISO8601(),
  query("format").optional().isIn(["json", "csv", "pdf", "excel"]),
  query("archive").optional().isBoolean(),
  validate,
  // Finance reports use 'approve'-level access — they expose P&L
  // which is more sensitive than ordinary view.
  can("reports", "approve"),
  async (req, res, next) => {
    try {
      await handle(req, res, "finance");
    } catch (e) {
      next(e);
    }
  },
);

// ─── STOCK ───────────────────────────────────────────────────

router.get(
  "/stock/:reportType",
  param("reportType").isIn(["valuation", "movements", "low_stock"]),
  query("start_date").optional().isISO8601(),
  query("end_date").optional().isISO8601(),
  query("product_id").optional().isUUID(),
  query("movement_type").optional().isString(),
  query("format").optional().isIn(["json", "csv", "pdf", "excel"]),
  query("archive").optional().isBoolean(),
  validate,
  can("reports", "view"),
  async (req, res, next) => {
    try {
      await handle(req, res, "stock");
    } catch (e) {
      next(e);
    }
  },
);

// ─── PAYROLL ─────────────────────────────────────────────────

router.get(
  "/payroll/:reportType",
  param("reportType").isIn(["summary", "staff_detail"]),
  query("start_date").optional().isISO8601(),
  query("end_date").optional().isISO8601(),
  query("payroll_id").optional().isUUID(),
  query("format").optional().isIn(["json", "csv", "pdf", "excel"]),
  query("archive").optional().isBoolean(),
  validate,
  // Payroll reports require approval-level permission — owner /
  // HR manager only.
  can("payroll", "approve"),
  async (req, res, next) => {
    try {
      await handle(req, res, "payroll");
    } catch (e) {
      next(e);
    }
  },
);

// ─── DELIVERY ────────────────────────────────────────────────

router.get(
  "/delivery/:reportType",
  param("reportType").isIn(["performance", "by_courier"]),
  query("start_date").isISO8601(),
  query("end_date").isISO8601(),
  query("format").optional().isIn(["json", "csv", "pdf", "excel"]),
  query("archive").optional().isBoolean(),
  validate,
  can("reports", "view"),
  async (req, res, next) => {
    try {
      await handle(req, res, "delivery");
    } catch (e) {
      next(e);
    }
  },
);

// Purchases — financially sensitive, requires approve.
router.get(
  "/purchases/:reportType",
  param("reportType").isIn(["by_supplier", "by_category", "by_period"]),
  query("start_date").isISO8601(),
  query("end_date").isISO8601(),
  query("format").optional().isIn(["json", "csv", "pdf", "excel"]),
  query("archive").optional().isBoolean(),
  validate,
  can("reports", "approve"),
  async (req, res, next) => {
    try {
      await handle(req, res, "purchases");
    } catch (e) {
      next(e);
    }
  },
);

// Attendance — HR-sensitive.
router.get(
  "/attendance/:reportType",
  param("reportType").isIn(["leave_summary", "by_staff"]),
  query("start_date").isISO8601(),
  query("end_date").isISO8601(),
  query("format").optional().isIn(["json", "csv", "pdf", "excel"]),
  query("archive").optional().isBoolean(),
  validate,
  can("payroll", "approve"),
  async (req, res, next) => {
    try {
      await handle(req, res, "attendance");
    } catch (e) {
      next(e);
    }
  },
);

// Consolidated cross-brand report (owner only).
router.get(
  "/consolidated/:family/:reportType",
  param("family").isString(),
  param("reportType").isString(),
  query("start_date").isISO8601(),
  query("end_date").isISO8601(),
  validate,
  can("reports", "approve"),
  async (req, res, next) => {
    try {
      const businessList = ["jewelry", "diffusers"];
      const labels = { jewelry: "Bejewelled", diffusers: "Orika Living" };
      const results = await Promise.all(
        businessList.map((biz) =>
          service.generate({
            business: biz,
            family: req.params.family,
            reportType: req.params.reportType,
            format: "json",
            options: {
              startDate: req.query.start_date,
              endDate: req.query.end_date,
            },
            user: req.user,
          }),
        ),
      );

      const merged = {
        meta: {
          ...results[0].output.meta,
          title: `[Consolidated] ${results[0].output.meta.title}`,
        },
        columns: [
          { key: "business", label: "Business", type: "string" },
          ...results[0].output.columns,
        ],
        rows: results.flatMap((r, i) =>
          r.output.rows.map((row) => ({
            business: labels[businessList[i]],
            ...row,
          })),
        ),
      };

      res.json(merged);
    } catch (e) {
      next(e);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// SHARED HANDLER
// ─────────────────────────────────────────────────────────────

async function handle(req, res, family) {
  const format = req.query.format || "json";

  // Map query parameters to options shape that each report file expects.
  const options = {
    startDate: req.query.start_date,
    endDate: req.query.end_date,
    asOfDate: req.query.as_of_date,
    groupBy: req.query.group_by,
    limit: req.query.limit ? parseInt(req.query.limit) : undefined,
    productId: req.query.product_id,
    movementType: req.query.movement_type,
    payrollId: req.query.payroll_id,
  };

  const { output, mimeType, filename } = await service.generate({
    business: req.business,
    family,
    reportType: req.params.reportType,
    format,
    options,
    user: req.user,
    archive: req.query.archive === "true",
  });

  if (format === "json") {
    return res.json(output);
  }
  res.set({
    "Content-Type": mimeType,
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": output.length,
  });
  return res.send(output);
}

// ─── SAVED REPORTS ───────────────────────────────────────────
//   GET    /reports/saved          — list (own + shared)
//   GET    /reports/saved/:id      — one
//   POST   /reports/saved          — save a configuration
//   PATCH  /reports/saved/:id      — edit (owner only)
//   DELETE /reports/saved/:id      — delete (owner only)

router.get("/saved", can("reports", "view"), async (req, res, next) => {
  try {
    res.json(await service.listSavedReports(req.business, req.user));
  } catch (e) {
    next(e);
  }
});

router.get(
  "/saved/:id",
  param("id").isUUID(),
  validate,
  can("reports", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.getSavedReport(req.business, req.params.id, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/saved",
  body("report_name").isString().notEmpty(),
  body("report_type").isString().notEmpty(),
  body("filters").optional().isObject(),
  body("columns").optional().isArray(),
  body("sort_config").optional().isObject(),
  body("is_shared").optional().isBoolean(),
  body("schedule").optional().isObject(),
  validate,
  can("reports", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.createSavedReport(req.business, req.body, req.user),
        );
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/saved/:id",
  param("id").isUUID(),
  body("report_name").optional().isString(),
  body("filters").optional().isObject(),
  body("columns").optional().isArray(),
  body("sort_config").optional().isObject(),
  body("is_shared").optional().isBoolean(),
  body("schedule").optional().isObject(),
  validate,
  can("reports", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateSavedReport(
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

router.delete(
  "/saved/:id",
  param("id").isUUID(),
  validate,
  can("reports", "delete"),
  async (req, res, next) => {
    try {
      res.json(
        await service.deleteSavedReport(req.business, req.params.id, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
