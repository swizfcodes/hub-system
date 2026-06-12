"use strict";

const { withSharedContext } = require("../../config/db");
const { emitToUser, emitToBusiness } = require("../../config/sockets");
const logger = require("../../config/logger");
// EXTERNAL-COMMS-DISABLED: the integrations layer dispatched replies to
// WhatsApp / Instagram / Facebook via the Meta Graph API. Re-enable the
// require (and the dispatch block in sendMessage) once API access exists.
// const integrationsService = require("../../integrations/messaging/messaging.service");
const auditService = require("../audit/audit.service");
const repo = require("./messaging.repository");

// ─────────────────────────────────────────────────────────────
// MESSAGING SERVICE — Module 14: Messaging (Smartcomm)
//
// In-house team chat, WhatsApp-style:
//   - direct & group channels with admin roles
//   - replies (quotes), edits, delete-for-everyone, forwarding
//   - read receipts (✓ / ✓✓ ticks), emoji reactions, stars
//   - pinned & muted conversations, full-text search
//   - real-time delivery over socket.io (message/typing/presence)
//
// EXTERNAL-COMMS-DISABLED: the customer_thread bridge (inbound Meta
// webhooks + outbound Graph API dispatch) is parked until Meta API
// access is available. The schema and integrations/ code remain in
// place so the unified customer inbox can be switched back on.
// ─────────────────────────────────────────────────────────────

const VALID_MESSAGE_TYPES = [
  "text",
  "image",
  "document",
  "voice_note",
  "system",
];
const VALID_CHANNEL_TYPES = ["group", "direct", "customer_thread"];

// Emit a messaging event to every user member of a channel — their
// personal socket rooms — so events reach people on any business.
function emitToChannelMembers(channel, event, data) {
  for (const m of channel.members || []) {
    if (m.user_id) emitToUser(m.user_id, event, data);
  }
}

// message:new carries a personalised `recipient` block per member (their
// own mute flag) so the client alert layer can decide locally whether to
// beep / notify. The business-room copy stays generic — clients use it
// for cache refresh only and never alert on payloads without `recipient`.
function emitNewMessage(channel, payload) {
  for (const m of channel.members || []) {
    if (!m.user_id) continue;
    emitToUser(m.user_id, "message:new", {
      ...payload,
      recipient: { muted: !!m.is_muted },
    });
  }
  emitToBusiness(channel.business || "shared", "message:new", payload);
}

// ─────────────────────────────────────────────────────────────
// CHANNELS
// ─────────────────────────────────────────────────────────────

async function listChannels(query, user) {
  return withSharedContext(async (client) => {
    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 30, 100);
    const offset = (page - 1) * limit;
    const rows = await repo.listChannelsForUser(client, {
      userId: user.user_id,
      business: query.business,
      channelType: query.channel_type,
      includeArchived: query.include_archived === "true",
      search: query.search,
      limit,
      offset,
    });
    return { data: rows, pagination: { page, limit } };
  });
}

async function getChannel(channelId, user) {
  return withSharedContext(async (client) => {
    const channel = await repo.findChannelById(client, channelId);
    if (!channel) {
      throw Object.assign(new Error("Channel not found"), { status: 404 });
    }
    const allowed = await canUserAccessChannel(client, channel, user);
    if (!allowed) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    return channel;
  });
}

async function canUserAccessChannel(client, channel, user) {
  if (!user) return false;
  const member = await repo.isMember(client, channel.channel_id, user.user_id);
  if (member) return true;
  if (channel.channel_type === "customer_thread" && channel.business) {
    // Allow if user has access to that business — kept so old customer
    // threads stay readable even while the external bridge is off.
    const {
      rows: [u],
    } = await client.query(
      `SELECT permitted_businesses FROM shared.users WHERE user_id = $1`,
      [user.user_id],
    );
    return u?.permitted_businesses?.includes(channel.business);
  }
  return false;
}

/**
 * Create a group or direct channel. Direct channels are idempotent —
 * messaging the same person again returns the existing conversation,
 * exactly like opening a chat in WhatsApp.
 */
async function createChannel(data, user) {
  return withSharedContext(async (client) => {
    if (!VALID_CHANNEL_TYPES.includes(data.channel_type)) {
      throw Object.assign(new Error("Invalid channel_type"), { status: 400 });
    }
    if (data.channel_type === "customer_thread") {
      throw Object.assign(
        new Error(
          "Customer threads are created automatically from inbound messages — they cannot be created manually",
        ),
        { status: 400 },
      );
    }
    if (
      data.channel_type === "direct" &&
      (!data.member_user_ids || data.member_user_ids.length !== 1)
    ) {
      throw Object.assign(
        new Error("Direct channels require exactly one other member"),
        { status: 400 },
      );
    }

    // Reuse an existing direct conversation with this person.
    if (data.channel_type === "direct") {
      const existing = await repo.findDirectChannel(
        client,
        user.user_id,
        data.member_user_ids[0],
      );
      if (existing) {
        return repo.findChannelById(client, existing.channel_id);
      }
    }

    const channel = await repo.insertChannel(client, {
      channel_type: data.channel_type,
      name: data.name,
      description: data.description,
      business: data.business,
      metadata: data.metadata,
      created_by: user.user_id,
    });

    // Add creator as admin.
    await repo.addMember(client, {
      channelId: channel.channel_id,
      userId: user.user_id,
      role: "admin",
    });

    // Add additional members.
    for (const memberId of data.member_user_ids || []) {
      if (memberId === user.user_id) continue;
      await repo.addMember(client, {
        channelId: channel.channel_id,
        userId: memberId,
        role: "member",
      });
    }

    const full = await repo.findChannelById(client, channel.channel_id);
    emitToChannelMembers(full, "channel:created", {
      channelId: channel.channel_id,
      channelType: channel.channel_type,
    });

    return full;
  });
}

/**
 * Update a group channel's name / description (admin only).
 */
async function updateChannel(channelId, { name, description }, user) {
  return withSharedContext(async (client) => {
    const channel = await repo.findChannelById(client, channelId);
    if (!channel) {
      throw Object.assign(new Error("Channel not found"), { status: 404 });
    }
    if (channel.channel_type !== "group") {
      throw Object.assign(
        new Error("Only group channels can be renamed"),
        { status: 400 },
      );
    }
    const member = await repo.isMember(client, channelId, user.user_id);
    if (!member || member.role !== "admin") {
      throw Object.assign(new Error("Only channel admins can edit the group"), {
        status: 403,
      });
    }
    const updated = await repo.updateChannelInfo(client, channelId, {
      name,
      description,
    });
    emitToChannelMembers(channel, "channel:updated", { channelId });
    return updated;
  });
}

async function archiveChannel(channelId, user) {
  return withSharedContext(async (client) => {
    const channel = await repo.findChannelById(client, channelId);
    if (!channel) {
      throw Object.assign(new Error("Channel not found"), { status: 404 });
    }
    const member = await repo.isMember(client, channelId, user.user_id);
    if (!member || member.role !== "admin") {
      throw Object.assign(new Error("Only channel admins can archive"), {
        status: 403,
      });
    }
    const result = await repo.archiveChannel(client, channelId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: channel.business,
      module: "messaging",
      action: "archive",
      table: "shared.message_channels",
      recordId: channelId,
    });
    emitToChannelMembers(channel, "channel:updated", { channelId });
    return result;
  });
}

/**
 * Pin or mute a conversation for the current user only.
 */
async function setChannelFlag(channelId, flag, value, user) {
  return withSharedContext(async (client) => {
    const ok = await repo.setMemberFlag(client, {
      channelId,
      userId: user.user_id,
      flag,
      value: !!value,
    });
    if (!ok) {
      throw Object.assign(new Error("You are not a member of this channel"), {
        status: 403,
      });
    }
    return { channel_id: channelId, [flag]: !!value };
  });
}

// ─────────────────────────────────────────────────────────────
// MEMBERS
// ─────────────────────────────────────────────────────────────

async function addMember(channelId, { user_id, contact_id, role }, actingUser) {
  return withSharedContext(async (client) => {
    const channel = await repo.findChannelById(client, channelId);
    if (!channel) {
      throw Object.assign(new Error("Channel not found"), { status: 404 });
    }
    const actingMember = await repo.isMember(
      client,
      channelId,
      actingUser.user_id,
    );
    if (!actingMember || actingMember.role !== "admin") {
      throw Object.assign(new Error("Only channel admins can add members"), {
        status: 403,
      });
    }
    if (channel.channel_type === "direct") {
      throw Object.assign(
        new Error("Direct channels cannot have members added"),
        { status: 400 },
      );
    }
    await repo.addMember(client, {
      channelId,
      userId: user_id,
      contactId: contact_id,
      role: role || "member",
    });
    if (user_id) {
      await repo.insertMessage(client, {
        channel_id: channelId,
        message_type: "system",
        content: `${actingUser.display_name} added a member to the group`,
      });
      emitToUser(user_id, "channel:created", { channelId });
    }
    emitToChannelMembers(channel, "channel:updated", { channelId });
    return { added: true };
  });
}

async function removeMember(channelId, { user_id, contact_id }, actingUser) {
  return withSharedContext(async (client) => {
    const channel = await repo.findChannelById(client, channelId);
    if (!channel) {
      throw Object.assign(new Error("Channel not found"), { status: 404 });
    }
    const actingMember = await repo.isMember(
      client,
      channelId,
      actingUser.user_id,
    );
    // Members may remove themselves (leave group); otherwise admin only.
    const isSelf = user_id && user_id === actingUser.user_id;
    if (!isSelf && (!actingMember || actingMember.role !== "admin")) {
      throw Object.assign(new Error("Only channel admins can remove members"), {
        status: 403,
      });
    }
    const removed = await repo.removeMember(client, {
      channelId,
      userId: user_id,
      contactId: contact_id,
    });
    if (removed && user_id) {
      await repo.insertMessage(client, {
        channel_id: channelId,
        message_type: "system",
        content: isSelf
          ? `${actingUser.display_name} left the group`
          : `${actingUser.display_name} removed a member from the group`,
      });
    }
    emitToChannelMembers(channel, "channel:updated", { channelId });
    return { removed };
  });
}

/**
 * Promote / demote a member (admin only) — e.g. hand over group admin.
 */
async function changeMemberRole(channelId, { user_id, role }, actingUser) {
  return withSharedContext(async (client) => {
    const channel = await repo.findChannelById(client, channelId);
    if (!channel) {
      throw Object.assign(new Error("Channel not found"), { status: 404 });
    }
    const actingMember = await repo.isMember(
      client,
      channelId,
      actingUser.user_id,
    );
    if (!actingMember || actingMember.role !== "admin") {
      throw Object.assign(new Error("Only channel admins can change roles"), {
        status: 403,
      });
    }
    const ok = await repo.updateMemberRole(client, {
      channelId,
      userId: user_id,
      role,
    });
    if (!ok) {
      throw Object.assign(new Error("Member not found"), { status: 404 });
    }
    emitToChannelMembers(channel, "channel:updated", { channelId });
    return { updated: true };
  });
}

// ─────────────────────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────────────────────

async function listMessages(channelId, query, user) {
  return withSharedContext(async (client) => {
    const channel = await repo.findChannelById(client, channelId);
    if (!channel) {
      throw Object.assign(new Error("Channel not found"), { status: 404 });
    }
    const allowed = await canUserAccessChannel(client, channel, user);
    if (!allowed) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    return repo.listMessages(client, {
      channelId,
      userId: user.user_id,
      before: query.before,
      limit: Math.min(parseInt(query.limit) || 50, 200),
    });
  });
}

/**
 * Send a message to a channel.
 */
async function sendMessage(channelId, data, user) {
  const { message, channel } = await withSharedContext(async (client) => {
    const channel = await repo.findChannelById(client, channelId);
    if (!channel) {
      throw Object.assign(new Error("Channel not found"), { status: 404 });
    }
    const allowed = await canUserAccessChannel(client, channel, user);
    if (!allowed) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    if (data.message_type && !VALID_MESSAGE_TYPES.includes(data.message_type)) {
      throw Object.assign(new Error("Invalid message_type"), { status: 400 });
    }
    if (!data.content && !data.attachments?.length) {
      throw Object.assign(new Error("content or attachments required"), {
        status: 400,
      });
    }

    const message = await repo.insertMessage(client, {
      channel_id: channelId,
      sender_user_id: user.user_id,
      message_type: data.message_type || "text",
      content: data.content,
      reply_to_id: data.reply_to_id,
    });

    // @mentions — notify any channel members whose first name appears as
    // @firstname in the message. We only resolve user_id participants.
    const mentions = (data.content || "").match(/@(\w+)/g) || [];
    if (mentions.length && Array.isArray(channel.members)) {
      const notifService = require("../notifications/notifications.service");
      for (const m of channel.members) {
        if (!m.user_id || m.user_id === user.user_id) continue;
        const firstName = (m.display_name || "").split(" ")[0] || "";
        if (!firstName) continue;
        if (mentions.includes(`@${firstName}`)) {
          await notifService.create(client, {
            userId: m.user_id,
            business: channel.business,
            type: "message",
            title: `${user.display_name} mentioned you`,
            body: (data.content || "").substring(0, 100),
            referenceType: "channel",
            referenceId: channelId,
            actionUrl: `/messaging?channel=${channelId}`,
          });
        }
      }
    }

    // Attach any documents.
    for (const att of data.attachments || []) {
      await repo.attachDocument(client, {
        messageId: message.message_id,
        documentId: att.document_id,
        displayName: att.display_name,
      });
    }

    // EXTERNAL-COMMS-DISABLED: outbound dispatch for customer threads
    // (WhatsApp / Instagram / Messenger via Meta Graph API). Restore this
    // block together with the integrationsService require at the top.
    // if (channel.channel_type === "customer_thread") {
    //   try {
    //     const source = channel.metadata?.source;
    //     const externalId = channel.metadata?.external_id;
    //     if (source && externalId) {
    //       await integrationsService.sendReply({
    //         contactId: externalId,
    //         channelId,
    //         text: data.content,
    //         source,
    //         business: channel.business,
    //       });
    //     }
    //   } catch (err) {
    //     // Don't roll back — insert a system message in the same thread
    //     // so the team knows the outbound failed.
    //     await repo.insertMessage(client, {
    //       channel_id: channelId,
    //       message_type: "system",
    //       content: `Outbound delivery failed: ${err.message}. The customer did not receive this reply.`,
    //     });
    //   }
    // }

    // Real-time push for connected clients viewing the channel.
    const payload = {
      channelId,
      messageId: message.message_id,
      senderUserId: user.user_id,
      senderName: user.display_name,
      channelName: channel.name || null,
      channelType: channel.channel_type,
      messageType: message.message_type,
      preview: (data.content || "").substring(0, 120),
    };
    emitNewMessage(channel, payload);

    return { message, channel };
  });

  // Post-commit, fire-and-forget: backlog bell nudges (and web push, once
  // configured). Best-effort — a failure here must never fail or slow the
  // send itself.
  setImmediate(() => {
    dispatchMessageAlerts(channel, message, user).catch((err) =>
      logger.warn(`Post-send alert dispatch failed: ${err.message}`),
    );
  });

  return message;
}

// ─────────────────────────────────────────────────────────────
// Post-send alerts — run AFTER the send transaction commits.
//
// The bell stays out of everyday chat, but when someone's unread pile
// crosses an urgency threshold (10, then 30) they get ONE bell
// notification pulling them back to Messaging. Deduped per level: skipped
// while an unread nudge of that level exists or one was created in the
// last 24h, so steady chatter doesn't re-nudge on every message.
// ─────────────────────────────────────────────────────────────

const BACKLOG_NUDGE_LEVELS = [30, 10];

async function dispatchMessageAlerts(channel, message, sender) {
  const recipients = (channel.members || []).filter(
    (m) => m.user_id && m.user_id !== sender.user_id && !m.is_muted,
  );
  if (!recipients.length) return;
  const notifService = require("../notifications/notifications.service");
  await withSharedContext(async (client) => {
    for (const member of recipients) {
      const total = await repo.getUnreadCountForUser(client, member.user_id);
      const level = BACKLOG_NUDGE_LEVELS.find((l) => total > l);
      if (!level) continue;
      const refType = `messaging_backlog_${level}`;
      const { rows: existing } = await client.query(
        `SELECT 1 FROM shared.notifications
         WHERE user_id = $1 AND reference_type = $2
           AND (is_read = false OR created_at > now() - interval '24 hours')
         LIMIT 1`,
        [member.user_id, refType],
      );
      if (existing.length) continue;
      const {
        rows: [u],
      } = await client.query(
        `SELECT default_business FROM shared.users WHERE user_id = $1`,
        [member.user_id],
      );
      await notifService.create(client, {
        userId: member.user_id,
        business: channel.business || u?.default_business || "jewelry",
        type: "message",
        title:
          level === 30
            ? "30+ unread messages — your team is waiting"
            : "Unread messages are piling up",
        body: `You have ${total} unread message${total === 1 ? "" : "s"} in Messaging`,
        referenceType: refType,
        actionUrl: "/messaging",
      });
    }
  });
}

/**
 * Edit your own message (WhatsApp-style, shows an "edited" label).
 */
async function editMessage(messageId, { content }, user) {
  return withSharedContext(async (client) => {
    const message = await repo.findMessageById(client, messageId);
    if (!message) {
      throw Object.assign(new Error("Message not found"), { status: 404 });
    }
    if (message.sender_user_id !== user.user_id) {
      throw Object.assign(new Error("You can only edit your own messages"), {
        status: 403,
      });
    }
    if (!content || !content.trim()) {
      throw Object.assign(new Error("content required"), { status: 400 });
    }
    const updated = await repo.editMessage(client, messageId, content.trim());
    if (!updated) {
      throw Object.assign(new Error("Message cannot be edited"), {
        status: 400,
      });
    }
    const channel = await repo.findChannelById(client, message.channel_id);
    emitToChannelMembers(channel, "message:updated", {
      channelId: message.channel_id,
      messageId,
    });
    return updated;
  });
}

/**
 * Delete for everyone — the bubble becomes "This message was deleted".
 */
async function deleteMessage(messageId, user) {
  return withSharedContext(async (client) => {
    const message = await repo.findMessageById(client, messageId);
    if (!message) {
      throw Object.assign(new Error("Message not found"), { status: 404 });
    }
    if (message.sender_user_id !== user.user_id) {
      // Allow channel admins to delete others' messages.
      const member = await repo.isMember(
        client,
        message.channel_id,
        user.user_id,
      );
      if (!member || member.role !== "admin") {
        throw Object.assign(
          new Error("You can only delete your own messages"),
          { status: 403 },
        );
      }
    }
    const result = await repo.softDeleteMessage(client, messageId);
    const channel = await repo.findChannelById(client, message.channel_id);
    emitToChannelMembers(channel, "message:deleted", {
      channelId: message.channel_id,
      messageId,
    });
    return result;
  });
}

/**
 * Forward a message to one or more other channels the user belongs to.
 */
async function forwardMessage(messageId, { channel_ids }, user) {
  return withSharedContext(async (client) => {
    const original = await repo.findMessageById(client, messageId);
    if (!original || original.is_deleted) {
      throw Object.assign(new Error("Message not found"), { status: 404 });
    }
    const sourceChannel = await repo.findChannelById(
      client,
      original.channel_id,
    );
    const canRead = await canUserAccessChannel(client, sourceChannel, user);
    if (!canRead) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    const attachments = await repo.getAttachments(client, messageId);

    const forwarded = [];
    for (const targetId of channel_ids || []) {
      const target = await repo.findChannelById(client, targetId);
      if (!target) continue;
      const isTargetMember = await repo.isMember(
        client,
        targetId,
        user.user_id,
      );
      if (!isTargetMember) continue;

      const copy = await repo.insertMessage(client, {
        channel_id: targetId,
        sender_user_id: user.user_id,
        message_type: original.message_type,
        content: original.content,
        is_forwarded: true,
      });
      for (const att of attachments) {
        await repo.attachDocument(client, {
          messageId: copy.message_id,
          documentId: att.document_id,
          displayName: att.display_name,
        });
      }
      emitNewMessage(target, {
        channelId: targetId,
        messageId: copy.message_id,
        senderUserId: user.user_id,
        senderName: user.display_name,
        channelName: target.name || null,
        channelType: target.channel_type,
        messageType: copy.message_type,
        preview: (original.content || "").substring(0, 120),
      });
      forwarded.push(copy.message_id);
    }
    return { forwarded_count: forwarded.length, message_ids: forwarded };
  });
}

// ─────────────────────────────────────────────────────────────
// READ RECEIPTS
// ─────────────────────────────────────────────────────────────

async function markRead(channelId, { up_to_message_id }, user) {
  return withSharedContext(async (client) => {
    const channel = await repo.findChannelById(client, channelId);
    if (!channel) {
      throw Object.assign(new Error("Channel not found"), { status: 404 });
    }
    const allowed = await canUserAccessChannel(client, channel, user);
    if (!allowed) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    const marked = await repo.markMessagesRead(client, {
      channelId,
      userId: user.user_id,
      upToMessageId: up_to_message_id,
    });
    await repo.updateLastReadAt(client, channelId, user.user_id);
    if (marked > 0) {
      // Lets senders flip their ticks to "read" in real time.
      emitToChannelMembers(channel, "message:read", {
        channelId,
        readerUserId: user.user_id,
      });
    }
    return { marked_read: marked };
  });
}

async function getUnreadCount(user) {
  return withSharedContext(async (client) => {
    const count = await repo.getUnreadCountForUser(client, user.user_id);
    return { unread_count: count };
  });
}

// ─────────────────────────────────────────────────────────────
// Thread assignment & resolution — used by customer threads.
// EXTERNAL-COMMS-DISABLED: dormant while the Meta bridge is off, but
// kept callable so old threads can still be tidied up.
// ─────────────────────────────────────────────────────────────

async function assignThread(channelId, { assigned_to, handoff_note }, user) {
  return withSharedContext(async (client) => {
    const {
      rows: [ch],
    } = await client.query(
      `UPDATE shared.message_channels
       SET assigned_to = $1, assigned_at = now(), updated_at = now()
       WHERE channel_id = $2
       RETURNING *`,
      [assigned_to || null, channelId],
    );
    if (!ch)
      throw Object.assign(new Error("Channel not found"), { status: 404 });

    if (handoff_note) {
      await repo.insertMessage(client, {
        channel_id: channelId,
        message_type: "system",
        content: `Thread assigned by ${user.display_name}: ${handoff_note}`,
      });
    } else {
      await repo.insertMessage(client, {
        channel_id: channelId,
        message_type: "system",
        content: `Thread assigned by ${user.display_name}`,
      });
    }

    if (assigned_to && assigned_to !== user.user_id) {
      const notifService = require("../notifications/notifications.service");
      await notifService.create(client, {
        userId: assigned_to,
        business: ch.business,
        type: "task_assigned",
        title: "Thread assigned to you",
        body: ch.name || "Customer conversation",
        referenceType: "channel",
        referenceId: channelId,
        actionUrl: `/messaging?channel=${channelId}`,
      });
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: ch.business,
      module: "messaging",
      action: "thread_assigned",
      table: "shared.message_channels",
      recordId: channelId,
      metadata: { assigned_to },
    });
    return ch;
  });
}

async function resolveThread(channelId, user) {
  return withSharedContext(async (client) => {
    const {
      rows: [ch],
    } = await client.query(
      `UPDATE shared.message_channels
       SET status = 'resolved', is_archived = true, updated_at = now()
       WHERE channel_id = $1
       RETURNING *`,
      [channelId],
    );
    if (!ch)
      throw Object.assign(new Error("Channel not found"), { status: 404 });

    await repo.insertMessage(client, {
      channel_id: channelId,
      message_type: "system",
      content: `Conversation resolved by ${user.display_name}`,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: ch.business,
      module: "messaging",
      action: "thread_resolved",
      table: "shared.message_channels",
      recordId: channelId,
    });
    return ch;
  });
}

// ─────────────────────────────────────────────────────────────
// Emoji reactions — toggle per (message, user, emoji).
// ─────────────────────────────────────────────────────────────

async function toggleReaction(messageId, emoji, user) {
  return withSharedContext(async (client) => {
    const message = await repo.findMessageById(client, messageId);
    if (!message) {
      throw Object.assign(new Error("Message not found"), { status: 404 });
    }
    const {
      rows: [existing],
    } = await client.query(
      `SELECT reaction_id FROM shared.message_reactions
       WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, user.user_id, emoji],
    );
    let added;
    if (existing) {
      await client.query(
        `DELETE FROM shared.message_reactions WHERE reaction_id = $1`,
        [existing.reaction_id],
      );
      added = false;
    } else {
      await client.query(
        `INSERT INTO shared.message_reactions (message_id, user_id, emoji)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
        [messageId, user.user_id, emoji],
      );
      added = true;
    }
    const channel = await repo.findChannelById(client, message.channel_id);
    emitToChannelMembers(channel, "message:updated", {
      channelId: message.channel_id,
      messageId,
    });
    return { added, emoji };
  });
}

// ─────────────────────────────────────────────────────────────
// Stars & search
// ─────────────────────────────────────────────────────────────

async function toggleStar(messageId, user) {
  return withSharedContext(async (client) => {
    const message = await repo.findMessageById(client, messageId);
    if (!message) {
      throw Object.assign(new Error("Message not found"), { status: 404 });
    }
    return repo.toggleStar(client, messageId, user.user_id);
  });
}

async function listStarred(query, user) {
  return withSharedContext(async (client) => {
    const rows = await repo.listStarred(client, user.user_id, {
      limit: Math.min(parseInt(query.limit) || 50, 200),
    });
    return { data: rows };
  });
}

async function searchMessages(query, user) {
  return withSharedContext(async (client) => {
    if (!query.q || !query.q.trim()) {
      return { data: [] };
    }
    const rows = await repo.searchMessages(client, {
      userId: user.user_id,
      q: query.q.trim(),
      channelId: query.channel_id,
      limit: Math.min(parseInt(query.limit) || 50, 100),
    });
    return { data: rows };
  });
}

// ─────────────────────────────────────────────────────────────
// Email log — outbound emails (invoices, payslips, quotations,
// campaigns) surfaced in the Messaging UI for search & audit.
// ─────────────────────────────────────────────────────────────

async function listEmailLog(query, user) {
  return withSharedContext(async (client) => {
    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const rows = await repo.listEmailLog(client, {
      q: query.q,
      business: query.business,
      status: query.status,
      limit,
      offset,
    });
    return { data: rows, pagination: { page, limit } };
  });
}

// ─────────────────────────────────────────────────────────────
// Customer 360 — contact + recent orders / open invoices / deliveries.
// EXTERNAL-COMMS-DISABLED: only reachable from old customer threads.
// ─────────────────────────────────────────────────────────────

async function getCustomer360(contactId, user) {
  const { pool } = require("../../config/db");
  const businesses = user.permitted_businesses || ["jewelry", "diffusers"];

  // Shared contact lookup.
  const {
    rows: [contact],
  } = await pool.query(
    `SELECT contact_id, display_name, primary_phone, email, whatsapp_number,
            company_name, tags
     FROM shared.contacts
     WHERE contact_id = $1 AND is_deleted = false`,
    [contactId],
  );
  if (!contact)
    throw Object.assign(new Error("Contact not found"), { status: 404 });

  const orders = [];
  const invoices = [];
  const deliveries = [];

  for (const biz of businesses) {
    try {
      const o = await pool.query(
        `SELECT order_id, order_number, status, total_amount AS total
         FROM ${biz}.sales_orders
         WHERE contact_id = $1
         ORDER BY created_at DESC LIMIT 5`,
        [contactId],
      );
      orders.push(...o.rows);
    } catch {
      /* brand may not have sales_orders for this contact */
    }

    try {
      const i = await pool.query(
        `SELECT invoice_id, invoice_number,
                amount_outstanding AS amount_due,
                due_date
         FROM ${biz}.invoices
         WHERE contact_id = $1
           AND status NOT IN ('paid','voided')
           AND is_deleted = false
         ORDER BY due_date ASC NULLS LAST LIMIT 5`,
        [contactId],
      );
      invoices.push(...i.rows);
    } catch {
      /* may not exist */
    }

    try {
      const d = await pool.query(
        `SELECT delivery_id, delivery_number, status
         FROM ${biz}.deliveries
         WHERE contact_id = $1
         ORDER BY created_at DESC LIMIT 5`,
        [contactId],
      );
      deliveries.push(...d.rows);
    } catch {
      /* may not exist */
    }
  }

  return { contact, orders, invoices, deliveries };
}

module.exports = {
  // channels
  listChannels,
  getChannel,
  createChannel,
  updateChannel,
  archiveChannel,
  setChannelFlag,
  // members
  addMember,
  removeMember,
  changeMemberRole,
  // messages
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  forwardMessage,
  // reads
  markRead,
  getUnreadCount,
  // thread management
  assignThread,
  resolveThread,
  // reactions, stars & search
  toggleReaction,
  toggleStar,
  listStarred,
  searchMessages,
  // email log
  listEmailLog,
  // customer 360
  getCustomer360,
  // constants
  VALID_MESSAGE_TYPES,
  VALID_CHANNEL_TYPES,
};
