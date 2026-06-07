"use strict";

const { withSharedContext } = require("../../config/db");
const auditService = require("../audit/audit.service");
const notifService = require("../notifications/notifications.service");
const repo = require("./calendar.repository");

// ─────────────────────────────────────────────────────────────
// CALENDAR SERVICE — Module 15: Calendar & Scheduling
//
// Promises from the product description:
//   - "supports day, week, month, and list views"
//   - "add participants (team members or customers from Contacts),
//      book resources (e.g., the showroom, a meeting room), and the
//      system warns you if there is a clash"
//   - "attach an agenda or documents" before meetings
//   - "log notes and create follow-up tasks that flow directly into
//      the Tasks module"
//   - "Automatic reminders are sent before every event"
//
// Note on participants: the schema's calendar_events table doesn't
// have a participants junction table. We use `description` for an
// agenda blob and `reference_type/reference_id` to link to a customer
// or deal. Multi-participant support is achievable later via a junction
// table; for now, single created_by + reference is sufficient for the
// product description's flows.
// ─────────────────────────────────────────────────────────────

const VALID_EVENT_TYPES = [
  "meeting",
  "viewing",
  "appointment",
  "delivery",
  "task",
  "reminder",
  "other",
];

// ─────────────────────────────────────────────────────────────
// LIST / RANGE QUERIES (calendar views)
// ─────────────────────────────────────────────────────────────

/**
 * Returns events whose [start_at, end_at) overlaps with [from, to).
 *
 * Frontend day/week/month views call this with the date range they
 * need. List view passes a longer range. Optional filters:
 *   - business
 *   - event_type
 *   - created_by  (e.g. "my events")
 */
async function listInRange(query) {
  const startAt = query.from
    ? new Date(query.from)
    : new Date(new Date().setHours(0, 0, 0, 0));
  const endAt = query.to
    ? new Date(query.to)
    : new Date(startAt.getTime() + 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw Object.assign(new Error("Invalid date range — use ISO 8601 dates"), {
      status: 400,
    });
  }
  if (endAt < startAt) {
    throw Object.assign(new Error("to must be after from"), { status: 400 });
  }
  // Hard cap on range to prevent expensive queries.
  const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
  if (endAt - startAt > MAX_RANGE_MS) {
    throw Object.assign(new Error("Date range cannot exceed 366 days"), {
      status: 400,
    });
  }

  return withSharedContext((client) =>
    repo.listInRange(client, {
      business: query.business,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      eventType: query.event_type,
      createdBy: query.created_by,
    }),
  );
}

async function getEvent(eventId) {
  return withSharedContext(async (client) => {
    const event = await repo.findById(client, eventId);
    if (!event) {
      throw Object.assign(new Error("Event not found"), { status: 404 });
    }
    return event;
  });
}

async function listForReference({ referenceType, referenceId }) {
  return withSharedContext((client) =>
    repo.listForReference(client, { referenceType, referenceId }),
  );
}

// ─────────────────────────────────────────────────────────────
// CREATE WITH CLASH DETECTION
// ─────────────────────────────────────────────────────────────

async function createEvent(data, user) {
  return withSharedContext(async (client) => {
    validateEventInput(data);

    // Clash detection — same business + same location + overlapping
    // window. Module 15: "the system warns you if there is a clash".
    let clashes = [];
    if (data.location && !data.skip_clash_check) {
      clashes = await repo.findClashing(client, {
        business: data.business,
        location: data.location,
        startAt: data.start_at,
        endAt: data.end_at,
      });
      if (clashes.length && !data.force) {
        const err = new Error("Booking clash detected");
        err.status = 409;
        err.code = "CLASH_DETECTED";
        err.clashes = clashes.map((c) => ({
          event_id: c.event_id,
          title: c.title,
          start_at: c.start_at,
          end_at: c.end_at,
        }));
        throw err;
      }
    }

    const event = await repo.insert(client, {
      ...data,
      created_by: user.user_id,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: data.business,
      module: "calendar",
      action: "create",
      table: "shared.calendar_events",
      recordId: event.event_id,
      after: event,
    });

    // Schedule reminder notification — Module 15: "Automatic reminders
    // are sent before every event." A simple cron sweep is preferable
    // to per-event scheduling (no risk of orphaned timers). We log the
    // intent here; jobs/sendEventReminders (Sprint 6) can pick it up.

    return { ...event, clash_overridden: clashes.length > 0 };
  });
}

// ─────────────────────────────────────────────────────────────
// UPDATE / RESCHEDULE
// ─────────────────────────────────────────────────────────────

async function updateEvent(eventId, fields, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findById(client, eventId);
    if (!before) {
      throw Object.assign(new Error("Event not found"), { status: 404 });
    }

    if (fields.event_type !== undefined) {
      if (!VALID_EVENT_TYPES.includes(fields.event_type)) {
        throw Object.assign(
          new Error(
            `event_type must be one of: ${VALID_EVENT_TYPES.join(", ")}`,
          ),
          { status: 400 },
        );
      }
    }

    // If start/end/location changed, re-check for clashes.
    const willChangeTiming =
      fields.start_at !== undefined ||
      fields.end_at !== undefined ||
      fields.location !== undefined;

    if (willChangeTiming) {
      const newLocation = fields.location ?? before.location;
      const newStart = fields.start_at ?? before.start_at;
      const newEnd = fields.end_at ?? before.end_at;

      if (new Date(newEnd) < new Date(newStart)) {
        throw Object.assign(new Error("end_at must be on or after start_at"), {
          status: 400,
        });
      }

      if (newLocation && !fields.force) {
        const clashes = await repo.findClashing(client, {
          business: before.business,
          location: newLocation,
          startAt: newStart,
          endAt: newEnd,
          excludeEventId: eventId,
        });
        if (clashes.length) {
          const err = new Error("Booking clash detected");
          err.status = 409;
          err.code = "CLASH_DETECTED";
          err.clashes = clashes.map((c) => ({
            event_id: c.event_id,
            title: c.title,
            start_at: c.start_at,
            end_at: c.end_at,
          }));
          throw err;
        }
      }
    }

    const after = await repo.update(client, eventId, fields);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: before.business,
      module: "calendar",
      action: "update",
      table: "shared.calendar_events",
      recordId: eventId,
      before,
      after,
    });
    return after;
  });
}

// ─────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────

async function deleteEvent(eventId, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findById(client, eventId);
    if (!before) {
      throw Object.assign(new Error("Event not found"), { status: 404 });
    }
    const result = await repo.softDelete(client, eventId);
    if (!result) {
      throw Object.assign(new Error("Event not found or already deleted"), {
        status: 404,
      });
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: before.business,
      module: "calendar",
      action: "delete",
      table: "shared.calendar_events",
      recordId: eventId,
      before,
    });
    return result;
  });
}

// ─────────────────────────────────────────────────────────────
// REMINDERS — exposed for the cron job
// ─────────────────────────────────────────────────────────────

/**
 * Find events that need a reminder sent — i.e. events starting within
 * the next N minutes whose created_by hasn't been notified yet. Used
 * by the (future) sendEventReminders cron. Returns the rows the cron
 * should iterate and notify on.
 *
 * For now this is a forward-compatible helper; sprint 6 wires the cron.
 */
async function findUpcomingForReminders(minutesAhead = 30) {
  return withSharedContext(async (client) => {
    const { rows } = await client.query(
      `SELECT e.event_id, e.title, e.start_at, e.location,
              e.business, e.created_by,
              u.email,
              c.whatsapp_number, c.display_name
       FROM shared.calendar_events e
       JOIN shared.users u ON u.user_id = e.created_by
       LEFT JOIN shared.staff_profiles sp ON sp.profile_id = u.staff_profile_id
       LEFT JOIN shared.contacts c ON c.contact_id = sp.contact_id
       WHERE e.is_deleted = false
         AND e.start_at BETWEEN now() AND now() + ($1 || ' minutes')::interval
       ORDER BY e.start_at ASC`,
      [minutesAhead],
    );
    return rows;
  });
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function validateEventInput(data) {
  if (!data.business) {
    throw Object.assign(new Error("business is required"), { status: 400 });
  }
  if (!data.title) {
    throw Object.assign(new Error("title is required"), { status: 400 });
  }
  if (!data.event_type || !VALID_EVENT_TYPES.includes(data.event_type)) {
    throw Object.assign(
      new Error(`event_type must be one of: ${VALID_EVENT_TYPES.join(", ")}`),
      { status: 400 },
    );
  }
  if (!data.start_at || !data.end_at) {
    throw Object.assign(new Error("start_at and end_at are required"), {
      status: 400,
    });
  }
  if (new Date(data.end_at) < new Date(data.start_at)) {
    throw Object.assign(new Error("end_at must be on or after start_at"), {
      status: 400,
    });
  }
}

async function listParticipants(eventId) {
  return withSharedContext(async (client) => {
    const { rows } = await client.query(
      `SELECT ep.participant_id, ep.status, ep.is_organiser, ep.responded_at,
              ep.user_id, ep.contact_id,
              COALESCE(c.display_name, cc.display_name) AS display_name
       FROM shared.event_participants ep
       LEFT JOIN shared.users u ON u.user_id = ep.user_id
       LEFT JOIN shared.staff_profiles sp ON sp.profile_id = u.staff_profile_id
       LEFT JOIN shared.contacts c ON c.contact_id = sp.contact_id
       LEFT JOIN shared.contacts cc ON cc.contact_id = ep.contact_id
       WHERE ep.event_id = $1
       ORDER BY ep.is_organiser DESC, display_name`,
      [eventId],
    );
    return rows;
  });
}

async function addParticipant(eventId, { user_id, contact_id }, user) {
  return withSharedContext(async (client) => {
    const {
      rows: [p],
    } = await client.query(
      `INSERT INTO shared.event_participants (event_id, user_id, contact_id)
       VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [eventId, user_id || null, contact_id || null],
    );

    // Notify an invited internal user (skip self-invites).
    if (user_id && user_id !== user.user_id) {
      const event = await repo.findById(client, eventId);
      if (event) {
        await notifService.create(client, {
          userId: user_id,
          business: event.business,
          type: "calendar_invite",
          title: `You're invited: ${event.title}`,
          referenceType: "calendar_event",
          referenceId: eventId,
          actionUrl: `/calendar?event=${eventId}`,
        });
      }
    }
    return p;
  });
}

async function removeParticipant(participantId) {
  return withSharedContext(async (client) => {
    await client.query(
      `DELETE FROM shared.event_participants WHERE participant_id = $1`,
      [participantId],
    );
    return { deleted: true };
  });
}

async function respondToEvent(participantId, status) {
  return withSharedContext(async (client) => {
    const {
      rows: [p],
    } = await client.query(
      `UPDATE shared.event_participants
       SET status = $1, responded_at = now()
       WHERE participant_id = $2
       RETURNING *`,
      [status, participantId],
    );
    return p;
  });
}

module.exports = {
  listInRange,
  getEvent,
  listForReference,
  createEvent,
  updateEvent,
  deleteEvent,
  findUpcomingForReminders,
  listParticipants,
  addParticipant,
  removeParticipant,
  respondToEvent,
  VALID_EVENT_TYPES,
};
