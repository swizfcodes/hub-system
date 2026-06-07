"use strict";

const { withBusinessContext } = require("../../config/db");
const auditService = require("../../shared/audit/audit.service");
const builder = require("./builder.service");
const scheduler = require("./scheduler.service");
const tracking = require("./tracking.service");
const repo = require("./campaigns.repository");

// ─────────────────────────────────────────────────────────────
// Campaigns service — coordination layer for the email/WhatsApp
// campaigns module. Heavy lifting in three sub-services:
//
//   - builder.service.js   → audience filter compilation, segments
//   - scheduler.service.js → schedule queue, batched send, cron entry
//   - tracking.service.js  → open/click/unsubscribe events, stats
//
// This file handles CRUD on the campaigns table itself and exposes
// a stable public API that the route file binds to.
// ─────────────────────────────────────────────────────────────

async function list(
  business,
  { page = 1, limit = 30, status, campaign_type } = {},
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.list(client, {
      status,
      campaign_type,
      limit: parseInt(limit),
      offset,
    });
    return { data: rows };
  });
}

async function create(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const campaign = await repo.insert(client, {
      campaign_name: data.campaign_name,
      campaign_type: data.campaign_type,
      subject_line: data.subject_line,
      from_name: data.from_name,
      html_content: data.html_content,
      audience_filter: data.audience_filter,
      userId: user.user_id,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "campaigns",
      action: "create",
      table: "campaigns",
      recordId: campaign.campaign_id,
      after: campaign,
    });

    return campaign;
  });
}

async function getById(business, campaignId) {
  return withBusinessContext(business, async (client) => {
    const campaign = await repo.findById(client, campaignId);
    if (!campaign)
      throw Object.assign(new Error("Campaign not found"), { status: 404 });
    return campaign;
  });
}

async function update(business, campaignId, data, user) {
  return withBusinessContext(business, async (client) => {
    const c = await repo.findStatusById(client, campaignId);
    if (!c) throw Object.assign(new Error("Not found"), { status: 404 });
    if (!["draft"].includes(c.status)) {
      throw Object.assign(new Error("Only draft campaigns can be edited"), {
        status: 400,
      });
    }

    const allowed = [
      "campaign_name",
      "subject_line",
      "from_name",
      "html_content",
      "audience_filter",
    ];
    const sets = [],
      vals = [];
    for (const f of allowed) {
      if (data[f] !== undefined) {
        vals.push(f === "audience_filter" ? JSON.stringify(data[f]) : data[f]);
        sets.push(`${f} = $${vals.length}`);
      }
    }
    if (!sets.length)
      throw Object.assign(new Error("Nothing to update"), { status: 400 });
    vals.push(campaignId);

    return repo.update(client, campaignId, sets, vals);
  });
}

// ─── AUDIENCE (delegated to builder) ──────────────────────────

async function previewAudience(business, filter, channelType) {
  return builder.previewAudience(business, filter, channelType);
}

async function buildAudience(business, campaignId) {
  return builder.buildAudience(business, campaignId);
}

// Saved segments — reusable named audience filters.
async function listSegments(business) {
  return builder.listSegments(business);
}

async function getSegment(business, segmentId) {
  return builder.getSegment(business, segmentId);
}

async function saveSegment(business, data, user) {
  return builder.saveSegment(business, data, user);
}

async function deleteSegment(business, segmentId) {
  return builder.deleteSegment(business, segmentId);
}

async function previewSegment(business, segmentId, channelType) {
  return builder.previewSegment(business, segmentId, channelType);
}

async function buildAudienceFromSegment(business, campaignId, segmentId) {
  return builder.buildAudienceFromSegment(business, campaignId, segmentId);
}

// ─── SCHEDULING (delegated to scheduler) ──────────────────────

async function schedule(business, campaignId, scheduledAt, user) {
  return scheduler.schedule(business, campaignId, scheduledAt, user);
}

async function sendNow(business, campaignId, user) {
  return scheduler.sendNow(business, campaignId, user);
}

async function cancel(business, campaignId, user) {
  return scheduler.cancel(business, campaignId, user);
}

// ─── TRACKING (delegated to tracking) ─────────────────────────

async function trackEvent(token, eventType, metadata) {
  return tracking.recordEvent(token, eventType, metadata);
}

async function handlePixelOpen(token, metadata) {
  return tracking.handlePixelOpen(token, metadata);
}

async function handleClick(token, targetUrl, metadata) {
  return tracking.handleClick(token, targetUrl, metadata);
}

async function handleUnsubscribe(token, metadata) {
  return tracking.handleUnsubscribe(token, metadata);
}

async function getStats(business, campaignId) {
  return tracking.getCampaignStats(business, campaignId);
}

async function getRecipientActivity(business, campaignId, opts) {
  return tracking.getRecipientActivity(business, campaignId, opts);
}

async function getFollowUpSuggestions(business, campaignId) {
  return tracking.getFollowUpSuggestions(business, campaignId);
}

async function getAbTestResults(business, parentCampaignId) {
  return tracking.getAbTestResults(business, parentCampaignId);
}

async function createVariant(business, parentCampaignId, variantData, user) {
  return tracking.createVariant(business, parentCampaignId, variantData, user);
}

module.exports = {
  list,
  create,
  getById,
  update,
  // audience
  previewAudience,
  buildAudience,
  // saved segments
  listSegments,
  getSegment,
  saveSegment,
  deleteSegment,
  previewSegment,
  buildAudienceFromSegment,
  // scheduling
  schedule,
  sendNow,
  cancel,
  // tracking
  trackEvent,
  handlePixelOpen,
  handleClick,
  handleUnsubscribe,
  getStats,
  getRecipientActivity,
  getFollowUpSuggestions,
  getAbTestResults,
  createVariant,
};
