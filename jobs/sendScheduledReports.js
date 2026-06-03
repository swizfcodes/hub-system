"use strict";

const { pool } = require("../config/db");
const reportsService = require("../modules/reports/reports.service");
const smtp = require("../integrations/messaging/adapters/smtp");
const { renderEmail } = require("../lib/email/render");
const whatsapp = require("../integrations/messaging/adapters/whatsapp");
const logger = require("../config/logger");
const businesses = require("../config/businesses");

module.exports = async function sendScheduledReports() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const dayOfMonth = now.getDate();

  for (const business of businesses.getActiveBusinesses()) {
    let rows = [];
    try {
      const result = await pool.query(
        `SELECT sr.* FROM ${business}.saved_reports sr
         WHERE sr.schedule IS NOT NULL AND sr.schedule != '{}'::jsonb`,
      );
      rows = result.rows;
    } catch (err) {
      logger.error(
        `[scheduled-reports] could not read saved_reports for ${business}: ${err.message}`,
      );
      continue;
    }

    for (const report of rows) {
      try {
        const schedule = report.schedule;
        if (!schedule?.frequency) continue;

        const isDue =
          (schedule.frequency === "weekly" &&
            schedule.day_of_week === dayOfWeek) ||
          (schedule.frequency === "monthly" &&
            schedule.day_of_month === dayOfMonth);

        if (!isDue) continue;

        const { startDate, endDate } = buildReportDateRange(
          schedule.frequency,
        );

        const [family, reportType] = report.report_type.split(".");
        const { output } = await reportsService.generate({
          business,
          family,
          reportType,
          format: schedule.channels?.includes("email") ? "pdf" : "json",
          options: { startDate, endDate, ...(report.filters || {}) },
          user: { user_id: null, display_name: "Scheduled Report" },
          archive: true,
        });

        if (schedule.channels?.includes("email") && schedule.recipients?.length) {
          for (const email of schedule.recipients) {
            const { subject: subj, html: reportHtml } = renderEmail("scheduled_report", business, {
              report_name: report.report_name,
              start_date: startDate,
              end_date: endDate,
            });
            await smtp.sendChannelMessage({
              to: email,
              subject: subj,
              html: reportHtml,
              attachments: [
                { filename: `${report.report_name}.pdf`, content: output },
              ],
              business,
            });
          }
        }

        if (
          schedule.channels?.includes("whatsapp") &&
          schedule.whatsapp_numbers?.length
        ) {
          const summaryText = `*${report.report_name}*\n${startDate} → ${endDate}\n\nFull report available in Orika Hub.`;
          for (const number of schedule.whatsapp_numbers) {
            await whatsapp.sendMessage({
              to: number,
              text: summaryText,
              business,
            });
          }
        }

        logger.info(
          `[scheduled-reports] Delivered "${report.report_name}" for ${business}`,
        );
      } catch (err) {
        logger.error(
          `[scheduled-reports] Failed for report ${report.report_id}: ${err.message}`,
        );
      }
    }
  }
};

function buildReportDateRange(frequency) {
  const now = new Date();
  if (frequency === "weekly") {
    const end = new Date(now);
    end.setDate(now.getDate() - 1);
    const start = new Date(end);
    start.setDate(end.getDate() - 6);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }
  // monthly — previous calendar month
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
