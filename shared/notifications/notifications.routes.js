"use strict";

const express = require("express");
const router = express.Router();
const { param, body } = require("express-validator");
const validate = require("../../middleware/validateBody");
const service = require("./notifications.service");

// ─── NOTIFICATION PREFERENCES ────────────────────────────────
// Per-user channel toggles. Scoped to the calling user — no
// permission gate needed, a user manages only their own prefs.
//   GET    /notifications/preferences
//   PUT    /notifications/preferences           — upsert one type
//   DELETE /notifications/preferences/:type     — revert to defaults

router.get("/preferences", async (req, res, next) => {
  try {
    res.json(await service.listPreferences(req.user));
  } catch (err) {
    next(err);
  }
});

router.put(
  "/preferences",
  body("notification_type").isString().notEmpty(),
  body("in_app").optional().isBoolean(),
  body("email_enabled").optional().isBoolean(),
  body("whatsapp_enabled").optional().isBoolean(),
  body("sms_enabled").optional().isBoolean(),
  body("push_enabled").optional().isBoolean(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.setPreference(req.user, req.body));
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/preferences/:type",
  param("type").isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.deletePreference(req.user, req.params.type));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/notifications — list unread for current user
router.get("/", async (req, res, next) => {
  try {
    const result = await service.list(
      req.user.user_id,
      req.business,
      req.query,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/read-all
// MUST be registered before "/:id/read" — otherwise Express matches
// "read-all" against the ":id" param and the UUID validator rejects it.
router.patch("/read-all", async (req, res, next) => {
  try {
    await service.markAllRead(req.user.user_id, req.business);
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read
router.patch(
  "/:id/read",
  param("id").isUUID(),
  validate,
  async (req, res, next) => {
    try {
      await service.markRead(req.params.id, req.user.user_id);
      res.json({ message: "Marked as read" });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
