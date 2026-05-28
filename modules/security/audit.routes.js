"use strict";

const express = require("express");
const router = express.Router();
const { query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./audit.service");

// GET /api/security/audit
router.get(
  "/",
  query("user_id").optional().isUUID(),
  query("module").optional().isString(),
  query("action").optional().isString(),
  query("start_date").optional().isISO8601(),
  query("end_date").optional().isISO8601(),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  query("format").optional().isIn(["json", "csv"]),
  validate,
  can("settings", "view"),
  async (req, res, next) => {
    try {
      const result = await service.queryAuditLog(req.user, {
        ...req.query,
        business: req.business,
      });
      if (req.query.format === "csv") {
        res.set({
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="audit-log.csv"',
        });
        return res.send(result);
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/security/audit/stats
router.get("/stats", can("settings", "view"), async (req, res, next) => {
  try {
    res.json(
      await service.getSecurityStats(req.user, { business: req.business }),
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;
