"use strict";

// ── lib/push ──────────────────────────────────────────────────────────────
// Web Push (VAPID) — notifications that land even when no tab is open.
// Configured via config.push (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env);
// while the keys are missing every send is a silent no-op, so the feature
// degrades cleanly instead of taking messaging down.

const webpush = require("web-push");
const config = require("../../config/config");
const logger = require("../../config/logger");
const { pool } = require("../../config/db");

let configured = false;
let initialised = false;

function init() {
  if (initialised) return configured;
  initialised = true;
  const { vapidPublicKey, vapidPrivateKey, vapidSubject } = config.push || {};
  if (vapidPublicKey && vapidPrivateKey) {
    try {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      configured = true;
      logger.info("Web push configured (VAPID)");
    } catch (err) {
      logger.error(`Web push VAPID config invalid: ${err.message}`);
    }
  }
  return configured;
}

function isConfigured() {
  return init();
}

function publicKey() {
  return init() ? config.push.vapidPublicKey : null;
}

async function saveSubscription({ userId, endpoint, p256dh, auth, userAgent }) {
  await pool.query(
    `INSERT INTO shared.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id    = EXCLUDED.user_id,
           p256dh     = EXCLUDED.p256dh,
           auth       = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent`,
    [userId, endpoint, p256dh, auth, userAgent || null],
  );
}

async function deleteSubscription(userId, endpoint) {
  const res = await pool.query(
    `DELETE FROM shared.push_subscriptions
     WHERE user_id = $1 AND endpoint = $2`,
    [userId, endpoint],
  );
  return res.rowCount > 0;
}

/**
 * Push to every subscription a user holds (laptop, installed phone PWA,
 * …). Dead subscriptions — the push service answers 404/410 — are pruned
 * on the way. payload: { title, body, url, tag }
 */
async function sendToUser(userId, payload) {
  if (!init()) return;
  const { rows } = await pool.query(
    `SELECT endpoint, p256dh, auth FROM shared.push_subscriptions
     WHERE user_id = $1`,
    [userId],
  );
  if (!rows.length) return;
  const json = JSON.stringify(payload);
  await Promise.all(
    rows.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json,
          { TTL: 60 * 60 * 24 },
        );
        await pool.query(
          `UPDATE shared.push_subscriptions SET last_used_at = now()
           WHERE endpoint = $1`,
          [sub.endpoint],
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool
            .query(`DELETE FROM shared.push_subscriptions WHERE endpoint = $1`, [
              sub.endpoint,
            ])
            .catch(() => {});
        } else {
          logger.warn(
            `Web push send failed (${err.statusCode || "?"}): ${err.message}`,
          );
        }
      }
    }),
  );
}

module.exports = {
  isConfigured,
  publicKey,
  saveSubscription,
  deleteSubscription,
  sendToUser,
};
