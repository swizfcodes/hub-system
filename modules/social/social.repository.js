"use strict";

const { withSharedContext } = require("../../config/db");

// ─────────────────────────────────────────────────────────────
// social.repository
//
// All SQL for the social_posts module. The table lives in the shared
// schema (not per-business) because social posts are brand-level
// advertising rather than financial records, and the published-to
// platforms (Instagram, Facebook, TikTok, YouTube) use a single set
// of Meta/TikTok/YouTube credentials per Hub install today.
//
// Every function takes withSharedContext-supplied client OR opens its
// own — the service layer chooses, like the rest of the codebase.
// ─────────────────────────────────────────────────────────────

const VALID_CHANNELS = ["instagram", "facebook", "tiktok", "youtube"];

async function list(client, { business, status, limit = 50, offset = 0 }) {
  const { rows } = await client.query(
    `SELECT post_id, business, channels, caption, title, description,
            media_paths, video_path, scheduled_at, published_at, status,
            external_ids, campaign_id, created_by, created_at, updated_at
     FROM shared.social_posts
     WHERE business = $1
       AND ($2::TEXT IS NULL OR status = $2)
     ORDER BY scheduled_at DESC
     LIMIT $3 OFFSET $4`,
    [business, status || null, limit, offset],
  );
  return rows;
}

async function findById(client, postId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.social_posts WHERE post_id = $1`,
    [postId],
  );
  return row || null;
}

/**
 * The hot path for the scheduler — pick up everything due to publish.
 * Index `idx_social_posts_scheduled_pickup` makes this a fast partial
 * index scan rather than a table sweep.
 */
async function findDueForPublishing(client, { limit = 50 }) {
  const { rows } = await client.query(
    `SELECT * FROM shared.social_posts
     WHERE status = 'scheduled' AND scheduled_at <= now()
     ORDER BY scheduled_at ASC
     LIMIT $1`,
    [limit],
  );
  return rows;
}

async function insert(
  client,
  {
    business,
    channels,
    caption,
    title,
    description,
    media_paths,
    video_path,
    scheduled_at,
    campaign_id,
    created_by,
    status = "scheduled",
  },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.social_posts
       (business, channels, caption, title, description,
        media_paths, video_path, scheduled_at, campaign_id, created_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      business,
      channels,
      caption || null,
      title || null,
      description || null,
      media_paths || [],
      video_path || null,
      scheduled_at,
      campaign_id || null,
      created_by,
      status,
    ],
  );
  return row;
}

async function update(
  client,
  postId,
  {
    caption,
    title,
    description,
    media_paths,
    video_path,
    scheduled_at,
    channels,
  },
) {
  // Only allow editing posts that haven't fired yet — once a post is
  // publishing/published the caption is on the platform and editing
  // here wouldn't reflect there.
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.social_posts
     SET caption       = COALESCE($2, caption),
         title         = COALESCE($3, title),
         description   = COALESCE($4, description),
         media_paths   = COALESCE($5, media_paths),
         video_path    = COALESCE($6, video_path),
         scheduled_at  = COALESCE($7, scheduled_at),
         channels      = COALESCE($8, channels),
         updated_at    = now()
     WHERE post_id = $1
       AND status IN ('draft','scheduled')
     RETURNING *`,
    [
      postId,
      caption ?? null,
      title ?? null,
      description ?? null,
      media_paths ?? null,
      video_path ?? null,
      scheduled_at ?? null,
      channels ?? null,
    ],
  );
  return row || null;
}

async function cancel(client, postId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.social_posts
     SET status = 'cancelled', updated_at = now()
     WHERE post_id = $1 AND status IN ('draft','scheduled')
     RETURNING *`,
    [postId],
  );
  return row || null;
}

/**
 * Mark a post as in-flight. Done at the very top of the publish loop
 * so a second scheduler instance (in a multi-worker deploy) doesn't
 * pick up the same post.
 *
 * Returns null if the row was already taken by another worker — the
 * caller treats that as "skip" rather than an error.
 */
async function markPublishing(client, postId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.social_posts
     SET status = 'publishing', updated_at = now()
     WHERE post_id = $1 AND status = 'scheduled'
     RETURNING *`,
    [postId],
  );
  return row || null;
}

/**
 * Final-state update after the publish attempt. Status is computed
 * by the caller based on per-channel results.
 */
async function markPublished(
  client,
  postId,
  { status, external_ids, published_at },
) {
  await client.query(
    `UPDATE shared.social_posts
     SET status        = $2,
         external_ids  = $3::jsonb,
         published_at  = $4,
         updated_at    = now()
     WHERE post_id = $1`,
    [
      postId,
      status,
      JSON.stringify(external_ids || {}),
      published_at || new Date(),
    ],
  );
}

// ─── Metrics ─────────────────────────────────────────────────

async function insertMetric(
  client,
  {
    post_id,
    channel,
    likes,
    comments,
    shares,
    saves,
    reach,
    impressions,
    extras,
  },
) {
  await client.query(
    `INSERT INTO shared.social_post_metrics
       (post_id, channel, likes, comments, shares, saves, reach, impressions, extras)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      post_id,
      channel,
      likes || 0,
      comments || 0,
      shares || 0,
      saves || 0,
      reach || 0,
      impressions || 0,
      JSON.stringify(extras || {}),
    ],
  );
}

async function getMetricsForPost(client, postId) {
  const { rows } = await client.query(
    `SELECT channel, fetched_at, likes, comments, shares, saves,
            reach, impressions, extras
     FROM shared.social_post_metrics
     WHERE post_id = $1
     ORDER BY fetched_at DESC`,
    [postId],
  );
  return rows;
}

module.exports = {
  VALID_CHANNELS,
  list,
  findById,
  findDueForPublishing,
  insert,
  update,
  cancel,
  markPublishing,
  markPublished,
  insertMetric,
  getMetricsForPost,
};
