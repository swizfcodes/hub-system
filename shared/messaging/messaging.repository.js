"use strict";

// ─────────────────────────────────────────────────────────────
// MESSAGING REPOSITORY (Smartcomm)
//
// Tables:
//   - shared.message_channels   group | direct (+ customer_thread, dormant)
//   - shared.channel_members    user OR contact membership (+ pin/mute)
//   - shared.messages           the actual messages
//   - shared.message_reads      per-user read receipts
//   - shared.message_reactions  emoji reactions
//   - shared.message_stars      per-user starred messages
//   - shared.message_attachments  link to shared.documents
//
// EXTERNAL-COMMS-DISABLED: customer threads (channel_type =
// 'customer_thread') were created by integrations/messaging when an
// inbound WhatsApp/IG/FB message arrived. With the Meta bridge off,
// only internal group/direct channels are surfaced. The dormant rows
// and code paths are kept for the day external APIs return.
// ─────────────────────────────────────────────────────────────

// Resolves a staff sender's display name via users → staff_profiles →
// contacts. Used by several queries below.
const SENDER_NAME_SQL = `
  COALESCE(sender_contact.display_name,
           sender_staff_contact.display_name,
           'System')`;

const SENDER_JOINS_SQL = `
     LEFT JOIN shared.contacts sender_contact
       ON sender_contact.contact_id = m.sender_contact_id
     LEFT JOIN shared.users sender_user
       ON sender_user.user_id = m.sender_user_id
     LEFT JOIN shared.staff_profiles sender_profile
       ON sender_profile.profile_id = sender_user.staff_profile_id
     LEFT JOIN shared.contacts sender_staff_contact
       ON sender_staff_contact.contact_id = sender_profile.contact_id`;

// ── CHANNELS ─────────────────────────────────────────────────

/**
 * List channels visible to the current user — i.e. channels they are a
 * member of. Pinned conversations sort first, then most recent activity.
 */
async function listChannelsForUser(
  client,
  { userId, business, channelType, includeArchived, search, limit, offset },
) {
  const params = [userId];
  const conditions = [];

  if (!includeArchived) conditions.push("c.is_archived = false");

  if (business) {
    params.push(business);
    conditions.push(`(c.business = $${params.length} OR c.business IS NULL)`);
  }
  if (channelType) {
    params.push(channelType);
    conditions.push(`c.channel_type = $${params.length}`);
  } else {
    // EXTERNAL-COMMS-DISABLED: hide dormant customer threads from the
    // inbox while the Meta bridge is off.
    conditions.push(`c.channel_type IN ('group','direct')`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(c.name ILIKE $${params.length} OR EXISTS (
      SELECT 1 FROM shared.channel_members sm
      JOIN shared.users su ON su.user_id = sm.user_id
      JOIN shared.staff_profiles sp ON sp.profile_id = su.staff_profile_id
      JOIN shared.contacts sc ON sc.contact_id = sp.contact_id
      WHERE sm.channel_id = c.channel_id AND sc.display_name ILIKE $${params.length}
    ))`);
  }

  // Visibility: user is a member.
  // EXTERNAL-COMMS-DISABLED: the OR-branch that exposed customer_threads
  // to everyone with business access is parked below.
  conditions.push(`
    EXISTS (SELECT 1 FROM shared.channel_members cm
            WHERE cm.channel_id = c.channel_id AND cm.user_id = $1)
    -- OR (c.channel_type = 'customer_thread'
    --     AND c.business IS NOT NULL
    --     AND EXISTS (SELECT 1 FROM shared.users u
    --                 WHERE u.user_id = $1
    --                   AND c.business = ANY(u.permitted_businesses)))
  `);

  params.push(limit, offset);

  const { rows } = await client.query(
    `SELECT c.channel_id, c.channel_type, c.name, c.description, c.business,
            c.is_archived, c.metadata, c.created_at, c.updated_at,
            cm_self.is_pinned, cm_self.is_muted, cm_self.role AS my_role,
            -- Members (staff only) so direct chats can be named and show presence
            (SELECT json_agg(json_build_object(
                      'user_id', cm.user_id,
                      'role', cm.role,
                      'display_name', mc.display_name,
                      'last_seen_at', mu.last_seen_at
                    ))
             FROM shared.channel_members cm
             JOIN shared.users mu ON mu.user_id = cm.user_id
             LEFT JOIN shared.staff_profiles mp
               ON mp.profile_id = mu.staff_profile_id
             LEFT JOIN shared.contacts mc
               ON mc.contact_id = mp.contact_id
             WHERE cm.channel_id = c.channel_id) AS members,
            -- Last message preview
            (SELECT json_build_object(
                      'message_id', m.message_id,
                      'content', CASE WHEN m.is_deleted
                                      THEN NULL ELSE m.content END,
                      'is_deleted', m.is_deleted,
                      'message_type', m.message_type,
                      'created_at', m.created_at,
                      'sender_user_id', m.sender_user_id,
                      'sender_name', ${SENDER_NAME_SQL}
                    )
             FROM shared.messages m
             ${SENDER_JOINS_SQL}
             WHERE m.channel_id = c.channel_id
             ORDER BY m.created_at DESC LIMIT 1) AS last_message,
            -- Unread count for this user
            (SELECT COUNT(*)::int FROM shared.messages m
             WHERE m.channel_id = c.channel_id
               AND m.is_deleted = false
               AND m.sender_user_id IS DISTINCT FROM $1
               AND NOT EXISTS (
                 SELECT 1 FROM shared.message_reads mr
                 WHERE mr.message_id = m.message_id AND mr.user_id = $1
               )) AS unread_count
     FROM shared.message_channels c
     LEFT JOIN shared.channel_members cm_self
       ON cm_self.channel_id = c.channel_id AND cm_self.user_id = $1
     WHERE ${conditions.join(" AND ")}
     ORDER BY cm_self.is_pinned DESC NULLS LAST, c.updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

async function findChannelById(client, channelId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT c.*,
            (SELECT json_agg(json_build_object(
                      'user_id', cm.user_id,
                      'contact_id', cm.contact_id,
                      'role', cm.role,
                      'display_name',
                        COALESCE(user_contact.display_name,
                                 cm_contact.display_name),
                      'joined_at', cm.joined_at,
                      'last_read_at', cm.last_read_at,
                      'last_seen_at', cm_user.last_seen_at
                    ))
             FROM shared.channel_members cm
             LEFT JOIN shared.users cm_user ON cm_user.user_id = cm.user_id
             LEFT JOIN shared.staff_profiles cm_profile
               ON cm_profile.profile_id = cm_user.staff_profile_id
             LEFT JOIN shared.contacts user_contact
               ON user_contact.contact_id = cm_profile.contact_id
             LEFT JOIN shared.contacts cm_contact
               ON cm_contact.contact_id = cm.contact_id
             WHERE cm.channel_id = c.channel_id) AS members
     FROM shared.message_channels c
     WHERE c.channel_id = $1`,
    [channelId],
  );
  return row || null;
}

async function isMember(client, channelId, userId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT role, is_pinned, is_muted FROM shared.channel_members
     WHERE channel_id = $1 AND user_id = $2
     LIMIT 1`,
    [channelId, userId],
  );
  return row || null;
}

/**
 * Find an existing direct channel between exactly these two users —
 * keeps "message the same person" idempotent like WhatsApp.
 */
async function findDirectChannel(client, userIdA, userIdB) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT c.channel_id FROM shared.message_channels c
     WHERE c.channel_type = 'direct'
       AND EXISTS (SELECT 1 FROM shared.channel_members m
                   WHERE m.channel_id = c.channel_id AND m.user_id = $1)
       AND EXISTS (SELECT 1 FROM shared.channel_members m
                   WHERE m.channel_id = c.channel_id AND m.user_id = $2)
       AND (SELECT COUNT(*) FROM shared.channel_members m
            WHERE m.channel_id = c.channel_id) = 2
     LIMIT 1`,
    [userIdA, userIdB],
  );
  return row || null;
}

async function insertChannel(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.message_channels
       (channel_type, name, description, business, metadata, created_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      data.channel_type,
      data.name || null,
      data.description || null,
      data.business || null,
      JSON.stringify(data.metadata || {}),
      data.created_by,
    ],
  );
  return row;
}

async function updateChannelInfo(client, channelId, { name, description }) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.message_channels
     SET name        = COALESCE($2, name),
         description = COALESCE($3, description),
         updated_at  = now()
     WHERE channel_id = $1
     RETURNING *`,
    [channelId, name ?? null, description ?? null],
  );
  return row || null;
}

async function archiveChannel(client, channelId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.message_channels
     SET is_archived = true, updated_at = now()
     WHERE channel_id = $1
     RETURNING channel_id, is_archived`,
    [channelId],
  );
  return row || null;
}

// ── MEMBERSHIP ───────────────────────────────────────────────

async function addMember(client, { channelId, userId, contactId, role }) {
  await client.query(
    `INSERT INTO shared.channel_members (channel_id, user_id, contact_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [channelId, userId || null, contactId || null, role || "member"],
  );
}

async function removeMember(client, { channelId, userId, contactId }) {
  const result = await client.query(
    `DELETE FROM shared.channel_members
     WHERE channel_id = $1
       AND ($2::UUID IS NULL OR user_id = $2)
       AND ($3::UUID IS NULL OR contact_id = $3)`,
    [channelId, userId || null, contactId || null],
  );
  return result.rowCount > 0;
}

async function updateMemberRole(client, { channelId, userId, role }) {
  const result = await client.query(
    `UPDATE shared.channel_members
     SET role = $3
     WHERE channel_id = $1 AND user_id = $2`,
    [channelId, userId, role],
  );
  return result.rowCount > 0;
}

async function setMemberFlag(client, { channelId, userId, flag, value }) {
  // flag is one of the whitelisted columns below — never user input.
  if (!["is_pinned", "is_muted"].includes(flag)) {
    throw new Error(`Invalid member flag: ${flag}`);
  }
  const result = await client.query(
    `UPDATE shared.channel_members
     SET ${flag} = $3
     WHERE channel_id = $1 AND user_id = $2`,
    [channelId, userId, value],
  );
  return result.rowCount > 0;
}

async function updateLastReadAt(client, channelId, userId) {
  await client.query(
    `UPDATE shared.channel_members
     SET last_read_at = now()
     WHERE channel_id = $1 AND user_id = $2`,
    [channelId, userId],
  );
}

// ── MESSAGES ─────────────────────────────────────────────────

/**
 * List messages for a channel, oldest-first.
 *
 * Deleted messages are returned as placeholders (content stripped,
 * is_deleted=true) so the UI can render "This message was deleted"
 * like WhatsApp. Each row carries reactions, the quoted reply preview,
 * read-receipt counts (for ✓/✓✓ ticks) and the caller's star flag.
 */
async function listMessages(client, { channelId, userId, before, limit = 50 }) {
  const { rows } = await client.query(
    `SELECT m.message_id, m.channel_id,
            m.sender_user_id, m.sender_contact_id,
            m.message_type,
            CASE WHEN m.is_deleted THEN NULL ELSE m.content END AS content,
            m.is_deleted, m.edited_at, m.is_forwarded,
            m.reply_to_id, m.external_ref, m.created_at,
            ${SENDER_NAME_SQL} AS sender_name,
            CASE
              WHEN m.sender_user_id IS NOT NULL THEN 'staff'
              WHEN m.sender_contact_id IS NOT NULL THEN 'customer'
              ELSE 'system'
            END AS sender_kind,
            COALESCE(
              (SELECT json_agg(json_build_object(
                        'attachment_id', a.attachment_id,
                        'document_id', a.document_id,
                        'display_name', a.display_name
                      ))
               FROM shared.message_attachments a
               WHERE a.message_id = m.message_id AND m.is_deleted = false),
              '[]'::json
            ) AS attachments,
            COALESCE(
              (SELECT json_agg(json_build_object(
                        'emoji', r.emoji,
                        'user_id', r.user_id,
                        'user_name', rc.display_name
                      ) ORDER BY r.created_at)
               FROM shared.message_reactions r
               JOIN shared.users ru ON ru.user_id = r.user_id
               LEFT JOIN shared.staff_profiles rp
                 ON rp.profile_id = ru.staff_profile_id
               LEFT JOIN shared.contacts rc
                 ON rc.contact_id = rp.contact_id
               WHERE r.message_id = m.message_id),
              '[]'::json
            ) AS reactions,
            (SELECT json_build_object(
                      'message_id', rm.message_id,
                      'content', CASE WHEN rm.is_deleted
                                      THEN NULL ELSE rm.content END,
                      'is_deleted', rm.is_deleted,
                      'message_type', rm.message_type,
                      'sender_user_id', rm.sender_user_id,
                      'sender_name',
                        COALESCE(rqc.display_name, 'System')
                    )
             FROM shared.messages rm
             LEFT JOIN shared.users rqu ON rqu.user_id = rm.sender_user_id
             LEFT JOIN shared.staff_profiles rqp
               ON rqp.profile_id = rqu.staff_profile_id
             LEFT JOIN shared.contacts rqc
               ON rqc.contact_id = rqp.contact_id
             WHERE rm.message_id = m.reply_to_id) AS reply_to,
            -- Tick state: how many other members have read this message
            (SELECT COUNT(*)::int FROM shared.message_reads mr
             WHERE mr.message_id = m.message_id
               AND mr.user_id IS DISTINCT FROM m.sender_user_id) AS read_count,
            (SELECT COUNT(*)::int FROM shared.channel_members cm
             WHERE cm.channel_id = m.channel_id
               AND cm.user_id IS NOT NULL
               AND cm.user_id IS DISTINCT FROM m.sender_user_id)
              AS recipient_count,
            EXISTS (SELECT 1 FROM shared.message_stars s
                    WHERE s.message_id = m.message_id
                      AND s.user_id = $4) AS is_starred
     FROM shared.messages m
     ${SENDER_JOINS_SQL}
     WHERE m.channel_id = $1
       AND ($2::TIMESTAMPTZ IS NULL OR m.created_at < $2)
     ORDER BY m.created_at DESC
     LIMIT $3`,
    [channelId, before || null, limit, userId || null],
  );
  // Reverse so caller receives oldest-first (natural chat order),
  // matching how UIs typically render.
  return rows.reverse();
}

async function findMessageById(client, messageId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.messages WHERE message_id = $1`,
    [messageId],
  );
  return row || null;
}

async function insertMessage(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.messages
       (channel_id, sender_user_id, sender_contact_id,
        message_type, content, reply_to_id, is_forwarded, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      data.channel_id,
      data.sender_user_id || null,
      data.sender_contact_id || null,
      data.message_type || "text",
      data.content || null,
      data.reply_to_id || null,
      data.is_forwarded || false,
      data.external_ref || null,
    ],
  );
  // Bump channel updated_at so it sorts to top in inbox lists.
  await client.query(
    `UPDATE shared.message_channels SET updated_at = now() WHERE channel_id = $1`,
    [data.channel_id],
  );
  return row;
}

async function editMessage(client, messageId, content) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.messages
     SET content = $2, edited_at = now()
     WHERE message_id = $1 AND is_deleted = false
     RETURNING *`,
    [messageId, content],
  );
  return row || null;
}

async function softDeleteMessage(client, messageId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.messages
     SET is_deleted = true
     WHERE message_id = $1 AND is_deleted = false
     RETURNING message_id, channel_id, is_deleted`,
    [messageId],
  );
  return row || null;
}

async function attachDocument(client, { messageId, documentId, displayName }) {
  await client.query(
    `INSERT INTO shared.message_attachments
       (message_id, document_id, display_name)
     VALUES ($1, $2, $3)`,
    [messageId, documentId, displayName || null],
  );
}

async function getAttachments(client, messageId) {
  const { rows } = await client.query(
    `SELECT attachment_id, document_id, display_name
     FROM shared.message_attachments
     WHERE message_id = $1`,
    [messageId],
  );
  return rows;
}

// ── STARS ────────────────────────────────────────────────────

async function toggleStar(client, messageId, userId) {
  const result = await client.query(
    `DELETE FROM shared.message_stars
     WHERE message_id = $1 AND user_id = $2`,
    [messageId, userId],
  );
  if (result.rowCount > 0) return { starred: false };
  await client.query(
    `INSERT INTO shared.message_stars (message_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [messageId, userId],
  );
  return { starred: true };
}

async function listStarred(client, userId, { limit = 50 } = {}) {
  const { rows } = await client.query(
    `SELECT m.message_id, m.channel_id, m.sender_user_id,
            m.message_type, m.content, m.created_at,
            s.starred_at,
            c.name AS channel_name, c.channel_type,
            ${SENDER_NAME_SQL} AS sender_name
     FROM shared.message_stars s
     JOIN shared.messages m ON m.message_id = s.message_id
     JOIN shared.message_channels c ON c.channel_id = m.channel_id
     ${SENDER_JOINS_SQL}
     WHERE s.user_id = $1 AND m.is_deleted = false
     ORDER BY s.starred_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

// ── SEARCH ───────────────────────────────────────────────────

/**
 * Search message text across all channels the user belongs to, or
 * within a single channel when channelId is given.
 */
async function searchMessages(client, { userId, q, channelId, limit = 50 }) {
  const params = [userId, `%${q}%`, limit];
  let channelCond = "";
  if (channelId) {
    params.push(channelId);
    channelCond = `AND m.channel_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `SELECT m.message_id, m.channel_id, m.sender_user_id,
            m.message_type, m.content, m.created_at,
            c.name AS channel_name, c.channel_type,
            ${SENDER_NAME_SQL} AS sender_name
     FROM shared.messages m
     JOIN shared.message_channels c ON c.channel_id = m.channel_id
     ${SENDER_JOINS_SQL}
     WHERE m.is_deleted = false
       AND m.content ILIKE $2
       AND EXISTS (SELECT 1 FROM shared.channel_members cm
                   WHERE cm.channel_id = m.channel_id AND cm.user_id = $1)
       ${channelCond}
     ORDER BY m.created_at DESC
     LIMIT $3`,
    params,
  );
  return rows;
}

// ── READ RECEIPTS ────────────────────────────────────────────

async function markMessagesRead(client, { channelId, userId, upToMessageId }) {
  // Insert read receipts for every message in the channel up to and
  // including upToMessageId that the user hasn't already read.
  // ON CONFLICT DO NOTHING keeps this idempotent.
  const result = await client.query(
    `INSERT INTO shared.message_reads (message_id, user_id)
     SELECT m.message_id, $2
     FROM shared.messages m
     WHERE m.channel_id = $1
       AND m.is_deleted = false
       AND ($3::UUID IS NULL OR m.created_at <= (
             SELECT created_at FROM shared.messages WHERE message_id = $3
           ))
       AND NOT EXISTS (
         SELECT 1 FROM shared.message_reads mr
         WHERE mr.message_id = m.message_id AND mr.user_id = $2
       )
     RETURNING message_id`,
    [channelId, userId, upToMessageId || null],
  );
  return result.rowCount;
}

async function getUnreadCountForUser(client, userId) {
  const {
    rows: [{ count }],
  } = await client.query(
    `SELECT COUNT(*)::int
     FROM shared.messages m
     JOIN shared.channel_members cm ON cm.channel_id = m.channel_id
     WHERE cm.user_id = $1
       AND m.is_deleted = false
       AND m.sender_user_id IS DISTINCT FROM $1
       AND NOT EXISTS (
         SELECT 1 FROM shared.message_reads mr
         WHERE mr.message_id = m.message_id AND mr.user_id = $1
       )`,
    [userId],
  );
  return parseInt(count, 10);
}

// ── EMAIL LOG ────────────────────────────────────────────────

async function listEmailLog(client, { q, business, status, limit, offset }) {
  const params = [];
  const conditions = ["1=1"];
  if (q) {
    params.push(`%${q}%`);
    conditions.push(
      `(e.recipient ILIKE $${params.length} OR e.subject ILIKE $${params.length})`,
    );
  }
  if (business) {
    params.push(business);
    conditions.push(`e.business = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`e.status = $${params.length}`);
  }
  params.push(limit, offset);
  const { rows } = await client.query(
    `SELECT e.email_id, e.recipient, e.subject, e.business,
            e.status, e.error, e.created_at,
            sc.display_name AS sender_name
     FROM shared.email_log e
     LEFT JOIN shared.users su ON su.user_id = e.sender_user_id
     LEFT JOIN shared.staff_profiles sp
       ON sp.profile_id = su.staff_profile_id
     LEFT JOIN shared.contacts sc ON sc.contact_id = sp.contact_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY e.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

module.exports = {
  // channels
  listChannelsForUser,
  findChannelById,
  findDirectChannel,
  isMember,
  insertChannel,
  updateChannelInfo,
  archiveChannel,
  // membership
  addMember,
  removeMember,
  updateMemberRole,
  setMemberFlag,
  updateLastReadAt,
  // messages
  listMessages,
  findMessageById,
  insertMessage,
  editMessage,
  softDeleteMessage,
  attachDocument,
  getAttachments,
  // stars & search
  toggleStar,
  listStarred,
  searchMessages,
  // reads
  markMessagesRead,
  getUnreadCountForUser,
  // email log
  listEmailLog,
};
