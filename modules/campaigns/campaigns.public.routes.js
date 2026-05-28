"use strict";

// Public tracking routes — hit from email clients with NO JWT.
// MUST be mounted on /api/campaigns BEFORE the authenticated
// /api/campaigns router in app.js, so verifyToken is never applied
// to /track/:token, /track/:token/click, or /unsubscribe/:token.
//
// The handlers here delegate to the same campaigns service as the
// authenticated routes; only the auth posture differs.

const express = require("express");
const { query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const service = require("./campaigns.service");

const router = express.Router();

// Open pixel — always returns a 1×1 GIF even on bad tokens, so an
// invalid token never breaks an email's display.
router.get("/track/:token", async (req, res) => {
  try {
    const pixel = await service.handlePixelOpen(req.params.token, {
      ip: req.ip,
      user_agent: req.get("user-agent"),
    });
    res.set({ "Content-Type": "image/gif", "Content-Length": pixel.length });
    res.send(pixel);
  } catch {
    const fallback = Buffer.from(
      "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
      "base64",
    );
    res.set({
      "Content-Type": "image/gif",
      "Content-Length": fallback.length,
    });
    res.send(fallback);
  }
});

// Click redirect — record the click, then 302 to the real URL.
router.get(
  "/track/:token/click",
  query("url").isURL({ require_protocol: true }),
  validate,
  async (req, res, next) => {
    try {
      const { redirectTo } = await service.handleClick(
        req.params.token,
        req.query.url,
        { ip: req.ip, user_agent: req.get("user-agent") },
      );
      res.redirect(302, redirectTo);
    } catch (err) {
      next(err);
    }
  },
);

// Unsubscribe — usually hit from an email footer link.
router.get("/unsubscribe/:token", async (req, res) => {
  const result = await service.handleUnsubscribe(req.params.token, {
    ip: req.ip,
  });
  const message = result.ok
    ? "You have been unsubscribed. We're sorry to see you go."
    : "Unsubscribe link is invalid or expired.";
  res.set("Content-Type", "text/html");
  res.send(
    `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:48px">
      <h2>${message}</h2>
    </body></html>`,
  );
});

module.exports = router;
