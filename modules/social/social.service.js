"use strict";

const { withSharedContext } = require("../../config/db");
const socialPublisher = require("../../integrations/social/social.service");
const businesses = require("../../config/businesses");
const auditService = require("../../shared/audit/audit.service");
const logger = require("../../config/logger");
const repo = require("./social.repository");

// ─────────────────────────────────────────────────────────────
// social.service
//
// The orchestration layer for Module 14 (Social Media Management).
// Has two distinct responsibilities:
//
//   1. Manage the social_posts table — schedule, list, view, edit,
//      cancel. This is what the admin UI talks to.
//
//   2. Publish a post NOW — used both by `publishNow` (manual) and by
//      `processDuePosts` (the scheduler cron). Calls the platform
//      adapters via integrations/social/social.service.publishPost.
//
// The integrations layer knows how to talk to Instagram / Facebook /
// TikTok / YouTube. This layer knows what's scheduled, who owns it,
// and what to do when the publish succeeds, partially fails, or fails
// entirely.
// ─────────────────────────────────────────────────────────────

// ── LIST / READ ──────────────────────────────────────────────

async function list(business, { status, page = 1, limit = 50 } = {}) {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  return withSharedContext(async (client) => {
    const data = await repo.list(client, {
      business,
      status,
      limit: parseInt(limit),
      offset,
    });
    return { data };
  });
}

async function getById(business, postId) {
  return withSharedContext(async (client) => {
    const row = await repo.findById(client, postId);
    if (!row) {
      throw Object.assign(new Error("Social post not found"), { status: 404 });
    }
    if (row.business !== business) {
      // Don't leak the existence of other brands' posts.
      throw Object.assign(new Error("Social post not found"), { status: 404 });
    }
    // Include metrics if the post was published.
    if (row.status === "published" || row.status === "partial") {
      row.metrics = await repo.getMetricsForPost(client, postId);
    }
    return row;
  });
}

// ── CREATE / SCHEDULE ────────────────────────────────────────

/**
 * Validate the channels array against the four supported platforms.
 * Throws a 400 on anything unrecognised.
 */
function validateChannels(channels) {
  if (!Array.isArray(channels) || channels.length === 0) {
    throw Object.assign(new Error("channels must be a non-empty array"), {
      status: 400,
    });
  }
  for (const c of channels) {
    if (!repo.VALID_CHANNELS.includes(c)) {
      throw Object.assign(
        new Error(
          `Unknown channel: ${c} (allowed: ${repo.VALID_CHANNELS.join(", ")})`,
        ),
        { status: 400 },
      );
    }
  }
}

/**
 * Validate scheduled_at — must be in the future (with a 60-second
 * grace so "publish now" UI flows don't fight the clock).
 */
function validateScheduledAt(scheduledAt) {
  if (!scheduledAt) return null; // drafts have no scheduled_at
  const when = new Date(scheduledAt);
  if (isNaN(when.getTime())) {
    throw Object.assign(new Error("scheduled_at must be a valid timestamp"), {
      status: 400,
    });
  }
  if (when.getTime() < Date.now() - 60_000) {
    throw Object.assign(new Error("scheduled_at cannot be in the past"), {
      status: 400,
    });
  }
  return when;
}

/**
 * Validate that media is consistent with the chosen channels. Image
 * posts (IG/FB) need at least one media path. Video posts (TT/YT)
 * need video_path. A mixed post (IG + YouTube) needs both.
 */
function validateMedia(channels, { media_paths = [], video_path }) {
  const wantsImage = channels.some(
    (c) => c === "instagram" || c === "facebook",
  );
  const wantsVideo = channels.some((c) => c === "tiktok" || c === "youtube");

  if (wantsImage && media_paths.length === 0) {
    throw Object.assign(
      new Error(
        "Instagram and Facebook posts require at least one image in media_paths",
      ),
      { status: 400 },
    );
  }
  if (wantsVideo && !video_path) {
    throw Object.assign(
      new Error("TikTok and YouTube posts require video_path"),
      { status: 400 },
    );
  }
}

async function schedule(business, data, user) {
  if (!businesses.isValidBusiness(business)) {
    throw Object.assign(new Error(`Unknown business: ${business}`), {
      status: 400,
    });
  }
  validateChannels(data.channels);
  const isDraft = data.status === "draft";
  const when = validateScheduledAt(data.scheduled_at);
  if (!isDraft && !when) {
    throw Object.assign(
      new Error("scheduled_at is required unless saving as a draft"),
      { status: 400 },
    );
  }
  validateMedia(data.channels, {
    media_paths: data.media_paths,
    video_path: data.video_path,
  });

  return withSharedContext(async (client) => {
    const row = await repo.insert(client, {
      business,
      channels: data.channels,
      caption: data.caption,
      title: data.title,
      description: data.description,
      media_paths: data.media_paths || [],
      video_path: data.video_path,
      scheduled_at: when,
      campaign_id: data.campaign_id,
      created_by: user.user_id,
      status: data.status || "scheduled",
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "social",
      action: "create",
      table: "social_posts",
      recordId: row.post_id,
      after: row,
    });

    return row;
  });
}

async function update(business, postId, data, user) {
  return withSharedContext(async (client) => {
    const existing = await repo.findById(client, postId);
    if (!existing || existing.business !== business) {
      throw Object.assign(new Error("Social post not found"), { status: 404 });
    }
    if (!["draft", "scheduled"].includes(existing.status)) {
      throw Object.assign(
        new Error(
          `Cannot edit a ${existing.status} post — content is already on the platform`,
        ),
        { status: 400 },
      );
    }

    // If channels or scheduled_at are being changed, re-validate.
    if (data.channels) validateChannels(data.channels);
    if (data.scheduled_at)
      data.scheduled_at = validateScheduledAt(data.scheduled_at);

    const updated = await repo.update(client, postId, data);
    if (!updated) {
      throw Object.assign(new Error("Post could not be updated"), {
        status: 400,
      });
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "social",
      action: "edit",
      table: "social_posts",
      recordId: postId,
      before: existing,
      after: updated,
    });

    return updated;
  });
}

async function cancel(business, postId, user) {
  return withSharedContext(async (client) => {
    const existing = await repo.findById(client, postId);
    if (!existing || existing.business !== business) {
      throw Object.assign(new Error("Social post not found"), { status: 404 });
    }
    const row = await repo.cancel(client, postId);
    if (!row) {
      throw Object.assign(
        new Error(`Cannot cancel a ${existing.status} post`),
        { status: 400 },
      );
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "social",
      action: "delete",
      table: "social_posts",
      recordId: postId,
      before: existing,
      after: row,
    });

    return row;
  });
}

// ── PUBLISH ──────────────────────────────────────────────────

/**
 * The actual publish step — calls the platform adapters via
 * integrations/social/social.service.publishPost, then stores the
 * per-channel results back on the row.
 *
 * Used by:
 *   - publishNow(postId)       — manual "publish immediately" button
 *   - processDuePosts()         — the cron picking up scheduled posts
 *
 * The two callers differ only in how they pick the post; the publish
 * mechanics are identical.
 */
async function publishOne(client, post) {
  // Claim the row first so a concurrent scheduler instance won't
  // double-publish. If the claim fails the row was already taken —
  // we treat that as a no-op success.
  const claimed = await repo.markPublishing(client, post.post_id);
  if (!claimed) {
    logger.debug(
      `[social] post ${post.post_id} already claimed by another worker, skipping`,
    );
    return null;
  }

  const results = await socialPublisher.publishPost({
    channels: claimed.channels,
    imageUrls: claimed.media_paths || [],
    caption: claimed.caption,
    videoPath: claimed.video_path,
    title: claimed.title,
    description: claimed.description,
  });

  // Compute final status from per-channel outcomes.
  const succeeded = results.filter((r) => r.status === "published").length;
  const total = results.length;
  let finalStatus;
  if (succeeded === total) finalStatus = "published";
  else if (succeeded === 0) finalStatus = "failed";
  else finalStatus = "partial";

  // Reshape adapter results into a stable per-channel map for storage.
  const externalIds = {};
  for (const r of results) {
    externalIds[r.channel] =
      r.status === "published"
        ? { status: "published", postId: r.postId }
        : { status: "failed", error: r.error };
  }

  await repo.markPublished(client, post.post_id, {
    status: finalStatus,
    external_ids: externalIds,
    published_at: new Date(),
  });

  logger.info(
    `[social] published ${post.post_id} → ${finalStatus} (${succeeded}/${total} channels)`,
  );

  return { post_id: post.post_id, status: finalStatus, results };
}

async function publishNow(business, postId, user) {
  return withSharedContext(async (client) => {
    const post = await repo.findById(client, postId);
    if (!post || post.business !== business) {
      throw Object.assign(new Error("Social post not found"), { status: 404 });
    }
    if (!["draft", "scheduled"].includes(post.status)) {
      throw Object.assign(new Error(`Cannot publish a ${post.status} post`), {
        status: 400,
      });
    }
    const result = await publishOne(client, post);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "social",
      action: "publish",
      table: "social_posts",
      recordId: postId,
      after: { status: result?.status },
    });
    return result;
  });
}

/**
 * Cron entry point — invoked every 5 minutes from jobs/publishScheduledPosts.
 *
 * Picks up every row where status='scheduled' AND scheduled_at <= now,
 * publishes each, and returns a summary. Errors on individual posts
 * don't stop the whole batch — each post is its own atomic outcome.
 */
async function processDuePosts({ batchSize = 50 } = {}) {
  return withSharedContext(async (client) => {
    const due = await repo.findDueForPublishing(client, { limit: batchSize });
    if (due.length === 0) {
      return { picked: 0, published: 0, partial: 0, failed: 0 };
    }

    logger.info(`[social] scheduler picked up ${due.length} due post(s)`);

    let published = 0,
      partial = 0,
      failed = 0;

    for (const post of due) {
      try {
        const result = await publishOne(client, post);
        if (!result) continue; // already-claimed; skip silently
        if (result.status === "published") published++;
        else if (result.status === "partial") partial++;
        else failed++;
      } catch (err) {
        // A truly unexpected exception (network glitch, adapter throw
        // outside the catch) — log it and mark the post as failed so
        // we don't infinitely retry it on the next tick.
        logger.error(
          `[social] unexpected error publishing ${post.post_id}: ${err.message}`,
        );
        await repo.markPublished(client, post.post_id, {
          status: "failed",
          external_ids: { error: err.message },
        });
        failed++;
      }
    }

    return { picked: due.length, published, partial, failed };
  });
}

// ── METRICS ──────────────────────────────────────────────────

async function recordMetric(
  business,
  postId,
  { channel, likes, comments, shares, saves, reach, impressions, extras },
) {
  return withSharedContext(async (client) => {
    const post = await repo.findById(client, postId);
    if (!post || post.business !== business) {
      throw Object.assign(new Error("Social post not found"), { status: 404 });
    }
    await repo.insertMetric(client, {
      post_id: postId,
      channel,
      likes,
      comments,
      shares,
      saves,
      reach,
      impressions,
      extras,
    });
    return { ok: true };
  });
}

async function getMetrics(business, postId) {
  return withSharedContext(async (client) => {
    const post = await repo.findById(client, postId);
    if (!post || post.business !== business) {
      throw Object.assign(new Error("Social post not found"), { status: 404 });
    }
    const rows = await repo.getMetricsForPost(client, postId);
    return { data: rows };
  });
}

module.exports = {
  list,
  getById,
  schedule,
  update,
  cancel,
  publishNow,
  processDuePosts,
  recordMetric,
  getMetrics,
  // exposed for tests / scheduler diagnostics
  publishOne,
};
