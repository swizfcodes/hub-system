"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./tasks.service");

// ─── KANBAN BOARD ────────────────────────────────────────────

router.get(
  "/board",
  query("business").optional().isString(),
  query("assigned_to").optional().isUUID(),
  query("reference_type").optional().isString(),
  query("reference_id").optional().isUUID(),
  validate,
  can("tasks", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getBoard(req.query));
    } catch (e) {
      next(e);
    }
  },
);

// ─── LIST / GET ──────────────────────────────────────────────

router.get(
  "/",
  query("business").optional().isString(),
  query("status").optional().isString(),
  query("assigned_to").optional().isUUID(),
  query("created_by").optional().isUUID(),
  query("reference_type").optional().isString(),
  query("reference_id").optional().isUUID(),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  validate,
  can("tasks", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listTasks(req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/:id",
  param("id").isUUID(),
  validate,
  can("tasks", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getTask(req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

// ─── CREATE / UPDATE / DELETE ────────────────────────────────

router.post(
  "/",
  body("business").isString().notEmpty(),
  body("title").isString().notEmpty(),
  body("status").optional().isString(),
  body("priority").optional().isString(),
  // checkFalsy → empty strings from the form are treated as "not provided"
  // (the previous .optional() only skipped undefined, so '' failed isUUID/isISO8601
  // and the whole create 400'd).
  body("assigned_to").optional({ checkFalsy: true }).isUUID(),
  body("due_at").optional({ checkFalsy: true }).isISO8601(),
  body("reminder_minutes").optional({ checkFalsy: true }).isInt({ min: 0 }),
  body("is_personal").optional().isBoolean(),
  body("parent_task_id").optional({ checkFalsy: true }).isUUID(),
  body("reference_type").optional({ checkFalsy: true }).isString(),
  body("reference_id").optional({ checkFalsy: true }).isUUID(),
  validate,
  can("tasks", "create"),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createTask(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/:id",
  param("id").isUUID(),
  body("status").optional().isString(),
  body("priority").optional().isString(),
  body("assigned_to").optional({ nullable: true, checkFalsy: true }).isUUID(),
  body("due_at").optional({ nullable: true, checkFalsy: true }).isISO8601(),
  body("reminder_minutes")
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 0 }),
  body("is_personal").optional().isBoolean(),
  validate,
  can("tasks", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.updateTask(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// Drag-and-drop on the kanban board calls this with just the new column.
router.post(
  "/:id/move",
  param("id").isUUID(),
  body("status").isString().notEmpty(),
  validate,
  can("tasks", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.moveTask(req.params.id, req.body.status, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/:id",
  param("id").isUUID(),
  validate,
  can("tasks", "delete"),
  async (req, res, next) => {
    try {
      res.json(await service.deleteTask(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─── SUBTASKS ────────────────────────────────────────────────

router.get(
  "/:id/subtasks",
  param("id").isUUID(),
  validate,
  can("tasks", "view"),
  async (req, res, next) => {
    try {
      res.json({ data: await service.listSubtasks(req.params.id) });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/:id/subtasks",
  param("id").isUUID(),
  body("title").isString().notEmpty(),
  body("display_order").optional().isInt({ min: 0 }),
  validate,
  can("tasks", "edit"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.addSubtask(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/subtasks/:subtaskId",
  param("subtaskId").isUUID(),
  body("is_done").isBoolean(),
  validate,
  can("tasks", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.setSubtaskDone(
          req.params.subtaskId,
          req.body.is_done,
          req.user,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/subtasks/:subtaskId",
  param("subtaskId").isUUID(),
  validate,
  can("tasks", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.deleteSubtask(req.params.subtaskId, req.user));
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
