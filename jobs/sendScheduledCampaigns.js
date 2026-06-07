"use strict";
const { withBusinessContext } = require("../config/db");
const { sendEmail } = require("../lib/email/sender");
const logger = require("../config/logger");
const { getActiveBusinesses } = require("../config/businesses");

module.exports = async function sendScheduledCampaigns() {
  for (const business of getActiveBusinesses()) {
    await withBusinessContext(business, async (client) => {
      const { rows: campaigns } = await client.query(`
        SELECT campaign_id, campaign_name, campaign_type, subject_line,
               from_name, html_content
        FROM campaigns
        WHERE status = 'queued'
          AND scheduled_at <= now()
      `);

      for (const campaign of campaigns) {
        await client.query(
          `UPDATE campaigns SET status = 'sending' WHERE campaign_id = $1`,
          [campaign.campaign_id],
        );

        const { rows: recipients } = await client.query(
          `SELECT cr.recipient_id, cr.tracking_token, c.email, c.display_name
           FROM campaign_recipients cr
           JOIN shared.contacts c ON c.contact_id = cr.contact_id
           WHERE cr.campaign_id = $1 AND cr.status = 'pending' AND c.email IS NOT NULL`,
          [campaign.campaign_id],
        );

        let sentCount = 0;
        for (const r of recipients) {
          try {
            await sendEmail({
              to: r.email,
              subject: campaign.subject_line,
              html: campaign.html_content.replace("{{name}}", r.display_name),
              from: campaign.from_name,
              business,
            });
            await client.query(
              `UPDATE campaign_recipients SET status = 'sent', sent_at = now()
               WHERE recipient_id = $1`,
              [r.recipient_id],
            );
            sentCount++;
          } catch (err) {
            logger.error(`Campaign email failed: ${r.email}`, err);
          }
        }

        await client.query(
          `UPDATE campaigns
           SET status = 'sent', sent_at = now(), delivered_count = $2
           WHERE campaign_id = $1`,
          [campaign.campaign_id, sentCount],
        );
        logger.info(
          `Campaign sent: ${campaign.campaign_name} — ${sentCount}/${recipients.length} delivered [${business}]`,
        );
      }
    });
  }
};
