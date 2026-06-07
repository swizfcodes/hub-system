"use strict";
const { withBusinessContext } = require("../config/db");
const logger = require("../config/logger");
const { emitToBusiness } = require("../config/sockets");
const { getActiveBusinesses } = require("../config/businesses");

// Fire internal notifications for upcoming birthdays/anniversaries
module.exports = async function sendMilestoneReminders() {
  for (const business of getActiveBusinesses()) {
    await withBusinessContext(business, async (client) => {
      const { rows } = await client.query(`
        SELECT m.milestone_type, m.milestone_date,
               c.display_name, c.contact_id,
               c.assigned_to
        FROM customer_milestones m
        JOIN shared.contacts c ON c.contact_id = m.contact_id
        WHERE EXTRACT(MONTH FROM m.milestone_date) = EXTRACT(MONTH FROM CURRENT_DATE + INTERVAL '7 days')
          AND EXTRACT(DAY   FROM m.milestone_date) = EXTRACT(DAY   FROM CURRENT_DATE + INTERVAL '7 days')
      `);

      for (const row of rows) {
        if (!row.assigned_to) continue;

        await client.query(
          `INSERT INTO shared.notifications
             (user_id, business, type, title, body, reference_type, reference_id)
           VALUES ($1, $2, 'system', $3, $4, 'contact', $5)`,
          [
            row.assigned_to,
            business,
            `Upcoming ${row.milestone_type}: ${row.display_name}`,
            `${row.display_name}'s ${row.milestone_type} is in 7 days. Consider reaching out.`,
            row.contact_id,
          ],
        );

        emitToBusiness(business, "notification:new", {
          userId: row.assigned_to,
        });
        logger.info(
          `Milestone reminder queued: ${row.display_name} [${row.milestone_type}]`,
        );
      }
    });
  }
};
