"use strict";

const { withBusinessContext } = require("../../config/db");
const repo = require("./clients.repository");
const crmRepo = require("./crm.repository");

// ─────────────────────────────────────────────────────────────
// CRM CLIENTS SERVICE
//
// The clients-first workspace: searchable client list with
// computed segments, the "Today" work feed for salespeople, and
// the client 360 profile (spend, insights, loyalty, preferences,
// milestones, deals) — everything scoped to the active business.
// ─────────────────────────────────────────────────────────────

async function listClients(business, query = {}) {
  return withBusinessContext(business, async (client) => {
    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 30, 100);
    const offset = (page - 1) * limit;
    const params = {
      business,
      search: query.search || null,
      segment: query.segment || null,
      sort: query.sort || "recent",
      limit,
      offset,
    };
    const [data, total] = await Promise.all([
      repo.listClients(client, params),
      repo.countClients(client, params),
    ]);
    return { data, pagination: { page, limit, total } };
  });
}

/**
 * The daily work feed. Every block is a reason for a salesperson
 * to pick up the phone: birthdays/anniversaries coming up, fresh
 * customers to welcome (from every source — walk-in, website,
 * campaigns), valuable clients gone quiet, this month's top
 * spenders, quiet B2B deals and overdue invoices to chase.
 */
async function getToday(business) {
  return withBusinessContext(business, async (client) => {
    const [birthdays, milestones, welcome, lapsed, topMonth, followUps] =
      await Promise.all([
        repo.getUpcomingBirthdays(client, business),
        repo.getUpcomingMilestones(client),
        repo.getClientsToWelcome(client, business),
        repo.getLapsedClients(client, business),
        repo.getTopClientsThisMonth(client),
        repo.getFollowUps(client),
      ]);
    return {
      birthdays,
      milestones,
      to_welcome: welcome,
      lapsed,
      top_this_month: topMonth,
      stale_deals: followUps.stale_deals,
      overdue_invoices: followUps.overdue_invoices,
    };
  });
}

/**
 * Client 360 for the current business: core identity + spend,
 * computed insights, loyalty, preferences, milestones, tags and
 * open deals — one call powers the whole profile header.
 */
async function getClient(business, contactId) {
  return withBusinessContext(business, async (client) => {
    const core = await repo.findClientCore(client, business, contactId);
    if (!core) {
      throw Object.assign(new Error("Client not found"), { status: 404 });
    }

    const [cadence, topCategories, balance, preferences, milestones, tags] =
      await Promise.all([
        repo.getPurchaseCadenceDays(client, contactId),
        repo.getTopCategories(client, contactId),
        repo.getOpenBalance(client, contactId),
        crmRepo.listPreferences(client, contactId),
        crmRepo.listMilestones(client, contactId),
        crmRepo.listTags(client, contactId, business),
      ]);

    const { rows: deals } = await client.query(
      `SELECT d.deal_id, d.title, d.stage, d.expected_value,
              d.expected_close_date, d.created_at, sd.is_terminal
       FROM crm_deals d
       LEFT JOIN shared.pipeline_stage_defs sd
         ON sd.stage_key = d.stage AND sd.pipeline_type = 'crm'
        AND sd.business = $2
       WHERE d.contact_id = $1 AND d.is_deleted = false
       ORDER BY (sd.is_terminal IS NOT TRUE) DESC, d.updated_at DESC
       LIMIT 20`,
      [contactId, business],
    );

    const purchaseCount = core.purchase_count || 0;
    const totalSpend = parseFloat(core.total_spend) || 0;
    const daysSince = core.last_purchase_at
      ? Math.floor(
          (Date.now() - new Date(core.last_purchase_at).getTime()) / 86400000,
        )
      : null;

    return {
      ...core,
      deals,
      preferences,
      milestones,
      tags,
      insights: {
        avg_basket: purchaseCount ? totalSpend / purchaseCount : null,
        purchase_cadence_days: cadence,
        days_since_last_purchase: daysSince,
        // "Due for a visit": they buy on a rhythm and they're 50%
        // past it. Needs ≥3 purchases for the rhythm to mean much.
        due_for_visit:
          purchaseCount >= 3 && cadence != null && daysSince != null
            ? daysSince > cadence * 1.5
            : false,
        top_categories: topCategories,
        open_balance: parseFloat(balance.open_balance) || 0,
        overdue_invoices: balance.overdue_invoices || 0,
      },
    };
  });
}

async function listPurchases(business, contactId, query = {}) {
  return withBusinessContext(business, async (client) => {
    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 25, 100);
    const data = await repo.listPurchases(client, contactId, {
      limit,
      offset: (page - 1) * limit,
    });
    return { data, pagination: { page, limit } };
  });
}

async function listNotes(business, contactId) {
  return withBusinessContext(business, (client) =>
    repo.listClientNotes(client, contactId),
  );
}

async function addNote(business, contactId, data, user) {
  return withBusinessContext(business, (client) =>
    repo.insertClientNote(client, contactId, {
      content: data.content,
      is_pinned: data.is_pinned,
      userId: user.user_id,
    }),
  );
}

async function getSettings(business) {
  return withBusinessContext(business, (client) => repo.getSettings(client));
}

async function updateSettings(business, fields, user) {
  return withBusinessContext(business, (client) =>
    repo.updateSettings(client, fields, user.user_id),
  );
}

module.exports = {
  listClients,
  getToday,
  getClient,
  listPurchases,
  listNotes,
  addNote,
  getSettings,
  updateSettings,
};
