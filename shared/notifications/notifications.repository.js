"use strict";

async function insert(
  client,
  {
    userId,
    business,
    type,
    title,
    body,
    referenceType,
    referenceId,
    actionUrl,
  },
) {
  const {
    rows: [n],
  } = await client.query(
    `INSERT INTO shared.notifications (user_id, business, type, title, body, reference_type, reference_id, action_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      userId,
      business,
      type,
      title,
      body || null,
      referenceType || null,
      referenceId || null,
      actionUrl || null,
    ],
  );
  return n;
}

async function list(client, { userId, business, unreadOnly, limit, offset }) {
  const { rows } = await client.query(
    `SELECT notification_id, type, title, body, action_url, is_read, created_at FROM shared.notifications WHERE user_id = $1 AND business = $2 AND ($3::BOOLEAN = false OR is_read = false) ORDER BY created_at DESC LIMIT $4 OFFSET $5`,
    [userId, business, unreadOnly === "true", limit, offset],
  );
  return rows;
}

async function countUnread(client, { userId, business }) {
  const {
    rows: [{ count }],
  } = await client.query(
    `SELECT COUNT(*) FROM shared.notifications WHERE user_id = $1 AND business = $2 AND is_read = false`,
    [userId, business],
  );
  return parseInt(count);
}

async function markRead(client, { notificationId, userId }) {
  await client.query(
    `UPDATE shared.notifications SET is_read = true, read_at = now() WHERE notification_id = $1 AND user_id = $2`,
    [notificationId, userId],
  );
}

async function markAllRead(client, { userId, business }) {
  await client.query(
    `UPDATE shared.notifications SET is_read = true, read_at = now() WHERE user_id = $1 AND business = $2 AND is_read = false`,
    [userId, business],
  );
}

// ── NOTIFICATION PREFERENCES ─────────────────────────────────
// Per-user, per-notification-type channel toggles. shared schema —
// a user's preferences are the same across businesses.

async function listPreferences(client, userId) {
  const { rows } = await client.query(
    `SELECT pref_id, user_id, notification_type, in_app, email_enabled,
            whatsapp_enabled, sms_enabled, push_enabled, updated_at
     FROM shared.notification_preferences
     WHERE user_id = $1
     ORDER BY notification_type`,
    [userId],
  );
  return rows;
}

async function findPreference(client, userId, notificationType) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.notification_preferences
     WHERE user_id = $1 AND notification_type = $2`,
    [userId, notificationType],
  );
  return row || null;
}

/**
 * Upsert a preference row. (user_id, notification_type) is the natural
 * key — one row per user per type. Channels not supplied keep their
 * column default on insert, or their existing value on update.
 */
async function upsertPreference(
  client,
  {
    userId,
    notificationType,
    inApp,
    emailEnabled,
    whatsappEnabled,
    smsEnabled,
    pushEnabled,
  },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.notification_preferences
       (user_id, notification_type, in_app, email_enabled,
        whatsapp_enabled, sms_enabled, push_enabled)
     VALUES ($1, $2,
             COALESCE($3, true), COALESCE($4, true),
             COALESCE($5, false), COALESCE($6, false), COALESCE($7, true))
     ON CONFLICT (user_id, notification_type)
     DO UPDATE SET
       in_app           = COALESCE($3, shared.notification_preferences.in_app),
       email_enabled    = COALESCE($4, shared.notification_preferences.email_enabled),
       whatsapp_enabled = COALESCE($5, shared.notification_preferences.whatsapp_enabled),
       sms_enabled      = COALESCE($6, shared.notification_preferences.sms_enabled),
       push_enabled     = COALESCE($7, shared.notification_preferences.push_enabled),
       updated_at       = now()
     RETURNING *`,
    [
      userId,
      notificationType,
      inApp ?? null,
      emailEnabled ?? null,
      whatsappEnabled ?? null,
      smsEnabled ?? null,
      pushEnabled ?? null,
    ],
  );
  return row;
}

async function deletePreference(client, userId, notificationType) {
  const { rowCount } = await client.query(
    `DELETE FROM shared.notification_preferences
     WHERE user_id = $1 AND notification_type = $2`,
    [userId, notificationType],
  );
  return rowCount > 0;
}

module.exports = {
  insert,
  list,
  countUnread,
  markRead,
  markAllRead,
  // preferences
  listPreferences,
  findPreference,
  upsertPreference,
  deletePreference,
};
