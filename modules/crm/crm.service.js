"use strict";

const { withBusinessContext } = require("../../config/db");
const auditService = require("../../shared/audit/audit.service");
const notifService = require("../../shared/notifications/notifications.service");
const { emitToBusiness } = require("../../config/sockets");
const repo = require("./crm.repository");

async function listDeals(
  business,
  { page = 1, limit = 50, stage, assignedTo, contactId } = {},
  user,
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.listDeals(client, {
      stage,
      assignedTo,
      contactId,
      limit: parseInt(limit),
      offset,
    });
    return { data: rows };
  });
}

async function createDeal(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const deal = await repo.insertDeal(client, {
      contact_id: data.contact_id,
      assigned_to: data.assigned_to || user.user_id,
      title: data.title,
      stage: data.stage,
      expected_value: data.expected_value,
      probability: data.probability,
      expected_close_date: data.expected_close_date,
      source: data.source,
    });

    await logActivity(
      business,
      deal.deal_id,
      { activity_type: "note", summary: `Deal created: ${data.title}` },
      user,
      client,
    );

    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "crm",
      action: "create",
      table: "crm_deals",
      recordId: deal.deal_id,
      after: deal,
    });

    emitToBusiness(business, "crm:deal_created", {
      dealId: deal.deal_id,
      stage: deal.stage,
    });
    return deal;
  });
}

async function getDeal(business, dealId) {
  return withBusinessContext(business, async (client) => {
    const deal = await repo.findDealById(client, dealId);
    if (!deal)
      throw Object.assign(new Error("Deal not found"), { status: 404 });
    return deal;
  });
}

async function updateDeal(business, dealId, data, user) {
  return withBusinessContext(business, async (client) => {
    const allowed = [
      "title",
      "expected_value",
      "probability",
      "expected_close_date",
      "source",
      "assigned_to",
      "lost_reason",
      "is_deleted",
    ];
    const sets = [],
      vals = [];
    for (const f of allowed) {
      if (data[f] !== undefined) {
        vals.push(data[f]);
        sets.push(`${f} = $${vals.length}`);
      }
    }
    if (!sets.length)
      throw Object.assign(new Error("Nothing to update"), { status: 400 });
    vals.push(dealId);
    return repo.updateDeal(client, dealId, sets, vals);
  });
}

async function moveDealStage(business, dealId, newStage, user) {
  return withBusinessContext(business, async (client) => {
    const old = await repo.getDealStage(client, dealId);
    const deal = await repo.moveDealStage(client, dealId, newStage);
    if (!deal)
      throw Object.assign(new Error("Deal not found"), { status: 404 });

    await logActivity(
      business,
      dealId,
      {
        activity_type: "stage_change",
        summary: `Stage moved from "${old?.stage}" to "${newStage}"`,
        is_auto: true,
      },
      user,
      client,
    );

    emitToBusiness(business, "crm:stage_moved", {
      dealId,
      from: old?.stage,
      to: newStage,
    });
    return deal;
  });
}

async function logActivity(business, dealId, data, user, existingClient) {
  const run = async (client) =>
    repo.insertActivity(client, {
      dealId,
      activity_type: data.activity_type,
      summary: data.summary,
      direction: data.direction,
      userId: user?.user_id,
      is_auto: data.is_auto,
    });

  if (existingClient) return run(existingClient);
  return withBusinessContext(business, run);
}

async function getPipeline(business, user, scope) {
  return withBusinessContext(business, async (client) => {
    const stages = await repo.getPipelineStages(client, business);
    const deals = await repo.getPipelineDeals(client, {
      scope,
      userId: user.user_id,
    });

    const pipeline = stages.map((s) => ({
      ...s,
      deals: deals.filter((d) => d.stage === s.stage_key),
      total_value: deals
        .filter((d) => d.stage === s.stage_key)
        .reduce((sum, d) => sum + parseFloat(d.expected_value || 0), 0),
    }));

    return { pipeline };
  });
}

async function getNotes(business, dealId) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.getNotes(client, dealId);
    return { data: rows };
  });
}

async function addNote(business, dealId, { content, is_pinned = false }, user) {
  return withBusinessContext(business, async (client) => {
    const contactId = await repo.getDealContactId(client, dealId);
    return repo.insertNote(client, {
      dealId,
      contactId,
      content,
      is_pinned,
      userId: user.user_id,
    });
  });
}

// ─────────────────────────────────────────────────────────────
// CUSTOMER PREFERENCES
//
// A per-contact key/value store the sales team fills in over time:
// ring sizes, metal preferences, scent profiles, allergies, budget
// bands. Each brand defines its own preference vocabulary — the
// key/value design means jewelry and diffuser brands store totally
// different facts in the same table.
// ─────────────────────────────────────────────────────────────

async function listPreferences(business, contactId) {
  return withBusinessContext(business, async (client) => {
    const data = await repo.listPreferences(client, contactId);
    return { data };
  });
}

/**
 * Set a preference. If the key already exists for this contact it's
 * updated in place (a contact has one value per key) — so the same
 * endpoint handles "add ring size" and "change ring size".
 */
async function setPreference(business, contactId, data, user) {
  if (!data.preference_key || data.preference_value == null) {
    throw Object.assign(
      new Error("preference_key and preference_value are required"),
      { status: 400 },
    );
  }
  return withBusinessContext(business, async (client) => {
    const existing = await repo.findPreferenceByKey(
      client,
      contactId,
      data.preference_key,
    );
    let row;
    if (existing) {
      row = await repo.updatePreference(client, existing.preference_id, {
        preferenceValue: data.preference_value,
        notes: data.notes,
      });
    } else {
      row = await repo.insertPreference(client, {
        contactId,
        preferenceKey: data.preference_key,
        preferenceValue: data.preference_value,
        notes: data.notes,
        createdBy: user.user_id,
      });
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "crm",
      action: existing ? "edit" : "create",
      table: "customer_preferences",
      recordId: row.preference_id,
      after: row,
    });
    return row;
  });
}

async function updatePreference(business, preferenceId, data, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findPreferenceById(client, preferenceId);
    if (!before) {
      throw Object.assign(new Error("Preference not found"), { status: 404 });
    }
    const row = await repo.updatePreference(client, preferenceId, {
      preferenceValue: data.preference_value,
      notes: data.notes,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "crm",
      action: "edit",
      table: "customer_preferences",
      recordId: preferenceId,
      before,
      after: row,
    });
    return row;
  });
}

async function deletePreference(business, preferenceId, user) {
  return withBusinessContext(business, async (client) => {
    const removed = await repo.deletePreference(client, preferenceId);
    if (!removed) {
      throw Object.assign(new Error("Preference not found"), { status: 404 });
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "crm",
      action: "delete",
      table: "customer_preferences",
      recordId: preferenceId,
      before: removed,
    });
    return { deleted: true };
  });
}

// ─────────────────────────────────────────────────────────────
// CUSTOMER MILESTONES
//
// Dated events on a contact — birthday, wedding anniversary, etc.
// The sendMilestoneReminders cron reads this table 7 days ahead and
// notifies the assigned staff member. This module is the write side.
// ─────────────────────────────────────────────────────────────

const MILESTONE_TYPES = [
  "birthday",
  "wedding_anniversary",
  "business_anniversary",
  "graduation",
  "other",
];

async function listMilestones(business, contactId) {
  return withBusinessContext(business, async (client) => {
    const data = await repo.listMilestones(client, contactId);
    return { data };
  });
}

async function addMilestone(business, contactId, data, user) {
  if (!MILESTONE_TYPES.includes(data.milestone_type)) {
    throw Object.assign(
      new Error(`milestone_type must be one of: ${MILESTONE_TYPES.join(", ")}`),
      { status: 400 },
    );
  }
  if (!data.milestone_date) {
    throw Object.assign(new Error("milestone_date is required"), {
      status: 400,
    });
  }
  return withBusinessContext(business, async (client) => {
    const row = await repo.insertMilestone(client, {
      contactId,
      milestoneType: data.milestone_type,
      milestoneDate: data.milestone_date,
      notes: data.notes,
      createdBy: user.user_id,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "crm",
      action: "create",
      table: "customer_milestones",
      recordId: row.milestone_id,
      after: row,
    });
    return row;
  });
}

async function updateMilestone(business, milestoneId, data, user) {
  if (data.milestone_type && !MILESTONE_TYPES.includes(data.milestone_type)) {
    throw Object.assign(
      new Error(`milestone_type must be one of: ${MILESTONE_TYPES.join(", ")}`),
      { status: 400 },
    );
  }
  return withBusinessContext(business, async (client) => {
    const before = await repo.findMilestoneById(client, milestoneId);
    if (!before) {
      throw Object.assign(new Error("Milestone not found"), { status: 404 });
    }
    const row = await repo.updateMilestone(client, milestoneId, {
      milestoneType: data.milestone_type,
      milestoneDate: data.milestone_date,
      notes: data.notes,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "crm",
      action: "edit",
      table: "customer_milestones",
      recordId: milestoneId,
      before,
      after: row,
    });
    return row;
  });
}

async function deleteMilestone(business, milestoneId, user) {
  return withBusinessContext(business, async (client) => {
    const removed = await repo.deleteMilestone(client, milestoneId);
    if (!removed) {
      throw Object.assign(new Error("Milestone not found"), { status: 404 });
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "crm",
      action: "delete",
      table: "customer_milestones",
      recordId: milestoneId,
      before: removed,
    });
    return { deleted: true };
  });
}

// ─────────────────────────────────────────────────────────────
// CONTACT TAGS
//
// Free-form labels on a contact (VIP, Wholesale, Slow-payer). Live
// in the shared schema with a business column so the same contact
// can carry different tags per brand.
// ─────────────────────────────────────────────────────────────

async function listTags(business, contactId) {
  return withBusinessContext(business, async (client) => {
    const data = await repo.listTags(client, contactId, business);
    return { data };
  });
}

async function addTag(business, contactId, data, user) {
  if (!data.tag_name || !data.tag_name.trim()) {
    throw Object.assign(new Error("tag_name is required"), { status: 400 });
  }
  const tagName = data.tag_name.trim();
  return withBusinessContext(business, async (client) => {
    // Reject duplicate tags on the same contact (case-insensitive) —
    // "VIP" and "vip" shouldn't both stick.
    const existing = await repo.findTagByName(
      client,
      contactId,
      business,
      tagName,
    );
    if (existing) {
      throw Object.assign(
        new Error(`Contact is already tagged "${existing.tag_name}"`),
        { status: 409 },
      );
    }
    const row = await repo.insertTag(client, {
      contactId,
      business,
      tagName,
      colour: data.colour,
      createdBy: user.user_id,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "crm",
      action: "create",
      table: "shared.contact_tags",
      recordId: row.tag_id,
      after: row,
    });
    return row;
  });
}

async function removeTag(business, tagId, user) {
  return withBusinessContext(business, async (client) => {
    const removed = await repo.deleteTag(client, tagId);
    if (!removed) {
      throw Object.assign(new Error("Tag not found"), { status: 404 });
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "crm",
      action: "delete",
      table: "shared.contact_tags",
      recordId: tagId,
      before: removed,
    });
    return { deleted: true };
  });
}

module.exports = {
  listDeals,
  createDeal,
  getDeal,
  updateDeal,
  moveDealStage,
  logActivity,
  getPipeline,
  getNotes,
  addNote,
  // preferences
  listPreferences,
  setPreference,
  updatePreference,
  deletePreference,
  // milestones
  listMilestones,
  addMilestone,
  updateMilestone,
  deleteMilestone,
  // tags
  listTags,
  addTag,
  removeTag,
};
