"use strict";

const { withSharedContext } = require("../../config/db");
const { emitToBusiness } = require("../../config/sockets");
const logger = require("../../config/logger");
const whatsapp = require("./adapters/whatsapp");
const instaDM = require("./adapters/instagram-dm");
const fbMsgr = require("./adapters/facebook-messenger");
const smtp = require("./adapters/smtp");

// Route inbound messages to the right Smartcomm channel
async function handleInbound({ source, entry, messaging }) {
  try {
    let normalized;

    if (source === "whatsapp_business_account") {
      normalized = whatsapp.parseInbound(messaging);
    } else if (source === "instagram") {
      normalized = instaDM.parseInbound(messaging);
    } else if (source === "page") {
      normalized = fbMsgr.parseInbound(messaging);
    } else if (source === "email") {
      normalized = smtp.parseInbound(messaging); // messaging = email payload
    }

    if (!normalized) return;

    await withSharedContext(async (client) => {
      // Find or create contact
      let contactResult = await client.query(
        `SELECT contact_id FROM shared.contacts
         WHERE primary_phone = $1 OR whatsapp_number = $1 LIMIT 1`,
        [normalized.senderPhone || normalized.senderId],
      );

      let contactId;
      if (contactResult.rows.length) {
        contactId = contactResult.rows[0].contact_id;
      } else {
        const inserted = await client.query(
          `INSERT INTO shared.contacts
             (contact_type, display_name, primary_phone, whatsapp_number, source)
           VALUES (ARRAY['customer'], $1, $2, $2, $3)
           RETURNING contact_id`,
          [
            normalized.senderName || "Unknown",
            normalized.senderPhone || normalized.senderId,
            source,
          ],
        );
        contactId = inserted.rows[0].contact_id;
      }

      // Find or create customer_thread channel
      let channelResult = await client.query(
        `SELECT c.channel_id FROM shared.message_channels c
         JOIN shared.channel_members m ON m.channel_id = c.channel_id
         WHERE c.channel_type = 'customer_thread'
           AND m.contact_id = $1 LIMIT 1`,
        [contactId],
      );

      let channelId;
      if (channelResult.rows.length) {
        channelId = channelResult.rows[0].channel_id;
      } else {
        const ch = await client.query(
          `INSERT INTO shared.message_channels
             (channel_type, name, metadata)
           VALUES ('customer_thread', $1, $2)
           RETURNING channel_id`,
          [
            `Thread: ${normalized.senderName || normalized.senderId}`,
            JSON.stringify({ source, external_id: normalized.senderId }),
          ],
        );
        channelId = ch.rows[0].channel_id;
        await client.query(
          `INSERT INTO shared.channel_members (channel_id, contact_id) VALUES ($1, $2)`,
          [channelId, contactId],
        );
      }

      // Insert message
      const msg = await client.query(
        `INSERT INTO shared.messages
           (channel_id, sender_contact_id, message_type, content, external_ref)
         VALUES ($1, $2, 'text', $3, $4)
         RETURNING message_id`,
        [channelId, contactId, normalized.text, normalized.externalRef],
      );

      // Look up the channel's business — the incoming-payload doesn't
      // tell us which brand owns the customer, but the channel row does
      // (it was tagged at channel creation in the contact-lookup step).
      const {
        rows: [ch],
      } = await client.query(
        `SELECT business FROM shared.message_channels WHERE channel_id = $1`,
        [channelId],
      );
      const businessRoom = ch?.business
        ? `business:${ch.business}`
        : "business:shared";

      // Emit real-time notification to that business's socket room.
      emitToBusiness(businessRoom, "message:new", {
        channelId,
        messageId: msg.rows[0].message_id,
        source,
      });
    });
  } catch (err) {
    logger.error("handleInbound error", err);
  }
}

// Send a reply back to the customer via the correct channel
async function sendReply({ contactId, channelId, text, source, emailMeta, business }) {
  if (source === "whatsapp_business_account" || source === "whatsapp") {
    await whatsapp.sendMessage({ to: contactId, text });
  } else if (source === "instagram") {
    await instaDM.sendMessage({ recipientId: contactId, text });
  } else if (source === "page") {
    await fbMsgr.sendMessage({ recipientId: contactId, text });
  } else if (source === "email") {
    await smtp.sendChannelMessage({
      to: contactId, // customer email
      subject: emailMeta?.subject || "Re: Your enquiry",
      html: `<p>${text}</p>`,
      business,
    });
  }
}

module.exports = { handleInbound, sendReply };
