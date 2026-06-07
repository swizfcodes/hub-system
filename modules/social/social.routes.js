"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./social.service");

// ─────────────────────────────────────────────────────────────
// social.routes — Module 14 (Social Media Management)
//
// Endpoints exposed:
//   GET    /api/social/posts              — list scheduled + published
//   GET    /api/social/posts/:id          — view one with metrics
//   POST   /api/social/posts              — schedule a new post
//   PATCH  /api/social/posts/:id          — edit (only while draft/scheduled)
//   DELETE /api/social/posts/:id          — cancel (only while draft/scheduled)
//   POST   /api/social/posts/:id/publish  — publish immediately
//   GET    /api/social/posts/:id/metrics  — engagement snapshots
//   POST   /api/social/posts/:id/metrics  — record an engagement snapshot
//                                             (called by the metric-refresh cron)
//
// All endpoints scope to req.business via the businessContext
// middleware, so the same logical post never leaks across brands.
// ─────────────────────────────────────────────────────────────

// ── LIST ─────────────────────────────────────────────────────

router.get(
  "/posts",
  query("status")
    .optional()
    .isIn([
      "draft",
      "scheduled",
      "publishing",
      "published",
      "partial",
      "failed",
      "cancelled",
    ]),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  validate,
  can("social", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.list(req.business, req.query));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/posts/:id",
  param("id").isUUID(),
  validate,
  can("social", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getById(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// ── SCHEDULE ─────────────────────────────────────────────────

router.post(
  "/posts",
  body("channels").isArray({ min: 1 }),
  body("scheduled_at").optional().isISO8601(),
  body("status").optional().isIn(["draft", "scheduled"]),
  body("caption").optional().isString(),
  body("title").optional().isString(),
  body("description").optional().isString(),
  body("media_paths").optional().isArray(),
  body("video_path").optional().isString(),
  body("campaign_id").optional({ checkFalsy: true }).isUUID(),
  validate,
  can("social", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.schedule(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// ── EDIT ─────────────────────────────────────────────────────

router.patch(
  "/posts/:id",
  param("id").isUUID(),
  body("channels").optional().isArray({ min: 1 }),
  body("scheduled_at").optional().isISO8601(),
  body("caption").optional().isString(),
  body("title").optional().isString(),
  body("description").optional().isString(),
  body("media_paths").optional().isArray(),
  body("video_path").optional().isString(),
  validate,
  can("social", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.update(req.business, req.params.id, req.body, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ── CANCEL ───────────────────────────────────────────────────

router.delete(
  "/posts/:id",
  param("id").isUUID(),
  validate,
  can("social", "delete"),
  async (req, res, next) => {
    try {
      res.json(await service.cancel(req.business, req.params.id, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// ── PUBLISH NOW ──────────────────────────────────────────────

router.post(
  "/posts/:id/publish",
  param("id").isUUID(),
  validate,
  can("social", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.publishNow(req.business, req.params.id, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// ── METRICS ──────────────────────────────────────────────────

router.get(
  "/posts/:id/metrics",
  param("id").isUUID(),
  validate,
  can("social", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getMetrics(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/posts/:id/metrics",
  param("id").isUUID(),
  body("channel").isIn(["instagram", "facebook", "tiktok", "youtube"]),
  body("likes").optional().isInt({ min: 0 }),
  body("comments").optional().isInt({ min: 0 }),
  body("shares").optional().isInt({ min: 0 }),
  body("saves").optional().isInt({ min: 0 }),
  body("reach").optional().isInt({ min: 0 }),
  body("impressions").optional().isInt({ min: 0 }),
  body("extras").optional().isObject(),
  validate,
  can("social", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.recordMetric(req.business, req.params.id, req.body),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ── CONNECTED ACCOUNTS ───────────────────────────────────────
const { pool } = require("../../config/db");
const axios = require("axios");
const config = require("../../config/config");

router.get("/accounts", can("social", "view"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT account_id, business, platform, account_name, external_id,
              is_active, connected_at
       FROM shared.social_accounts WHERE business = $1 ORDER BY platform`,
      [req.business],
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/accounts",
  body("platform").isIn(["instagram", "facebook", "tiktok"]),
  body("account_name").isString().notEmpty(),
  body("external_id").isString().notEmpty(),
  body("access_token").isString().notEmpty(),
  body("page_id").optional().isString(),
  validate,
  can("social", "create"),
  async (req, res, next) => {
    try {
      const {
        rows: [row],
      } = await pool.query(
        `INSERT INTO shared.social_accounts
           (business, platform, account_name, external_id, access_token, page_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (business, platform, external_id) DO UPDATE
           SET account_name = $3, access_token = $5, is_active = true
         RETURNING account_id, platform, account_name`,
        [
          req.business,
          req.body.platform,
          req.body.account_name,
          req.body.external_id,
          req.body.access_token,
          req.body.page_id || null,
        ],
      );
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/accounts/:id",
  param("id").isUUID(),
  validate,
  can("social", "delete"),
  async (req, res, next) => {
    try {
      await pool.query(
        `UPDATE shared.social_accounts SET is_active = false
         WHERE account_id = $1 AND business = $2`,
        [req.params.id, req.business],
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── CAPTION TEMPLATES ────────────────────────────────────────
router.get("/templates", can("social", "view"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM shared.social_caption_templates
       WHERE business = $1 ORDER BY name`,
      [req.business],
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/templates",
  body("name").notEmpty(),
  body("template_text").notEmpty(),
  body("platforms").optional().isArray(),
  validate,
  can("social", "create"),
  async (req, res, next) => {
    try {
      const {
        rows: [row],
      } = await pool.query(
        `INSERT INTO shared.social_caption_templates
           (business, name, template_text, platforms, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          req.business,
          req.body.name,
          req.body.template_text,
          req.body.platforms || [],
          req.user.user_id,
        ],
      );
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/templates/:id",
  param("id").isUUID(),
  validate,
  can("social", "edit"),
  async (req, res, next) => {
    try {
      const {
        rows: [row],
      } = await pool.query(
        `UPDATE shared.social_caption_templates
         SET name = COALESCE($3, name),
             template_text = COALESCE($4, template_text),
             platforms = COALESCE($5, platforms)
         WHERE template_id = $1 AND business = $2 RETURNING *`,
        [
          req.params.id,
          req.business,
          req.body.name ?? null,
          req.body.template_text ?? null,
          req.body.platforms ?? null,
        ],
      );
      res.json(row || {});
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/templates/:id",
  param("id").isUUID(),
  validate,
  can("social", "delete"),
  async (req, res, next) => {
    try {
      await pool.query(
        `DELETE FROM shared.social_caption_templates
         WHERE template_id = $1 AND business = $2`,
        [req.params.id, req.business],
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── HASHTAG SETS ─────────────────────────────────────────────
router.get("/hashtag-sets", can("social", "view"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM shared.social_hashtag_sets
       WHERE business = $1 ORDER BY name`,
      [req.business],
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/hashtag-sets",
  body("name").notEmpty(),
  body("hashtags").isArray({ min: 1 }),
  body("platforms").optional().isArray(),
  validate,
  can("social", "create"),
  async (req, res, next) => {
    try {
      const {
        rows: [row],
      } = await pool.query(
        `INSERT INTO shared.social_hashtag_sets
           (business, name, hashtags, platforms, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          req.business,
          req.body.name,
          req.body.hashtags,
          req.body.platforms || [],
          req.user.user_id,
        ],
      );
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/hashtag-sets/:id",
  param("id").isUUID(),
  validate,
  can("social", "edit"),
  async (req, res, next) => {
    try {
      const {
        rows: [row],
      } = await pool.query(
        `UPDATE shared.social_hashtag_sets
         SET name = COALESCE($3, name),
             hashtags = COALESCE($4, hashtags),
             platforms = COALESCE($5, platforms)
         WHERE set_id = $1 AND business = $2 RETURNING *`,
        [
          req.params.id,
          req.business,
          req.body.name ?? null,
          req.body.hashtags ?? null,
          req.body.platforms ?? null,
        ],
      );
      res.json(row || {});
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/hashtag-sets/:id",
  param("id").isUUID(),
  validate,
  can("social", "delete"),
  async (req, res, next) => {
    try {
      await pool.query(
        `DELETE FROM shared.social_hashtag_sets
         WHERE set_id = $1 AND business = $2`,
        [req.params.id, req.business],
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── COMMENTS (live fetch from platform APIs) ─────────────────
router.get(
  "/posts/:id/comments",
  param("id").isUUID(),
  validate,
  can("social", "view"),
  async (req, res, next) => {
    try {
      const post = await service.getById(req.business, req.params.id);
      const comments = [];

      for (const [channel, ext] of Object.entries(post.external_ids || {})) {
        if (ext.status !== "published") continue;
        if (channel === "instagram" || channel === "facebook") {
          const { data } = await axios.get(
            `https://graph.facebook.com/v18.0/${ext.postId}/comments`,
            {
              params: {
                fields: "from,message,created_time,id",
                access_token: config.meta.accessToken,
              },
            },
          );
          (data.data || []).forEach((c) =>
            comments.push({
              channel,
              id: c.id,
              author: c.from?.name || "Unknown",
              text: c.message,
              created_at: c.created_time,
              native_url:
                channel === "instagram"
                  ? `https://www.instagram.com/p/${ext.postId}/`
                  : `https://www.facebook.com/${ext.postId}`,
            }),
          );
        }
      }
      comments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      res.json({ data: comments });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
