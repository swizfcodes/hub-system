"use strict";

// Cron entry — runs every minute. Picks up campaigns whose
// status='queued' and scheduled_at <= now() and fires them via
// the scheduler service. Delegates entirely to runScheduledSweep().
// Registered in jobs/index.js.

const { runScheduledSweep } = require("../modules/campaigns/scheduler.service");

module.exports = async function runScheduledCampaigns() {
  await runScheduledSweep();
};
