"use strict";

const { withBusinessContext } = require("../config/db");
const { sendEmail } = require("../lib/email/sender");
const { renderEmail } = require("../lib/email/render");
const whatsapp = require("../integrations/messaging/adapters/whatsapp");
const logger = require("../config/logger");
const config = require("../config/config");
const { getActiveBusinesses } = require("../config/businesses");

// ─────────────────────────────────────────────────────────────
// sendPartnerPaymentReminders
//
// Fulfils the Module 9 (Retail Partners) promise:
//   "Automated reminders prompt partners when payment is due."
//
// Runs daily. For each business, finds settlements that have been
// SENT but not yet PAID, and whose period_end + payment_terms_days
// is on or before today. Sends a reminder via WhatsApp if the partner
// has a WhatsApp number, otherwise email.
//
// We use a ladder of milestones — 1, 3, 7, and 14 days past due —
// rather than spamming the partner every day. This matches the
// pattern in sendPaymentReminders.js (the customer-side cron) so
// partners and customers get the same cadence.
// ─────────────────────────────────────────────────────────────

const REMINDER_DAYS_PAST_DUE = [1, 3, 7, 14];

module.exports = async function sendPartnerPaymentReminders() {
  const businesses = getActiveBusinesses();

  for (const business of businesses) {
    await withBusinessContext(business, async (client) => {
      const { rows } = await client.query(
        `SELECT ps.settlement_id, ps.settlement_number,
                ps.period_end, ps.amount_due_to_us,
                ps.updated_at AS sent_at,
                rp.payment_terms_days,
                rp.partner_code,
                c.contact_id, c.display_name, c.email, c.whatsapp_number,
                (CURRENT_DATE
                  - (ps.period_end + (rp.payment_terms_days || ' days')::interval)::date
                )::int AS days_past_due
         FROM partner_settlements ps
         JOIN retail_partners rp ON rp.partner_id = ps.partner_id
         JOIN shared.contacts c   ON c.contact_id = rp.contact_id
         WHERE ps.status = 'sent'
           AND rp.is_active = true
           AND (CURRENT_DATE
                - (ps.period_end + (rp.payment_terms_days || ' days')::interval)::date
               )::int = ANY ($1::int[])`,
        [REMINDER_DAYS_PAST_DUE],
      );

      if (!rows.length) {
        logger.debug(`[partner_reminders:${business}] no overdue settlements`);
        return;
      }

      for (const r of rows) {
        try {
          const amount = Number(r.amount_due_to_us).toLocaleString("en-NG", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          const tone = pickTone(r.days_past_due);
          const body =
            `${tone.greeting} ${r.display_name},\n\n` +
            `This is a reminder that settlement ${r.settlement_number} for ` +
            `the period ending ${r.period_end} (${tone.daysLabel(r.days_past_due)}) ` +
            `is outstanding.\n\n` +
            `Amount due: ₦${amount}\n\n` +
            `Please arrange payment at your earliest convenience. If payment ` +
            `has already been made, kindly disregard this message.\n\n` +
            `Thank you for your continued partnership.`;

          let sent = false;

          if (r.whatsapp_number) {
            await whatsapp.sendMessage({ to: r.whatsapp_number, text: body });
            sent = true;
            logger.info(
              `[partner_reminders:${business}] WhatsApp reminder sent: ${r.settlement_number} → ${r.partner_code} (day ${r.days_past_due})`,
            );
          } else if (r.email) {
            const { subject: subj, html: emailHtml } = renderEmail("partner_reminder", business, {
              settlement_number: r.settlement_number,
              body: body.replace(/\n/g, "<br>"),
            });
            await sendEmail({ to: r.email, subject: subj, html: emailHtml, business });
            sent = true;
            logger.info(
              `[partner_reminders:${business}] email reminder sent: ${r.settlement_number} → ${r.partner_code} (day ${r.days_past_due})`,
            );
          }

          if (!sent) {
            logger.warn(
              `[partner_reminders:${business}] no contact method for partner ${r.partner_code} — settlement ${r.settlement_number} skipped`,
            );
          }
        } catch (err) {
          // One partner's failure shouldn't stop the rest of the sweep.
          logger.error(
            `[partner_reminders:${business}] reminder failed for ${r.settlement_number}: ${err.message}`,
          );
        }
      }
    });
  }
};

function pickTone(daysPastDue) {
  if (daysPastDue <= 1) {
    return {
      greeting: "Hello",
      daysLabel: (d) => (d === 1 ? "1 day past due" : "now due"),
    };
  }
  if (daysPastDue <= 7) {
    return {
      greeting: "Hello",
      daysLabel: (d) => `${d} days past due`,
    };
  }
  return {
    greeting: "Dear",
    daysLabel: (d) => `now ${d} days past due`,
  };
}