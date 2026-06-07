"use strict";

// ─────────────────────────────────────────────────────────────
// MESSAGING REPOSITORY (Smartcomm)
//
// Five tables:
//   - shared.message_channels   group | direct | customer_thread
//   - shared.channel_members    user OR contact membership
//   - shared.messages           the actual messages
//   - shared.message_reads      per-user read receipts
//   - shared.message_attachments  link to shared.documents
//
// Customer threads (channel_type='customer_thread') are created and
// populated by integrations/messaging/messaging.service when an
// inbound WhatsApp/IG/FB message arrives. This module surfaces them
// in a unified inbox alongside internal group/direct chats.
// ─────────────────────────────────────────────────────────────

// ── CHANNELS ─────────────────────────────────────────────────

/**
 * List channels visible to the current user.
 *
 * "Visible" means:
 *   - The user is a member (any channel type), OR
 *   - It's a customer_thread for a business the user has access to
 *     (so support staff see incoming customer messages without being
 *     explicitly added to every thread)
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
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`c.name ILIKE $${params.length}`);
  }

  // Visibility: user is a member, OR channel is a customer_thread in
  // a business the user has access to (permitted_businesses).
  conditions.push(`(
    EXISTS (SELECT 1 FROM shared.channel_members cm
            WHERE cm.channel_id = c.channel_id AND cm.user_id = $1)
    OR (c.channel_type = 'customer_thread'
        AND c.business IS NOT NULL
        AND EXISTS (SELECT 1 FROM shared.users u
                    WHERE u.user_id = $1
                      AND c.business = ANY(u.permitted_businesses)))
  )`);

  params.push(limit, offset);

  const { rows } = await client.query(
    `SELECT c.channel_id, c.channel_type, c.name, c.business,
            c.is_archived, c.metadata, c.created_at, c.updated_at,
            -- Last message preview
            (SELECT json_build_object(
                      'message_id', m.message_id,
                      'content', m.content,
                      'message_type', m.message_type,
                      'created_at', m.created_at,
                      'sender_name',
                        COALESCE(sender_contact.display_name,
                                 sender_staff_contact.display_name,
                                 'System')
                    )
             FROM shared.messages m
             LEFT JOIN shared.contacts sender_contact
               ON sender_contact.contact_id = m.sender_contact_id
             LEFT JOIN shared.users sender_user
               ON sender_user.user_id = m.sender_user_id
             LEFT JOIN shared.staff_profiles sender_profile
               ON sender_profile.profile_id = sender_user.staff_profile_id
             LEFT JOIN shared.contacts sender_staff_contact
               ON sender_staff_contact.contact_id = sender_profile.contact_id
             WHERE m.channel_id = c.channel_id AND m.is_deleted = false
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
     WHERE ${conditions.join(" AND ")}
     ORDER BY c.updated_at DESC
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
                      'last_read_at', cm.last_read_at
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
    `SELECT role FROM shared.channel_members
     WHERE channel_id = $1 AND user_id = $2
     LIMIT 1`,
    [channelId, userId],
  );
  return row || null;
}

async function insertChannel(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.message_channels
       (channel_type, name, business, metadata, created_by)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [
      data.channel_type,
      data.name || null,
      data.business || null,
      JSON.stringify(data.metadata || {}),
      data.created_by,
    ],
  );
  return row;
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

async function updateLastReadAt(client, channelId, userId) {
  await client.query(
    `UPDATE shared.channel_members
     SET last_read_at = now()
     WHERE channel_id = $1 AND user_id = $2`,
    [channelId, userId],
  );
}

// ── MESSAGES ─────────────────────────────────────────────────

async function listMessages(client, { channelId, before, limit = 50 }) {
  const { rows } = await client.query(
    `SELECT m.message_id, m.channel_id,
            m.sender_user_id, m.sender_contact_id,
            m.message_type, m.content, m.reply_to_id,
            m.external_ref, m.created_at,
            COALESCE(sender_contact.display_name,
                     sender_staff_contact.display_name,
                     'System') AS sender_name,
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
               WHERE a.message_id = m.message_id),
              '[]'::json
            ) AS attachments
     FROM shared.messages m
     LEFT JOIN shared.contacts sender_contact
       ON sender_contact.contact_id = m.sender_contact_id
     LEFT JOIN shared.users sender_user
       ON sender_user.user_id = m.sender_user_id
     LEFT JOIN shared.staff_profiles sender_profile
       ON sender_profile.profile_id = sender_user.staff_profile_id
     LEFT JOIN shared.contacts sender_staff_contact
       ON sender_staff_contact.contact_id = sender_profile.contact_id
     WHERE m.channel_id = $1
       AND m.is_deleted = false
       AND ($2::TIMESTAMPTZ IS NULL OR m.created_at < $2)
     ORDER BY m.created_at DESC
     LIMIT $3`,
    [channelId, before || null, limit],
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
        message_type, content, reply_to_id, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      data.channel_id,
      data.sender_user_id || null,
      data.sender_contact_id || null,
      data.message_type || "text",
      data.content || null,
      data.reply_to_id || null,
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

async function softDeleteMessage(client, messageId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.messages
     SET is_deleted = true
     WHERE message_id = $1 AND is_deleted = false
     RETURNING message_id, is_deleted`,
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

module.exports = {
  // channels
  listChannelsForUser,
  findChannelById,
  isMember,
  insertChannel,
  archiveChannel,
  // membership
  addMember,
  removeMember,
  updateLastReadAt,
  // messages
  listMessages,
  findMessageById,
  insertMessage,
  softDeleteMessage,
  attachDocument,
  // reads
  markMessagesRead,
  getUnreadCountForUser,
};
