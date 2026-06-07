"use strict";

const cron = require("node-cron");
const logger = require("../config/logger");

const jobs = [];

function register(name, schedule, fn) {
  const task = cron.schedule(
    schedule,
    async () => {
      try {
        logger.debug(`Job started: ${name}`);
        await fn();
        logger.debug(`Job completed: ${name}`);
      } catch (err) {
        logger.error(`Job failed: ${name}`, err);
      }
    },
    { scheduled: false },
  );
  jobs.push({ name, task });
}

function start() {
  // ── Frequency reference ────────────────────────────────
  // '0 * * * *'       — every hour
  // '0 0 * * *'       — daily at midnight
  // '*/5 * * * *'     — every 5 minutes
  // '0 8 * * 1-5'     — 8am weekdays

  register(
    "markOverdueInvoices",
    "0 7 * * *",
    require("./markOverdueInvoices"),
  );
  register(
    "expireReservations",
    "*/10 * * * *",
    require("./expireReservations"),
  );
  register("syncCurrencyRates", "0 9 * * 1-5", require("./syncCurrencyRates"));
  register("syncShopifyStock", "*/15 * * * *", require("./syncShopifyStock"));
  // register(
  //   "syncWooCommerceStock",
  //   "*/15 * * * *",
  //   require("./syncWooCommerceStock"),
  // );
  register(
    "sendScheduledCampaigns",
    "*/5 * * * *",
    require("./sendScheduledCampaigns"),
  );
  register(
    "publishScheduledPosts",
    "*/5 * * * *",
    require("./publishScheduledPosts"),
  );
  register(
    "sendPaymentReminders",
    "0 9 * * *",
    require("./sendPaymentReminders"),
  );
  register(
    "sendMilestoneReminders",
    "0 8 * * *",
    require("./sendMilestoneReminders"),
  );
  register("cleanupSessions", "0 3 * * *", require("./cleanupSessions"));
  register(
    "expireLoyaltyPoints",
    "0 2 * * *",
    require("./expireLoyaltyPoints"),
  );
  register(
    "replayFailedWebhooks",
    "*/30 * * * *",
    require("./replayFailedWebhooks"),
  );
  register(
    "generateFiscalPeriods",
    "0 0 1 * *",
    require("./generateFiscalPeriods"),
  );
  register(
    "sendpartnerPaymentReminders",
    "0 0 1 * *",
    require("./sendPartnerPaymentReminders"),
  );
  register("fetchSocialMetrics", "0 3 * * *", require("./fetchSocialMetrics"));
  // Weekly digest (Mondays 7am) and monthly digest (1st 7am).
  register(
    "sendScheduledReportsWeekly",
    "0 7 * * 1",
    require("./sendScheduledReports"),
  );
  register(
    "sendScheduledReportsMonthly",
    "0 7 1 * *",
    require("./sendScheduledReports"),
  );
  // Campaign scheduler — fires queued campaigns whose scheduled_at <= now().
  register(
    "runScheduledCampaigns",
    "* * * * *",
    require("./runScheduledCampaigns"),
  );
  // Sales-campaign status sweep — activate scheduled, expire ended.
  register(
    "updateCampaignStatuses",
    "*/5 * * * *",
    require("./updateCampaignStatuses"),
  );
  // Task reminders — notify the assignee when remind_at has passed.
  register("sendTaskReminders", "*/5 * * * *", require("./sendTaskReminders"));

  jobs.forEach(({ name, task }) => {
    task.start();
    logger.info(`Job scheduled: ${name}`);
  });
}

function stop() {
  jobs.forEach(({ name, task }) => {
    task.stop();
    logger.info(`Job stopped: ${name}`);
  });
}

module.exports = { start, stop };
