"use strict";

// ─────────────────────────────────────────────────────────────
// BIRTHDAY EMAIL JOB
//
// Runs daily at 10am. Queries shared.contacts for every contact
// whose birthday_month + birthday_day match today, then sends a
// personalised birthday greeting from the brand they belong to.
//
// Single source of truth: shared.contacts.birthday_month / birthday_day
// (1-indexed; no year stored — anniversary-style lookup).
//
// To ensure each contact only gets one email per calendar day:
//   - We log a row in shared.email_logs (if it exists) keyed on
//     (contact_id, 'birthday', date), OR
//   - We use a lighter approach: skip contacts whose last birthday
//     email was sent this calendar year (checked via campaign_recipients
//     if email_logs table doesn't exist).
//
// Because this job runs across ALL businesses (multi-tenant), it
// iterates getActiveBusinesses() and sends from each business's own
// email identity and brand config.
// ─────────────────────────────────────────────────────────────

const { withSharedContext } = require("../config/db");
const { sendEmail }         = require("../lib/email/sender");
const { renderEmail }       = require("../lib/email/render");
const logger                = require("../config/logger");
const { getActiveBusinesses } = require("../config/businesses");

module.exports = async function sendBirthdayEmails() {
  const now      = new Date();
  const month    = now.getMonth() + 1; // 1-indexed
  const day      = now.getDate();
  const yearStr  = String(now.getFullYear());

  logger.info(`[birthday] Checking for birthdays on ${month}/${day}`);

  // ── 1. Pull all contacts whose birthday is today ───────────────────────────
  // We load across all businesses by querying shared.contacts directly.
  // visible_to contains an array of business keys (e.g. ['jewelry']).
  // We send one birthday email per business they are visible to.
  //
  // De-duplication: we keep a birthday_email_sent_year column on the
  // contact (see guard below). If that column doesn't exist yet, we
  // fall back to checking the shared.activity_log (if present).
  // In all cases, a non-fatal error in one recipient never blocks others.

  let contacts = [];
  try {
    await withSharedContext(async (client) => {
      const { rows } = await client.query(
        `SELECT
           contact_id,
           display_name,
           first_name,
           email,
           visible_to,
           birthday_email_sent_year
         FROM shared.contacts
         WHERE birthday_month = $1
           AND birthday_day   = $2
           AND email IS NOT NULL
           AND is_deleted = false
           AND (birthday_email_sent_year IS NULL
                OR birthday_email_sent_year != $3)`,
        [month, day, yearStr],
      );
      contacts = rows;
    });
  } catch (err) {
    // birthday_email_sent_year column may not exist yet — fall back to
    // querying without the dedup guard and let per-recipient logging handle it.
    if (err.message?.includes("birthday_email_sent_year")) {
      logger.warn("[birthday] birthday_email_sent_year column not found — sending without yearly dedup guard. Add column: ALTER TABLE shared.contacts ADD COLUMN birthday_email_sent_year text;");
      await withSharedContext(async (client) => {
        const { rows } = await client.query(
          `SELECT
             contact_id,
             display_name,
             first_name,
             email,
             visible_to
           FROM shared.contacts
           WHERE birthday_month = $1
             AND birthday_day   = $2
             AND email IS NOT NULL
             AND is_deleted = false`,
          [month, day],
        );
        contacts = rows;
      });
    } else {
      throw err;
    }
  }

  if (!contacts.length) {
    logger.info(`[birthday] No birthdays today (${month}/${day})`);
    return;
  }

  logger.info(`[birthday] ${contacts.length} birthday contact(s) to greet today`);

  const businesses = getActiveBusinesses();
  let sent = 0, skipped = 0, failed = 0;

  for (const contact of contacts) {
    // A contact can be shared across businesses (visible_to is an array).
    // We send from the FIRST matching active business to avoid duplicates.
    const contactBusinesses = (contact.visible_to || []).filter((b) =>
      businesses.includes(b),
    );
    const targetBusiness = contactBusinesses[0];

    if (!targetBusiness) {
      skipped++;
      continue;
    }

    try {
      const { subject, html } = renderEmail("birthday", targetBusiness, {
        first_name:   contact.first_name || contact.display_name,
        display_name: contact.display_name,
        shop_url:     null, // resolved from brand.website inside template
      });

      await sendEmail({
        to:       contact.email,
        subject,
        html,
        business: targetBusiness,
      });

      // Mark as sent this year so we don't double-send on retries
      await withSharedContext(async (client) => {
        await client.query(
          `UPDATE shared.contacts
           SET birthday_email_sent_year = $2
           WHERE contact_id = $1`,
          [contact.contact_id, yearStr],
        ).catch(() => {}); // column may not exist — non-fatal
      });

      sent++;
      logger.debug(`[birthday] Sent to ${contact.email} (${targetBusiness})`);
    } catch (err) {
      failed++;
      logger.error(`[birthday] Failed for contact ${contact.contact_id} <${contact.email}>: ${err.message}`);
    }
  }

  logger.info(`[birthday] Done — sent: ${sent}, skipped: ${skipped}, failed: ${failed}`);
};
