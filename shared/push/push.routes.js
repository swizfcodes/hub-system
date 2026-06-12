"use strict";

// ── /push — Web Push subscription endpoints ───────────────────────────────
// Mounted protected; req.user is set by verifyToken. The browser asks for
// the public VAPID key, subscribes via its PushManager, then registers
// the subscription here so lib/push can reach this user.

const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const validate = require("../../middleware/validateBody");
const push = require("../../lib/push");

// 204 while VAPID keys are not configured — the client quietly skips push.
router.get("/public-key", (req, res) => {
  const key = push.publicKey();
  if (!key) return res.status(204).end();
  res.json({ public_key: key });
});

router.post(
  "/subscribe",
  body("endpoint").isString().notEmpty(),
  body("keys.p256dh").isString().notEmpty(),
  body("keys.auth").isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      await push.saveSubscription({
        userId: req.user.user_id,
        endpoint: req.body.endpoint,
        p256dh: req.body.keys.p256dh,
        auth: req.body.keys.auth,
        userAgent: req.get("user-agent"),
      });
      res.status(201).json({ subscribed: true });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/subscribe",
  body("endpoint").isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const removed = await push.deleteSubscription(
        req.user.user_id,
        req.body.endpoint,
      );
      res.json({ removed });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
