"use strict";

// ─────────────────────────────────────────────────────────────
// integrations/social/social.scheduler
//
// The scheduler entry point invoked by jobs/publishScheduledPosts.js
// every 5 minutes. Delegates to modules/social/social.service which
// owns:
//   - the social_posts table
//   - the publish-and-record-results lifecycle
//   - per-post audit logging
//
// Keeping this file thin means the scheduler and the manual
// "publish now" endpoint go through exactly the same code path —
// no behavioural drift between the cron and the button.
// ─────────────────────────────────────────────────────────────

const socialModule = require("../../modules/social/social.service");
const logger = require("../../config/logger");

async function processScheduledPosts() {
  try {
    const summary = await socialModule.processDuePosts({ batchSize: 50 });
    if (summary.picked > 0) {
      logger.info(
        `[social.scheduler] picked=${summary.picked} ` +
          `published=${summary.published} ` +
          `partial=${summary.partial} ` +
          `failed=${summary.failed}`,
      );
    }
    return summary;
  } catch (err) {
    // Cron errors must not crash the scheduler process — log loudly
    // and let the next tick try again.
    logger.error(
      `[social.scheduler] processScheduledPosts failed: ${err.message}`,
    );
    return { picked: 0, error: err.message };
  }
}

module.exports = { processScheduledPosts };
