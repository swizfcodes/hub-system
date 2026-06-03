"use strict";

const { withSharedContext } = require("../../config/db");
const { emitToBusiness } = require("../../config/sockets");
const integrationsService = require("../../integrations/messaging/messaging.service");
const auditService = require("../audit/audit.service");
const repo = require("./messaging.repository");

// ─────────────────────────────────────────────────────────────
// MESSAGING SERVICE — Module 14: Messaging (Smartcomm)
//
// Promises from the product description:
//   - "unified inbox" combining customer WhatsApp/IG/FB messages and
//     internal team chats
//   - "see the customer's full history (orders, deals, preferences)
//      alongside the conversation"
//   - "reply directly from the Hub" and route to the same channel
//   - "group chats by team or business line"
//   - "thread-based with read receipts"
//
// Architecture split:
//   - integrations/messaging  — inbound webhook handlers, channel
//     creation, sending via Meta Graph API
//   - shared/messaging (this) — user-facing API for the inbox UI
//
// When the user sends a reply through THIS module to a customer_thread
// channel, we both (a) write the message row, and (b) dispatch via
// the integrations layer's adapters so it actually leaves the building.
// ─────────────────────────────────────────────────────────────

const VALID_MESSAGE_TYPES = [
  "text",
  "image",
  "document",
  "voice_note",
  "system",
];
const VALID_CHANNEL_TYPES = ["group", "direct", "customer_thread"];

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
    // Access check — must be a member, OR a customer_thread in their business.
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
    // Allow if user has access to that business.
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
 * Create a group or direct channel. Customer threads are NEVER created
 * via this path — they're created automatically when an inbound message
 * arrives (in integrations/messaging/messaging.service.handleInbound).
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

    const channel = await repo.insertChannel(client, {
      channel_type: data.channel_type,
      name: data.name,
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

    emitToBusiness(data.business || "shared", "channel:created", {
      channelId: channel.channel_id,
      channelType: channel.channel_type,
    });

    return channel;
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
    return result;
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
    if (!actingMember || actingMember.role !== "admin") {
      throw Object.assign(new Error("Only channel admins can remove members"), {
        status: 403,
      });
    }
    const removed = await repo.removeMember(client, {
      channelId,
      userId: user_id,
      contactId: contact_id,
    });
    return { removed };
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
      before: query.before,
      limit: Math.min(parseInt(query.limit) || 50, 200),
    });
  });
}

/**
 * Send a message to a channel.
 *
 * If the channel is a customer_thread, we also dispatch the message
 * to the external platform (WhatsApp / Instagram / Facebook) via the
 * integrations layer so the customer actually receives it.
 *
 * Failures to dispatch don't roll back the message insert — the staff
 * member's reply is preserved in the inbox; the failure is logged with
 * a system message in the same thread so the next person sees what
 * happened.
 */
async function sendMessage(channelId, data, user) {
  return withSharedContext(async (client) => {
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

    // External dispatch for customer threads. Look up the channel's
    // metadata to figure out the platform (whatsapp / instagram / page).
    if (channel.channel_type === "customer_thread") {
      try {
        const source = channel.metadata?.source;
        const externalId = channel.metadata?.external_id;
        if (source && externalId) {
          await integrationsService.sendReply({
            contactId: externalId,
            channelId,
            text: data.content,
            source,
            business: channel.business,
          });
        }
      } catch (err) {
        // Don't roll back — insert a system message in the same thread
        // so the team knows the outbound failed.
        await repo.insertMessage(client, {
          channel_id: channelId,
          message_type: "system",
          content: `Outbound delivery failed: ${err.message}. The customer did not receive this reply.`,
        });
      }
    }

    // Real-time push for connected clients viewing the channel.
    emitToBusiness(channel.business || "shared", "message:new", {
      channelId,
      messageId: message.message_id,
      senderUserId: user.user_id,
    });

    return message;
  });
}

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
    return result;
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
// Thread assignment & resolution
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
    const {
      rows: [existing],
    } = await client.query(
      `SELECT reaction_id FROM shared.message_reactions
       WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, user.user_id, emoji],
    );
    if (existing) {
      await client.query(
        `DELETE FROM shared.message_reactions WHERE reaction_id = $1`,
        [existing.reaction_id],
      );
      return { added: false, emoji };
    }
    await client.query(
      `INSERT INTO shared.message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
      [messageId, user.user_id, emoji],
    );
    return { added: true, emoji };
  });
}

// ─────────────────────────────────────────────────────────────
// Customer 360 — contact + recent orders / open invoices / deliveries.
// The contact lives in shared schema; orders/invoices/deliveries live
// in each business schema, so we query both jewelry & diffusers and
// merge. Quiet on per-schema failures (a brand may have no business
// relationship with this contact).
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
  archiveChannel,
  // members
  addMember,
  removeMember,
  // messages
  listMessages,
  sendMessage,
  deleteMessage,
  // reads
  markRead,
  getUnreadCount,
  // thread management
  assignThread,
  resolveThread,
  // reactions
  toggleReaction,
  // customer 360
  getCustomer360,
  // constants
  VALID_MESSAGE_TYPES,
  VALID_CHANNEL_TYPES,
};
