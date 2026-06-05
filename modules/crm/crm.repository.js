"use strict";

async function listDeals(
  client,
  { stage, assignedTo, contactId, limit, offset },
) {
  const { rows } = await client.query(
    `SELECT d.deal_id, d.title, d.stage, d.expected_value, d.probability,
            d.expected_close_date, d.source, d.created_at,
            c.display_name AS contact_name, c.contact_id,
            u.email AS assigned_to_email
     FROM crm_deals d
     JOIN shared.contacts c ON c.contact_id = d.contact_id
     LEFT JOIN shared.users u ON u.user_id = d.assigned_to
     WHERE d.is_deleted = false
       AND ($1::TEXT IS NULL OR d.stage = $1)
       AND ($2::UUID IS NULL OR d.assigned_to = $2)
       AND ($3::UUID IS NULL OR d.contact_id = $3)
     ORDER BY d.updated_at DESC
     LIMIT $4 OFFSET $5`,
    [stage || null, assignedTo || null, contactId || null, limit, offset],
  );
  return rows;
}

async function insertDeal(
  client,
  {
    contact_id,
    assigned_to,
    title,
    stage,
    expected_value,
    probability,
    expected_close_date,
    source,
  },
) {
  const {
    rows: [deal],
  } = await client.query(
    `INSERT INTO crm_deals
       (contact_id, assigned_to, title, stage, expected_value,
        probability, expected_close_date, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      contact_id,
      assigned_to,
      title,
      stage,
      expected_value || null,
      probability || 50,
      expected_close_date || null,
      source || null,
    ],
  );
  return deal;
}

async function findDealById(client, dealId) {
  const {
    rows: [deal],
  } = await client.query(
    `SELECT d.*,
            c.display_name AS contact_name, c.email, c.primary_phone,
            c.whatsapp_number, c.priority_level,
            u.email AS assigned_to_email,
            json_agg(DISTINCT da.*) FILTER (WHERE da.activity_id IS NOT NULL) AS activities,
            json_agg(DISTINCT dn.*) FILTER (WHERE dn.note_id    IS NOT NULL) AS notes
     FROM crm_deals d
     JOIN shared.contacts c ON c.contact_id = d.contact_id
     LEFT JOIN shared.users u ON u.user_id = d.assigned_to
     LEFT JOIN crm_activities da ON da.deal_id = d.deal_id
     LEFT JOIN crm_notes      dn ON dn.deal_id = d.deal_id
     WHERE d.deal_id = $1 AND d.is_deleted = false
     GROUP BY d.deal_id, c.display_name, c.email, c.primary_phone,
              c.whatsapp_number, c.priority_level, u.email`,
    [dealId],
  );
  return deal || null;
}

async function updateDeal(client, dealId, sets, vals) {
  const {
    rows: [deal],
  } = await client.query(
    `UPDATE crm_deals SET ${sets.join(", ")}, updated_at = now()
     WHERE deal_id = $${vals.length} AND is_deleted = false RETURNING *`,
    vals,
  );
  return deal || null;
}

async function getDealStage(client, dealId) {
  const {
    rows: [old],
  } = await client.query(`SELECT stage FROM crm_deals WHERE deal_id = $1`, [
    dealId,
  ]);
  return old || null;
}

async function moveDealStage(client, dealId, newStage) {
  const {
    rows: [deal],
  } = await client.query(
    `UPDATE crm_deals
     SET stage = $1,
         won_at  = CASE WHEN $1 = 'completed' OR $1 = 'delivered' THEN now() ELSE won_at END,
         lost_at = CASE WHEN $1 = 'lost'                          THEN now() ELSE lost_at END,
         updated_at = now()
     WHERE deal_id = $2 AND is_deleted = false RETURNING *`,
    [newStage, dealId],
  );
  return deal || null;
}

async function insertActivity(
  client,
  { dealId, activity_type, summary, direction, userId, is_auto },
) {
  const {
    rows: [activity],
  } = await client.query(
    `INSERT INTO crm_activities
       (deal_id, contact_id, activity_type, summary, direction, performed_by, is_auto)
     SELECT $1, d.contact_id, $2, $3, $4, $5, $6 FROM crm_deals d WHERE d.deal_id = $1
     RETURNING *`,
    [
      dealId,
      activity_type,
      summary,
      direction || null,
      userId || null,
      is_auto || false,
    ],
  );
  return activity;
}

async function getPipelineStages(client, business) {
  const { rows } = await client.query(
    `SELECT stage_key, stage_label, colour, display_order, is_terminal
     FROM shared.pipeline_stage_defs
     WHERE business = $1 AND pipeline_type = 'crm'
     ORDER BY display_order`,
    [business],
  );
  return rows;
}

async function getPipelineDeals(client, { scope, userId }) {
  const { rows } = await client.query(
    `SELECT d.deal_id, d.title, d.stage, d.expected_value, d.probability,
            d.expected_close_date, d.updated_at,
            c.display_name AS contact_name, c.priority_level
     FROM crm_deals d
     JOIN shared.contacts c ON c.contact_id = d.contact_id
     WHERE d.is_deleted = false
       AND d.stage NOT IN ('completed','delivered','won','lost')
       AND ($1 = 'all' OR d.assigned_to = $2)
     ORDER BY d.updated_at DESC`,
    [scope, userId],
  );
  return rows;
}

async function getNotes(client, dealId) {
  const { rows } = await client.query(
    `SELECT n.*, u.email AS created_by_email
     FROM crm_notes n
     LEFT JOIN shared.users u ON u.user_id = n.created_by
     WHERE n.deal_id = $1
     ORDER BY n.is_pinned DESC, n.created_at DESC`,
    [dealId],
  );
  return rows;
}

async function getDealContactId(client, dealId) {
  const {
    rows: [deal],
  } = await client.query(
    `SELECT contact_id FROM crm_deals WHERE deal_id = $1`,
    [dealId],
  );
  return deal?.contact_id || null;
}

async function insertNote(
  client,
  { dealId, contactId, content, is_pinned, userId },
) {
  const {
    rows: [note],
  } = await client.query(
    `INSERT INTO crm_notes (deal_id, contact_id, content, is_pinned, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [dealId, contactId, content, is_pinned, userId],
  );
  return note;
}

// ── CUSTOMER PREFERENCES ─────────────────────────────────────
// Per-business key/value store attached to a contact. Holds the
// facts the sales team learns over time — ring sizes, metal
// preferences, scent profiles, allergies, budget bands.

async function listPreferences(client, contactId) {
  const { rows } = await client.query(
    `SELECT preference_id, contact_id, preference_key, preference_value,
            notes, created_by, created_at, updated_at
     FROM customer_preferences
     WHERE contact_id = $1
     ORDER BY preference_key`,
    [contactId],
  );
  return rows;
}

async function findPreferenceById(client, preferenceId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM customer_preferences WHERE preference_id = $1`,
    [preferenceId],
  );
  return row || null;
}

async function findPreferenceByKey(client, contactId, key) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM customer_preferences
     WHERE contact_id = $1 AND preference_key = $2`,
    [contactId, key],
  );
  return row || null;
}

async function insertPreference(
  client,
  { contactId, preferenceKey, preferenceValue, notes, createdBy },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO customer_preferences
       (contact_id, preference_key, preference_value, notes, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      contactId,
      preferenceKey,
      preferenceValue,
      notes || null,
      createdBy || null,
    ],
  );
  return row;
}

async function updatePreference(
  client,
  preferenceId,
  { preferenceValue, notes },
) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE customer_preferences SET
       preference_value = COALESCE($2, preference_value),
       notes            = COALESCE($3, notes),
       updated_at       = now()
     WHERE preference_id = $1
     RETURNING *`,
    [preferenceId, preferenceValue ?? null, notes ?? null],
  );
  return row || null;
}

async function deletePreference(client, preferenceId) {
  const {
    rows: [row],
  } = await client.query(
    `DELETE FROM customer_preferences WHERE preference_id = $1
     RETURNING preference_id, contact_id`,
    [preferenceId],
  );
  return row || null;
}

// Delete by (contact_id, preference_key) — the concierge UI deletes by key
// rather than by preference_id.
async function deletePreferenceByKey(client, contactId, key) {
  const {
    rows: [row],
  } = await client.query(
    `DELETE FROM customer_preferences
     WHERE contact_id = $1 AND preference_key = $2
     RETURNING preference_id, contact_id, preference_key`,
    [contactId, key],
  );
  return row || null;
}

// ── CUSTOMER MILESTONES ──────────────────────────────────────
// Per-business dated events on a contact (birthday, anniversary).
// The sendMilestoneReminders cron READS this table — this module
// is the WRITE side it was always missing.

async function listMilestones(client, contactId) {
  const { rows } = await client.query(
    `SELECT milestone_id, contact_id, milestone_type, milestone_date,
            notes, created_by, created_at
     FROM customer_milestones
     WHERE contact_id = $1
     ORDER BY milestone_date`,
    [contactId],
  );
  return rows;
}

async function findMilestoneById(client, milestoneId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM customer_milestones WHERE milestone_id = $1`,
    [milestoneId],
  );
  return row || null;
}

async function insertMilestone(
  client,
  { contactId, milestoneType, milestoneDate, notes, createdBy },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO customer_milestones
       (contact_id, milestone_type, milestone_date, notes, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [contactId, milestoneType, milestoneDate, notes || null, createdBy || null],
  );
  return row;
}

async function updateMilestone(
  client,
  milestoneId,
  { milestoneType, milestoneDate, notes },
) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE customer_milestones SET
       milestone_type = COALESCE($2, milestone_type),
       milestone_date = COALESCE($3, milestone_date),
       notes          = COALESCE($4, notes)
     WHERE milestone_id = $1
     RETURNING *`,
    [milestoneId, milestoneType ?? null, milestoneDate ?? null, notes ?? null],
  );
  return row || null;
}

async function deleteMilestone(client, milestoneId) {
  const {
    rows: [row],
  } = await client.query(
    `DELETE FROM customer_milestones WHERE milestone_id = $1
     RETURNING milestone_id, contact_id`,
    [milestoneId],
  );
  return row || null;
}

// ── CONTACT TAGS ─────────────────────────────────────────────
// shared.contact_tags — lives in the shared schema with a business
// column (a contact can be tagged differently per business).

async function listTags(client, contactId, business) {
  const { rows } = await client.query(
    `SELECT tag_id, contact_id, tag_name, business, colour,
            created_by, created_at
     FROM shared.contact_tags
     WHERE contact_id = $1 AND business = $2
     ORDER BY tag_name`,
    [contactId, business],
  );
  return rows;
}

async function findTagByName(client, contactId, business, tagName) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.contact_tags
     WHERE contact_id = $1 AND business = $2 AND lower(tag_name) = lower($3)`,
    [contactId, business, tagName],
  );
  return row || null;
}

async function insertTag(
  client,
  { contactId, business, tagName, colour, createdBy },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.contact_tags
       (contact_id, business, tag_name, colour, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [contactId, business, tagName, colour || "#64748B", createdBy || null],
  );
  return row;
}

async function deleteTag(client, tagId) {
  const {
    rows: [row],
  } = await client.query(
    `DELETE FROM shared.contact_tags WHERE tag_id = $1
     RETURNING tag_id, contact_id, tag_name`,
    [tagId],
  );
  return row || null;
}

module.exports = {
  listDeals,
  insertDeal,
  findDealById,
  updateDeal,
  getDealStage,
  moveDealStage,
  insertActivity,
  getPipelineStages,
  getPipelineDeals,
  getNotes,
  getDealContactId,
  insertNote,
  // preferences
  listPreferences,
  findPreferenceById,
  findPreferenceByKey,
  insertPreference,
  updatePreference,
  deletePreference,
  deletePreferenceByKey,
  // milestones
  listMilestones,
  findMilestoneById,
  insertMilestone,
  updateMilestone,
  deleteMilestone,
  // tags
  listTags,
  findTagByName,
  insertTag,
  deleteTag,
};
