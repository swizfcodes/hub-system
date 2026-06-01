"use strict";

// ─────────────────────────────────────────────────────────────
// TASKS REPOSITORY
//
// Tables: shared.tasks + shared.task_subtasks.
//
// Status enum (per schema check constraint):
//   inbox | today | this_week | this_month | later | done | cancelled
// Priority enum: low | normal | high | urgent
//
// The kanban board groups by status; the columns are exactly the
// status enum values. Product description Module 16: "organised as
// a visual board with columns for urgency: Inbox, Today, This Week,
// This Month, Later, Done, Cancelled."
// ─────────────────────────────────────────────────────────────

// ── LIST ─────────────────────────────────────────────────────

async function listTasks(
  client,
  {
    business,
    status,
    assignedTo,
    createdBy,
    search,
    includeDeleted,
    limit,
    offset,
  },
) {
  const params = [];
  const conditions = [];

  if (!includeDeleted) conditions.push("t.is_deleted = false");

  if (business) {
    params.push(business);
    conditions.push(`t.business = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }
  if (assignedTo) {
    params.push(assignedTo);
    conditions.push(`t.assigned_to = $${params.length}`);
  }
  if (createdBy) {
    params.push(createdBy);
    conditions.push(`t.created_by = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`,
    );
  }

  params.push(limit, offset);

  const { rows } = await client.query(
    `SELECT t.task_id, t.business, t.title, t.description,
            t.status, t.priority, t.assigned_to, t.due_at,
            t.parent_task_id, t.reference_type, t.reference_id,
            t.completed_at, t.created_by, t.created_at, t.updated_at,
            assigned_contact.display_name AS assigned_to_name,
            created_by_contact.display_name AS created_by_name,
            (SELECT COUNT(*) FROM shared.task_subtasks ts
             WHERE ts.task_id = t.task_id)::int AS subtask_count,
            (SELECT COUNT(*) FROM shared.task_subtasks ts
             WHERE ts.task_id = t.task_id AND ts.is_done = true)::int AS subtask_done_count
     FROM shared.tasks t
     LEFT JOIN shared.users assigned_user
       ON assigned_user.user_id = t.assigned_to
     LEFT JOIN shared.staff_profiles assigned_profile
       ON assigned_profile.profile_id = assigned_user.staff_profile_id
     LEFT JOIN shared.contacts assigned_contact
       ON assigned_contact.contact_id = assigned_profile.contact_id
     LEFT JOIN shared.users created_by_user
       ON created_by_user.user_id = t.created_by
     LEFT JOIN shared.staff_profiles created_by_profile
       ON created_by_profile.profile_id = created_by_user.staff_profile_id
     LEFT JOIN shared.contacts created_by_contact
       ON created_by_contact.contact_id = created_by_profile.contact_id
     ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""}
     ORDER BY
       CASE t.priority
         WHEN 'urgent' THEN 1 WHEN 'high' THEN 2
         WHEN 'normal' THEN 3 WHEN 'low'  THEN 4
       END,
       t.due_at ASC NULLS LAST,
       t.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

async function findById(client, taskId) {
  const {
    rows: [task],
  } = await client.query(
    `SELECT t.*,
            assigned_contact.display_name AS assigned_to_name,
            created_by_contact.display_name AS created_by_name
     FROM shared.tasks t
     LEFT JOIN shared.users assigned_user
       ON assigned_user.user_id = t.assigned_to
     LEFT JOIN shared.staff_profiles assigned_profile
       ON assigned_profile.profile_id = assigned_user.staff_profile_id
     LEFT JOIN shared.contacts assigned_contact
       ON assigned_contact.contact_id = assigned_profile.contact_id
     LEFT JOIN shared.users created_by_user
       ON created_by_user.user_id = t.created_by
     LEFT JOIN shared.staff_profiles created_by_profile
       ON created_by_profile.profile_id = created_by_user.staff_profile_id
     LEFT JOIN shared.contacts created_by_contact
       ON created_by_contact.contact_id = created_by_profile.contact_id
     WHERE t.task_id = $1 AND t.is_deleted = false`,
    [taskId],
  );
  if (!task) return null;

  const { rows: subtasks } = await client.query(
    `SELECT subtask_id, title, is_done, display_order, completed_at
     FROM shared.task_subtasks
     WHERE task_id = $1
     ORDER BY display_order ASC, created_at ASC`,
    [taskId],
  );
  return { ...task, subtasks };
}

// ── KANBAN BOARD ─────────────────────────────────────────────

/**
 * Tasks grouped by status — returns an object keyed by status name
 * with arrays of tasks. Used by the kanban board view.
 */
async function getBoard(client, { business, assignedTo }) {
  const { rows } = await client.query(
    `SELECT t.task_id, t.title, t.status, t.priority, t.due_at,
            t.assigned_to, t.reference_type, t.reference_id,
            assigned_contact.display_name AS assigned_to_name,
            (SELECT COUNT(*) FROM shared.task_subtasks ts
             WHERE ts.task_id = t.task_id)::int AS subtask_count,
            (SELECT COUNT(*) FROM shared.task_subtasks ts
             WHERE ts.task_id = t.task_id AND ts.is_done = true)::int AS subtask_done_count
     FROM shared.tasks t
     LEFT JOIN shared.users assigned_user
       ON assigned_user.user_id = t.assigned_to
     LEFT JOIN shared.staff_profiles assigned_profile
       ON assigned_profile.profile_id = assigned_user.staff_profile_id
     LEFT JOIN shared.contacts assigned_contact
       ON assigned_contact.contact_id = assigned_profile.contact_id
     WHERE t.is_deleted = false
       AND ($1::TEXT IS NULL OR t.business = $1)
       AND ($2::UUID IS NULL OR t.assigned_to = $2)
     ORDER BY
       CASE t.priority
         WHEN 'urgent' THEN 1 WHEN 'high' THEN 2
         WHEN 'normal' THEN 3 WHEN 'low'  THEN 4
       END,
       t.due_at ASC NULLS LAST`,
    [business || null, assignedTo || null],
  );

  // Group by status. Initialise all columns so the UI shows empty
  // columns rather than missing ones.
  const board = {
    inbox: [],
    today: [],
    this_week: [],
    this_month: [],
    later: [],
    done: [],
    cancelled: [],
  };
  for (const row of rows) {
    if (board[row.status]) board[row.status].push(row);
  }
  return board;
}

// ── MUTATIONS ────────────────────────────────────────────────

async function insert(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.tasks
       (business, title, description, status, priority,
        assigned_to, due_at, parent_task_id,
        reference_type, reference_id, created_by,
        reminder_minutes, remind_at, calendar_event_id, is_personal)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      data.business,
      data.title,
      data.description || null,
      data.status || "inbox",
      data.priority || "normal",
      data.assigned_to || null,
      data.due_at || null,
      data.parent_task_id || null,
      data.reference_type || null,
      data.reference_id || null,
      data.created_by,
      data.reminder_minutes ?? null,
      data.remind_at || null,
      data.calendar_event_id || null,
      data.is_personal || false,
    ],
  );
  return row;
}

async function update(client, taskId, fields) {
  const allowed = [
    "title",
    "description",
    "status",
    "priority",
    "assigned_to",
    "due_at",
    "parent_task_id",
    "reference_type",
    "reference_id",
    "reminder_minutes",
    "remind_at",
    "reminder_sent",
    "calendar_event_id",
    "is_personal",
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = $${i++}`);
    values.push(fields[key]);
  }
  // Automatically stamp completed_at when status transitions to 'done'.
  if (fields.status === "done") {
    sets.push(`completed_at = now()`);
  } else if (fields.status !== undefined && fields.status !== "done") {
    sets.push(`completed_at = NULL`);
  }
  if (!sets.length) return findById(client, taskId);
  sets.push(`updated_at = now()`);
  values.push(taskId);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.tasks
     SET ${sets.join(", ")}
     WHERE task_id = $${i} AND is_deleted = false
     RETURNING *`,
    values,
  );
  return row || null;
}

async function softDelete(client, taskId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.tasks
     SET is_deleted = true, updated_at = now()
     WHERE task_id = $1 AND is_deleted = false
     RETURNING task_id, is_deleted`,
    [taskId],
  );
  return row || null;
}

// ── SUBTASKS ─────────────────────────────────────────────────

async function listSubtasks(client, taskId) {
  const { rows } = await client.query(
    `SELECT subtask_id, task_id, title, is_done, display_order,
            completed_at, created_at
     FROM shared.task_subtasks
     WHERE task_id = $1
     ORDER BY display_order ASC, created_at ASC`,
    [taskId],
  );
  return rows;
}

async function insertSubtask(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.task_subtasks
       (task_id, title, display_order)
     VALUES ($1, $2, COALESCE($3,
       (SELECT COALESCE(MAX(display_order), 0) + 1
        FROM shared.task_subtasks WHERE task_id = $1)))
     RETURNING *`,
    [data.task_id, data.title, data.display_order ?? null],
  );
  return row;
}

async function setSubtaskDone(client, subtaskId, isDone) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.task_subtasks
     SET is_done = $2,
         completed_at = CASE WHEN $2 THEN now() ELSE NULL END
     WHERE subtask_id = $1
     RETURNING *`,
    [subtaskId, isDone],
  );
  return row || null;
}

async function deleteSubtask(client, subtaskId) {
  const result = await client.query(
    `DELETE FROM shared.task_subtasks WHERE subtask_id = $1`,
    [subtaskId],
  );
  return result.rowCount > 0;
}

// ── REMINDERS (used by jobs/sendTaskReminders) ───────────────

async function findDueReminders(client) {
  const { rows } = await client.query(
    `SELECT task_id, business, title, due_at, assigned_to, created_by
     FROM shared.tasks
     WHERE remind_at IS NOT NULL
       AND reminder_sent = false
       AND is_deleted = false
       AND status NOT IN ('done', 'cancelled')
       AND remind_at <= now()
     ORDER BY remind_at ASC
     LIMIT 200`,
  );
  return rows;
}

async function markReminderSent(client, taskId) {
  await client.query(
    `UPDATE shared.tasks SET reminder_sent = true WHERE task_id = $1`,
    [taskId],
  );
}

async function setCalendarEvent(client, taskId, eventId) {
  await client.query(
    `UPDATE shared.tasks SET calendar_event_id = $2 WHERE task_id = $1`,
    [taskId, eventId],
  );
}

module.exports = {
  listTasks,
  findById,
  getBoard,
  insert,
  update,
  softDelete,
  listSubtasks,
  insertSubtask,
  setSubtaskDone,
  deleteSubtask,
  findDueReminders,
  markReminderSent,
  setCalendarEvent,
};
