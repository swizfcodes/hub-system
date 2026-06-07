"use strict";

// ─────────────────────────────────────────────────────────────
// CALENDAR REPOSITORY
//
// Single table: shared.calendar_events. The schema supports:
//   - title, event_type, start_at, end_at, all_day
//   - location, description
//   - recurrence_rule (RFC 5545 RRULE text — handled at the
//     service / expander layer, not in SQL)
//   - reference_type, reference_id  — link to source record
//     (e.g. crm_deal, sales_order, customer)
//   - created_by, soft delete via is_deleted
// ─────────────────────────────────────────────────────────────

async function listInRange(
  client,
  { business, startAt, endAt, eventType, createdBy },
) {
  const { rows } = await client.query(
    `SELECT e.event_id, e.business, e.title, e.event_type,
            e.start_at, e.end_at, e.all_day, e.location, e.description,
            e.recurrence_rule, e.reference_type, e.reference_id,
            e.created_by, e.created_at,
            created_by_contact.display_name AS created_by_name
     FROM shared.calendar_events e
     LEFT JOIN shared.users u ON u.user_id = e.created_by
     LEFT JOIN shared.staff_profiles sp ON sp.profile_id = u.staff_profile_id
     LEFT JOIN shared.contacts created_by_contact
       ON created_by_contact.contact_id = sp.contact_id
     WHERE e.is_deleted = false
       AND ($1::TEXT IS NULL OR e.business = $1)
       AND ($2::TEXT IS NULL OR e.event_type = $2)
       AND ($3::UUID IS NULL OR e.created_by = $3)
       AND e.start_at < $5
       AND e.end_at >= $4
     ORDER BY e.start_at ASC`,
    [business || null, eventType || null, createdBy || null, startAt, endAt],
  );
  return rows;
}

async function findById(client, eventId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT e.*, created_by_contact.display_name AS created_by_name
     FROM shared.calendar_events e
     LEFT JOIN shared.users u ON u.user_id = e.created_by
     LEFT JOIN shared.staff_profiles sp ON sp.profile_id = u.staff_profile_id
     LEFT JOIN shared.contacts created_by_contact
       ON created_by_contact.contact_id = sp.contact_id
     WHERE e.event_id = $1 AND e.is_deleted = false`,
    [eventId],
  );
  return row || null;
}

async function insert(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.calendar_events
       (business, title, event_type, start_at, end_at, all_day,
        location, description, recurrence_rule,
        reference_type, reference_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      data.business,
      data.title,
      data.event_type,
      data.start_at,
      data.end_at,
      data.all_day || false,
      data.location || null,
      data.description || null,
      data.recurrence_rule || null,
      data.reference_type || null,
      data.reference_id || null,
      data.created_by,
    ],
  );
  return row;
}

async function update(client, eventId, fields) {
  const allowed = [
    "title",
    "event_type",
    "start_at",
    "end_at",
    "all_day",
    "location",
    "description",
    "recurrence_rule",
    "reference_type",
    "reference_id",
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = $${i++}`);
    values.push(fields[key]);
  }
  if (!sets.length) return findById(client, eventId);
  sets.push(`updated_at = now()`);
  values.push(eventId);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.calendar_events
     SET ${sets.join(", ")}
     WHERE event_id = $${i} AND is_deleted = false
     RETURNING *`,
    values,
  );
  return row || null;
}

async function softDelete(client, eventId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.calendar_events
     SET is_deleted = true, updated_at = now()
     WHERE event_id = $1 AND is_deleted = false
     RETURNING event_id, is_deleted`,
    [eventId],
  );
  return row || null;
}

/**
 * Find events overlapping a [startAt, endAt) window for a given resource
 * (location). Used by clash detection — Module 15 promises "the system
 * warns you if there is a clash" when booking a meeting room.
 */
async function findClashing(
  client,
  { business, location, startAt, endAt, excludeEventId },
) {
  const { rows } = await client.query(
    `SELECT event_id, title, start_at, end_at, location
     FROM shared.calendar_events
     WHERE is_deleted = false
       AND business = $1
       AND location = $2
       AND start_at < $4
       AND end_at > $3
       AND ($5::UUID IS NULL OR event_id <> $5)
     ORDER BY start_at ASC`,
    [business, location, startAt, endAt, excludeEventId || null],
  );
  return rows;
}

/**
 * Events for a specific reference (e.g. "show me all events linked to
 * this CRM deal" or "all events for this contact"). Drives the
 * activity-timeline view from the product description.
 */
async function listForReference(client, { referenceType, referenceId }) {
  const { rows } = await client.query(
    `SELECT event_id, title, event_type, start_at, end_at, all_day,
            location, created_at
     FROM shared.calendar_events
     WHERE is_deleted = false
       AND reference_type = $1
       AND reference_id = $2
     ORDER BY start_at DESC`,
    [referenceType, referenceId],
  );
  return rows;
}

module.exports = {
  listInRange,
  findById,
  insert,
  update,
  softDelete,
  findClashing,
  listForReference,
};
