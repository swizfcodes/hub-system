"use strict";

const { withSharedContext } = require("../config/db");
const axios = require("axios");
const config = require("../config/config");
const logger = require("../config/logger");

module.exports = async function fetchSocialMetrics() {
  await withSharedContext(async (client) => {
    // Published posts from the last 90 days.
    const { rows: posts } = await client.query(
      `SELECT post_id, business, channels, external_ids
       FROM shared.social_posts
       WHERE status IN ('published','partial')
         AND published_at >= now() - interval '90 days'`,
    );

    for (const post of posts) {
      for (const channel of post.channels) {
        const extId = post.external_ids?.[channel];
        if (!extId?.postId) continue;

        try {
          let metrics = {};

          if (channel === "instagram") {
            const { data } = await axios.get(
              `https://graph.facebook.com/v18.0/${extId.postId}/insights`,
              {
                params: {
                  metric: "likes,comments,shares,saved,reach,impressions",
                  access_token: config.meta.accessToken,
                },
              },
            );
            (data.data || []).forEach((m) => {
              metrics[m.name] = m.values?.[0]?.value || 0;
            });
          } else if (channel === "facebook") {
            const { data } = await axios.get(
              `https://graph.facebook.com/v18.0/${extId.postId}`,
              {
                params: {
                  fields: "likes.summary(true),comments.summary(true),shares",
                  access_token: config.meta.accessToken,
                },
              },
            );
            metrics = {
              likes: data.likes?.summary?.total_count || 0,
              comments: data.comments?.summary?.total_count || 0,
              shares: data.shares?.count || 0,
            };
          } else if (channel === "tiktok") {
            const { data } = await axios.post(
              "https://open.tiktokapis.com/v2/video/query/",
              {
                filters: { video_ids: [extId.postId] },
                fields: [
                  "like_count",
                  "comment_count",
                  "share_count",
                  "view_count",
                  "reach",
                ],
              },
              {
                headers: {
                  Authorization: `Bearer ${config.tiktok?.accessToken}`,
                },
              },
            );
            const v = data.data?.videos?.[0] || {};
            metrics = {
              likes: v.like_count,
              comments: v.comment_count,
              shares: v.share_count,
              reach: v.reach,
              extras: { views: v.view_count },
            };
          }

          await client.query(
            `INSERT INTO shared.social_post_metrics
               (post_id, channel, likes, comments, shares, saves, reach, impressions, extras)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              post.post_id,
              channel,
              metrics.likes || 0,
              metrics.comments || 0,
              metrics.shares || 0,
              metrics.saved || metrics.saves || 0,
              metrics.reach || 0,
              metrics.impressions || 0,
              JSON.stringify(metrics.extras || {}),
            ],
          );
        } catch (err) {
          logger.error(
            `fetchSocialMetrics failed for ${post.post_id}/${channel}: ${err.message}`,
          );
        }
      }
    }
  });
};
