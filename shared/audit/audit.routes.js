"use strict";

const express = require("express");
const router = express.Router();
const { query, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./audit.service");
const { pool } = require("../../config/db");

// ─────────────────────────────────────────────────────────────
// AUDIT ROUTES
//
// The audit log is a sensitive resource — these endpoints are
// restricted to users with `audit:view` permission, which is
// owner / manager / compliance roles only.
//
// All endpoints read from shared.audit_log; nothing writes here.
// Audit rows are written exclusively by audit.service.log() from
// inside other modules' service layers.
// ─────────────────────────────────────────────────────────────

/**
 * Free-form audit log search — the main "who did what when" view
 * for managers and compliance.
 *
 * Query params:
 *   - business         filter by business key
 *   - module           filter by module name (pos, sales, ...)
 *   - action           filter by action verb (create, update, delete, ...)
 *   - user_id          show only one user's actions
 *   - table_name       filter to a specific table
 *   - record_id        filter to a specific record
 *   - from             ISO date — only events on or after this date
 *   - to               ISO date — only events on or before this date
 *   - sensitive_only   true → only entries flagged sensitive in metadata
 *   - page / limit     pagination (default 50, max 200)
 */
router.get(
  "/",
  query("business").optional().isString(),
  query("module").optional().isString(),
  query("action").optional().isString(),
  query("user_id").optional().isUUID(),
  query("table_name").optional().isString(),
  query("record_id").optional().isUUID(),
  query("from").optional().isISO8601(),
  query("to").optional().isISO8601(),
  query("sensitive_only").optional().isBoolean(),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  validate,
  can("audit", "view"),
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      // Build dynamic WHERE.
      const conditions = [];
      const params = [];

      function addCondition(sql, value) {
        params.push(value);
        conditions.push(sql.replace("?", `$${params.length}`));
      }

      if (req.query.business) addCondition("business = ?", req.query.business);
      if (req.query.module) addCondition("module = ?", req.query.module);
      if (req.query.action) addCondition("action = ?", req.query.action);
      if (req.query.user_id) addCondition("user_id = ?", req.query.user_id);
      if (req.query.table_name)
        addCondition("table_name = ?", req.query.table_name);
      if (req.query.record_id)
        addCondition("record_id = ?", req.query.record_id);
      if (req.query.from)
        addCondition("occurred_at >= ?::timestamptz", req.query.from);
      if (req.query.to)
        addCondition("occurred_at <= ?::timestamptz", req.query.to);
      if (req.query.sensitive_only === "true")
        conditions.push(`(metadata->>'sensitive')::boolean = true`);

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      params.push(limit, offset);
      const limitOffsetClause = `LIMIT $${params.length - 1} OFFSET $${params.length}`;

      const { rows } = await pool.query(
        `SELECT log_id, occurred_at, user_id, user_name, user_email,
                business, module, action, table_name, record_id,
                before_state, after_state, ip_address, metadata
         FROM shared.audit_log
         ${whereClause}
         ORDER BY occurred_at DESC
         ${limitOffsetClause}`,
        params,
      );

      // Total count for pagination.
      const countParams = params.slice(0, params.length - 2);
      const {
        rows: [{ count }],
      } = await pool.query(
        `SELECT COUNT(*)::int FROM shared.audit_log ${whereClause}`,
        countParams,
      );

      res.json({
        data: rows,
        pagination: {
          page,
          limit,
          total: parseInt(count, 10),
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

/**
 * Full history for one record — every audit row that mentions
 * this `record_id` in any table. Used by the "show audit trail"
 * button on most record-detail pages.
 */
router.get(
  "/record/:tableName/:recordId",
  param("tableName").isString().notEmpty(),
  param("recordId").isUUID(),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  validate,
  can("audit", "view"),
  async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const rows = await service.getForRecord(
        req.params.tableName,
        req.params.recordId,
        limit,
      );
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  },
);

/**
 * Activity log for one user — every audit row attributed to this
 * user_id. HR / compliance use case ("show me everything Amaka
 * has touched this month").
 */
router.get(
  "/user/:userId",
  param("userId").isUUID(),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  validate,
  can("audit", "view"),
  async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const rows = await service.getForUser(req.params.userId, limit);
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  },
);

/**
 * Lightweight activity feed — used by the Hub dashboard and
 * SmartComm sidebars. Returns a flat chronological slice of
 * recent audit events filtered by module and/or business.
 *
 * Query params:
 *   module   — optional module name filter
 *   business — optional business key filter
 *   limit    — max rows, default 20, max 100
 */
router.get(
  "/feed",
  query("module").optional().isString(),
  query("business").optional().isString(),
  query("limit").optional().isInt({ min: 1, max: 100 }),
  validate,
  can("audit", "view"),
  async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const conditions = [];
      const params = [];

      if (req.query.business) {
        params.push(req.query.business);
        conditions.push(`business = $${params.length}`);
      }
      if (req.query.module) {
        params.push(req.query.module);
        conditions.push(`module = $${params.length}`);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
      params.push(limit);

      const { rows } = await pool.query(
        `SELECT log_id, occurred_at, user_name, business, module,
                action, table_name, record_id
         FROM shared.audit_log
         ${where}
         ORDER BY occurred_at DESC
         LIMIT $${params.length}`,
        params,
      );

      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  },
);

/**
 * One audit row — used when the user clicks into an audit row from
 * the list view and wants to see the full before/after JSON.
 */
router.get(
  "/:logId",
  param("logId").isUUID(),
  validate,
  can("audit", "view"),
  async (req, res, next) => {
    try {
      const {
        rows: [row],
      } = await pool.query(`SELECT * FROM shared.audit_log WHERE log_id = $1`, [
        req.params.logId,
      ]);
      if (!row) {
        return res.status(404).json({ message: "Audit entry not found" });
      }
      res.json(row);
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
