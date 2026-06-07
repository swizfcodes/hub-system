"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./calendar.service");

// ─── LIST IN RANGE (calendar views) ──────────────────────────

router.get(
  "/events",
  query("from").optional().isISO8601(),
  query("to").optional().isISO8601(),
  query("business").optional().isString(),
  query("event_type").optional().isString(),
  query("created_by").optional().isUUID(),
  validate,
  can("calendar", "view"),
  async (req, res, next) => {
    try {
      res.json({ data: await service.listInRange(req.query) });
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/events/for-reference",
  query("reference_type").isString().notEmpty(),
  query("reference_id").isUUID(),
  validate,
  can("calendar", "view"),
  async (req, res, next) => {
    try {
      res.json({
        data: await service.listForReference({
          referenceType: req.query.reference_type,
          referenceId: req.query.reference_id,
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/events/:id",
  param("id").isUUID(),
  validate,
  can("calendar", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getEvent(req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

// ─── CREATE / UPDATE / DELETE ────────────────────────────────

router.post(
  "/events",
  body("business").isString().notEmpty(),
  body("title").isString().notEmpty(),
  body("event_type").isString().notEmpty(),
  body("start_at").isISO8601(),
  body("end_at").isISO8601(),
  body("all_day").optional().isBoolean(),
  body("location").optional().isString(),
  body("description").optional().isString(),
  body("recurrence_rule").optional().isString(),
  body("reference_type").optional().isString(),
  body("reference_id").optional({ checkFalsy: true }).isUUID(),
  body("force").optional().isBoolean(),
  validate,
  can("calendar", "create"),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createEvent(req.body, req.user));
    } catch (e) {
      // Surface clash info on 409 so the frontend can prompt
      // "this clashes with X, Y — override?".
      if (e.code === "CLASH_DETECTED") {
        return res.status(409).json({
          message: e.message,
          code: "CLASH_DETECTED",
          clashes: e.clashes,
        });
      }
      next(e);
    }
  },
);

router.patch(
  "/events/:id",
  param("id").isUUID(),
  body("start_at").optional().isISO8601(),
  body("end_at").optional().isISO8601(),
  body("force").optional().isBoolean(),
  validate,
  can("calendar", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.updateEvent(req.params.id, req.body, req.user));
    } catch (e) {
      if (e.code === "CLASH_DETECTED") {
        return res.status(409).json({
          message: e.message,
          code: "CLASH_DETECTED",
          clashes: e.clashes,
        });
      }
      next(e);
    }
  },
);

router.delete(
  "/events/:id",
  param("id").isUUID(),
  validate,
  can("calendar", "delete"),
  async (req, res, next) => {
    try {
      res.json(await service.deleteEvent(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─── PARTICIPANTS ────────────────────────────────────────────

// GET /calendar/events/:id/participants
router.get(
  "/events/:id/participants",
  param("id").isUUID(),
  validate,
  can("calendar", "view"),
  async (req, res, next) => {
    try {
      res.json({ data: await service.listParticipants(req.params.id) });
    } catch (e) {
      next(e);
    }
  },
);

// POST /calendar/events/:id/participants
router.post(
  "/events/:id/participants",
  param("id").isUUID(),
  body("user_id").optional({ checkFalsy: true }).isUUID(),
  body("contact_id").optional({ checkFalsy: true }).isUUID(),
  validate,
  can("calendar", "edit"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.addParticipant(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// DELETE /calendar/events/:id/participants/:pid
router.delete(
  "/events/:id/participants/:pid",
  param("id").isUUID(),
  param("pid").isUUID(),
  validate,
  can("calendar", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.removeParticipant(req.params.pid));
    } catch (e) {
      next(e);
    }
  },
);

// POST /calendar/events/:id/participants/:pid/respond — RSVP
router.post(
  "/events/:id/participants/:pid/respond",
  param("id").isUUID(),
  param("pid").isUUID(),
  body("status").isIn(["accepted", "declined", "tentative"]),
  validate,
  can("calendar", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.respondToEvent(req.params.pid, req.body.status));
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
