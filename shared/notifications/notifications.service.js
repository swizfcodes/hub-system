"use strict";

const { withSharedContext } = require("../../config/db");
const { emitToUser } = require("../../config/sockets");
const repo = require("./notifications.repository");

async function create(
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
  const n = await repo.insert(client, {
    userId,
    business,
    type,
    title,
    body,
    referenceType,
    referenceId,
    actionUrl,
  });

  emitToUser(userId, "notification:new", {
    notification_id: n.notification_id,
    type: n.type,
    title: n.title,
    body: n.body,
    action_url: n.action_url,
  });

  // True push for users with no open tab. Best-effort and post-tick so it
  // never blocks (or rolls back with) the caller's transaction. 'message'
  // type entries (mentions, backlog nudges) are skipped — the messaging
  // module already pushes the chat message itself, this would double up.
  if (n.type !== "message") {
    setImmediate(async () => {
      try {
        const push = require("../../lib/push");
        const { isUserOnline } = require("../../config/sockets");
        if (!push.isConfigured() || (await isUserOnline(userId))) return;
        await push.sendToUser(userId, {
          title: n.title,
          body: n.body || "",
          url: n.action_url || "/",
          tag: `notif-${n.type}`,
        });
      } catch {
        /* push is best-effort */
      }
    });
  }

  return n;
}

async function list(
  userId,
  business,
  { page = 1, limit = 30, unreadOnly = false },
) {
  return withSharedContext(async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.list(client, {
      userId,
      business,
      unreadOnly,
      limit: parseInt(limit),
      offset,
    });
    const unread_count = await repo.countUnread(client, { userId, business });
    return { data: rows, unread_count };
  });
}

async function markRead(notificationId, userId) {
  return withSharedContext(async (client) =>
    repo.markRead(client, { notificationId, userId }),
  );
}

async function markAllRead(userId, business) {
  return withSharedContext(async (client) =>
    repo.markAllRead(client, { userId, business }),
  );
}

// ─────────────────────────────────────────────────────────────
// NOTIFICATION PREFERENCES
//
// Per-user, per-type channel toggles. A user controls which channels
// (in-app, email, WhatsApp, SMS, push) they receive each notification
// type on. Lives in the shared schema — preferences are user-level,
// not business-level. All operations are scoped to the calling user.
// ─────────────────────────────────────────────────────────────

async function listPreferences(user) {
  return withSharedContext(async (client) => {
    const data = await repo.listPreferences(client, user.user_id);
    return { data };
  });
}

/**
 * Set (upsert) a preference for one notification type. The body need
 * only contain the channels being changed — omitted channels keep
 * their current value (or the column default if the row is new).
 */
async function setPreference(user, data) {
  if (!data.notification_type || !data.notification_type.trim()) {
    throw Object.assign(new Error("notification_type is required"), {
      status: 400,
    });
  }
  return withSharedContext(async (client) => {
    return repo.upsertPreference(client, {
      userId: user.user_id,
      notificationType: data.notification_type.trim(),
      inApp: data.in_app,
      emailEnabled: data.email_enabled,
      whatsappEnabled: data.whatsapp_enabled,
      smsEnabled: data.sms_enabled,
      pushEnabled: data.push_enabled,
    });
  });
}

async function deletePreference(user, notificationType) {
  return withSharedContext(async (client) => {
    const removed = await repo.deletePreference(
      client,
      user.user_id,
      notificationType,
    );
    if (!removed) {
      throw Object.assign(
        new Error("No preference set for that notification type"),
        { status: 404 },
      );
    }
    // Deleting a preference reverts that type to system defaults.
    return { deleted: true };
  });
}

module.exports = {
  create,
  list,
  markRead,
  markAllRead,
  // preferences
  listPreferences,
  setPreference,
  deletePreference,
};
