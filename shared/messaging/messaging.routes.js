"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./messaging.service");

// ─── CHANNELS ────────────────────────────────────────────────

router.get(
  "/channels",
  query("business").optional().isString(),
  query("channel_type").optional().isIn(["group", "direct", "customer_thread"]),
  query("include_archived").optional().isBoolean(),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
  validate,
  can("messaging", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listChannels(req.query, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/unread-count",
  can("messaging", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getUnreadCount(req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/channels/:id",
  param("id").isUUID(),
  validate,
  can("messaging", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getChannel(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/channels",
  body("channel_type").isIn(["group", "direct"]),
  body("name").optional().isString(),
  body("business").optional().isString(),
  body("member_user_ids").optional().isArray(),
  validate,
  can("messaging", "create"),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createChannel(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/channels/:id/archive",
  param("id").isUUID(),
  validate,
  can("messaging", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.archiveChannel(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─── MEMBERS ─────────────────────────────────────────────────

router.post(
  "/channels/:id/members",
  param("id").isUUID(),
  body("user_id").optional({ checkFalsy: true }).isUUID(),
  body("contact_id").optional({ checkFalsy: true }).isUUID(),
  body("role").optional().isIn(["member", "admin"]),
  validate,
  can("messaging", "edit"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.addMember(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/channels/:id/members",
  param("id").isUUID(),
  body("user_id").optional({ checkFalsy: true }).isUUID(),
  body("contact_id").optional({ checkFalsy: true }).isUUID(),
  validate,
  can("messaging", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.removeMember(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─── MESSAGES ────────────────────────────────────────────────

router.get(
  "/channels/:id/messages",
  param("id").isUUID(),
  query("before").optional().isISO8601(),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  validate,
  can("messaging", "view"),
  async (req, res, next) => {
    try {
      const data = await service.listMessages(
        req.params.id,
        req.query,
        req.user,
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/channels/:id/messages",
  param("id").isUUID(),
  body("content").optional().isString(),
  body("message_type")
    .optional()
    .isIn(["text", "image", "document", "voice_note"]),
  body("reply_to_id").optional({ checkFalsy: true }).isUUID(),
  body("attachments").optional().isArray(),
  validate,
  can("messaging", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.sendMessage(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/messages/:id",
  param("id").isUUID(),
  validate,
  can("messaging", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.deleteMessage(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─── READ RECEIPTS ───────────────────────────────────────────

router.post(
  "/channels/:id/mark-read",
  param("id").isUUID(),
  body("up_to_message_id").optional({ checkFalsy: true }).isUUID(),
  validate,
  can("messaging", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.markRead(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─── THREAD ASSIGNMENT ─────────────────────────────────────────

router.patch(
  "/channels/:id/assign",
  param("id").isUUID(),
  body("assigned_to").optional({ nullable: true }).isUUID(),
  body("handoff_note").optional().isString(),
  validate,
  can("messaging", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.assignThread(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/channels/:id/resolve",
  param("id").isUUID(),
  validate,
  can("messaging", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.resolveThread(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─── EMOJI REACTIONS ───────────────────────────────────────────

router.post(
  "/messages/:id/react",
  param("id").isUUID(),
  body("emoji").isString().notEmpty(),
  validate,
  can("messaging", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.toggleReaction(req.params.id, req.body.emoji, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ─── CUSTOMER 360 ──────────────────────────────────────────────

router.get(
  "/customer-360/:contactId",
  param("contactId").isUUID(),
  validate,
  can("messaging", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getCustomer360(req.params.contactId, req.user));
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
