"use strict";

// ─────────────────────────────────────────────────────────────
// HR ROUTES  (mounted at /api/hr)
//
// Two audiences:
//   - Self-service (any signed-in employee): /me/* plus clock in/out,
//     justify, respond to queries, acknowledge reviews. These resolve
//     the caller's own profile — no can() gate.
//   - Management (HR / CEO): everything else, gated by can('staff', …).
// ─────────────────────────────────────────────────────────────

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./hr.service");

// Express sees the proxy IP; req.ip already honours trust proxy config.
const clientIp = (req) => req.ip || req.connection?.remoteAddress || null;

// ═══════════════════════════════════════════════════════════
// SELF-SERVICE — "My HR"
// ═══════════════════════════════════════════════════════════

router.get("/me", async (req, res, next) => {
  try {
    res.json(await service.getMyHrSummary(req.user));
  } catch (e) {
    next(e);
  }
});

router.get("/me/attendance", async (req, res, next) => {
  try {
    res.json(
      await service.listMyAttendance(req.user, {
        fromDate: req.query.from_date,
        toDate: req.query.to_date,
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.get("/me/today", async (req, res, next) => {
  try {
    res.json(await service.getMyToday(req.user));
  } catch (e) {
    next(e);
  }
});

router.get("/me/performance", async (req, res, next) => {
  try {
    res.json(await service.getMyPerformance(req.user));
  } catch (e) {
    next(e);
  }
});

router.get("/me/queries", async (req, res, next) => {
  try {
    res.json(await service.listMyQueries(req.user));
  } catch (e) {
    next(e);
  }
});

// ── Clock in / out ──
router.post(
  "/clock-in",
  body("latitude").optional().isFloat({ min: -90, max: 90 }),
  body("longitude").optional().isFloat({ min: -180, max: 180 }),
  body("accuracy").optional().isFloat({ min: 0 }),
  body("location_label").optional().isString(),
  validate,
  async (req, res, next) => {
    try {
      res.status(201).json(
        await service.clockIn(req.user, {
          latitude: req.body.latitude,
          longitude: req.body.longitude,
          accuracy: req.body.accuracy,
          locationLabel: req.body.location_label,
          ip: clientIp(req),
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/clock-out",
  body("latitude").optional().isFloat({ min: -90, max: 90 }),
  body("longitude").optional().isFloat({ min: -180, max: 180 }),
  validate,
  async (req, res, next) => {
    try {
      res.json(
        await service.clockOut(req.user, {
          latitude: req.body.latitude,
          longitude: req.body.longitude,
          ip: clientIp(req),
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ── Submit a justification on my own attendance row ──
router.post(
  "/attendance/:id/justify",
  param("id").isUUID(),
  body("type").optional().isIn(["lateness", "absence", "offsite"]),
  body("note").isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      res.json(
        await service.submitJustification(req.user, req.params.id, {
          type: req.body.type,
          note: req.body.note,
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ── Respond to / acknowledge ──
router.post(
  "/queries/:id/respond",
  param("id").isUUID(),
  body("response").isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.respondToQuery(req.params.id, req.body.response, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/reviews/:id/acknowledge",
  param("id").isUUID(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.acknowledgeReview(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ═══════════════════════════════════════════════════════════
// MANAGEMENT — gated by can('staff', …)
// ═══════════════════════════════════════════════════════════

// ── Overview dashboard ──
router.get("/overview", can("staff", "view"), async (req, res, next) => {
  try {
    res.json(await service.getOverview(req.query));
  } catch (e) {
    next(e);
  }
});

// ── Attendance ──
router.get(
  "/attendance",
  query("profile_id").optional().isUUID(),
  query("from_date").optional().isISO8601(),
  query("to_date").optional().isISO8601(),
  query("status").optional().isString(),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listAttendance(req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/attendance/reconcile",
  body("date").isISO8601(),
  body("business").optional().isString(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.reconcileDay(req.body.date, req.body.business, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/attendance/:id/justification/:decision",
  param("id").isUUID(),
  param("decision").isIn(["approve", "reject"]),
  validate,
  can("staff", "approve"),
  async (req, res, next) => {
    try {
      const status = req.params.decision === "approve" ? "approved" : "rejected";
      res.json(await service.reviewJustification(req.params.id, { status }, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ── Work schedule ──
router.get(
  "/schedule/:profileId",
  param("profileId").isUUID(),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getSchedule(req.params.profileId));
    } catch (e) {
      next(e);
    }
  },
);

router.put(
  "/schedule/:profileId",
  param("profileId").isUUID(),
  body("work_location_type").optional().isIn(["on_site", "remote", "hybrid"]),
  body("work_schedule").optional().isObject(),
  body("expected_start_time").optional().isString(),
  body("grace_minutes").optional().isInt({ min: 0, max: 240 }),
  body("work_location_id").optional().isUUID(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.updateSchedule(req.params.profileId, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ── Work locations (office geofences) ──
router.get("/work-locations", can("staff", "view"), async (req, res, next) => {
  try {
    res.json(await service.listWorkLocations(req.query.business));
  } catch (e) {
    next(e);
  }
});

router.post(
  "/work-locations",
  body("name").isString().notEmpty(),
  body("latitude").optional().isFloat({ min: -90, max: 90 }),
  body("longitude").optional().isFloat({ min: -180, max: 180 }),
  body("geofence_radius_m").optional().isInt({ min: 10, max: 50000 }),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createWorkLocation(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/work-locations/:id",
  param("id").isUUID(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.updateWorkLocation(req.params.id, req.body));
    } catch (e) {
      next(e);
    }
  },
);

// ── Queries ──
router.get(
  "/queries",
  query("profile_id").optional().isUUID(),
  query("status").optional().isIn(["open", "responded", "closed", "escalated"]),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listQueries(req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/queries",
  body("profile_id").isUUID(),
  body("query_type")
    .optional()
    .isIn(["lateness", "absence", "offsite_clockin", "conduct", "performance", "other"]),
  body("severity").optional().isIn(["low", "normal", "high"]),
  body("related_attendance_id").optional().isUUID(),
  body("subject").isString().notEmpty(),
  body("details").isString().notEmpty(),
  body("due_date").optional().isISO8601(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.raiseQuery(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/queries/:id/resolve",
  param("id").isUUID(),
  body("status").isIn(["closed", "escalated", "open"]),
  body("resolution").optional().isString(),
  validate,
  can("staff", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.resolveQuery(
          req.params.id,
          { status: req.body.status, resolution: req.body.resolution },
          req.user,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ── Performance ──
router.get(
  "/performance/:profileId",
  param("profileId").isUUID(),
  query("from").optional().isISO8601(),
  query("to").optional().isISO8601(),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.computePerformance(req.params.profileId, {
          from: req.query.from,
          to: req.query.to,
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/performance/:profileId/goals",
  param("profileId").isUUID(),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listGoals(req.params.profileId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/performance/:profileId/goals",
  param("profileId").isUUID(),
  body("title").isString().notEmpty(),
  body("target_value").optional().isFloat(),
  body("current_value").optional().isFloat(),
  body("weight").optional().isInt({ min: 1, max: 10 }),
  body("due_date").optional().isISO8601(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createGoal(req.params.profileId, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/performance/goals/:goalId",
  param("goalId").isUUID(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.updateGoal(req.params.goalId, req.body));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/performance/:profileId/reviews",
  param("profileId").isUUID(),
  body("period_start").isISO8601(),
  body("period_end").isISO8601(),
  body("overall_rating").optional().isFloat({ min: 0, max: 5 }),
  body("status").optional().isIn(["draft", "shared", "acknowledged"]),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createReview(req.params.profileId, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/performance/reviews/:reviewId",
  param("reviewId").isUUID(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.updateReview(req.params.reviewId, req.body));
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
