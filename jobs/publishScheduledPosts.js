"use strict";

// ─────────────────────────────────────────────────────────────
// jobs/publishScheduledPosts
//
// Runs every 5 minutes (registered in jobs/index.js). Picks up any
// social posts whose scheduled_at <= now and publishes them via the
// social adapters (Instagram, Facebook, TikTok, YouTube).
//
// All real work lives in integrations/social/social.scheduler →
// modules/social/social.service.processDuePosts. This file is just
// the cron entry point that jobs/index.js requires.
// ─────────────────────────────────────────────────────────────

const {
  processScheduledPosts,
} = require("../integrations/social/social.scheduler");

module.exports = processScheduledPosts;
