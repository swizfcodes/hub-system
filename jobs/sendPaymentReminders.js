"use strict";
const { withBusinessContext } = require("../config/db");
const { sendEmail } = require("../lib/email/sender");
const { renderEmail } = require("../lib/email/render");
const logger = require("../config/logger");
const { getActiveBusinesses } = require("../config/businesses");

module.exports = async function sendPaymentReminders() {
  for (const business of getActiveBusinesses()) {
    await withBusinessContext(business, async (client) => {
      // Invoices overdue 1, 3, 7 days — send reminder
      const { rows } = await client.query(`
        SELECT i.invoice_id, i.invoice_number, i.amount_outstanding, i.due_date,
               c.email, c.display_name, c.whatsapp_number
        FROM invoices i
        JOIN shared.contacts c ON c.contact_id = i.contact_id
        WHERE i.status IN ('overdue','partially_paid')
          AND i.is_deleted = false
          AND c.email IS NOT NULL
          AND (CURRENT_DATE - i.due_date) IN (1, 3, 7)
      `);

      for (const inv of rows) {
        try {
          const { subject: subj, html: body } = renderEmail("payment_reminder", business, {
            display_name: inv.display_name,
            invoice_number: inv.invoice_number,
            amount_outstanding: inv.amount_outstanding,
          });
          await sendEmail({ to: inv.email, subject: subj, html: body, business });
          logger.info(
            `Payment reminder sent: ${inv.invoice_number} → ${inv.email}`,
          );
        } catch (err) {
          logger.error(`Reminder failed for ${inv.invoice_number}`, err);
        }
      }
    });
  }
};
