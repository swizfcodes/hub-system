"use strict";

const { withSharedContext } = require("../../config/db");
const auditService = require("../audit/audit.service");
const notifService = require("../notifications/notifications.service");
const { emitToBusiness } = require("../../config/sockets");
const repo = require("./tasks.repository");
const calendarRepo = require("../calendar/calendar.repository");
const logger = require("../../config/logger");

// ─────────────────────────────────────────────────────────────
// TASKS SERVICE — Module 16: Tasks & To-Do
//
// Promises from the product description:
//   - "organised as a visual board with columns for urgency:
//      Inbox, Today, This Week, This Month, Later, Done, Cancelled"
//   - "priority levels, due dates and times"
//   - "sub-tasks (break a big task into smaller steps)"
//   - "assignment to a team member"
//   - "linking to a customer or deal"
//   - "Tasks with due dates appear on the Calendar" — handled by
//     creating a corresponding calendar_event when due_at is set
//   - "Tasks generated from other modules (e.g., a follow-up from CRM,
//      a meeting action item) appear here automatically" — those
//      modules call createTask programmatically
// ─────────────────────────────────────────────────────────────

const VALID_STATUSES = [
  "inbox",
  "today",
  "this_week",
  "this_month",
  "later",
  "done",
  "cancelled",
];
const VALID_PRIORITIES = ["low", "normal", "high", "urgent"];

// ─────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────

async function listTasks(query) {
  return withSharedContext(async (client) => {
    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const rows = await repo.listTasks(client, {
      business: query.business,
      status: query.status,
      assignedTo: query.assigned_to,
      createdBy: query.created_by,
      search: query.search,
      includeDeleted: false,
      limit,
      offset,
    });
    return { data: rows, pagination: { page, limit } };
  });
}

async function getTask(taskId) {
  return withSharedContext(async (client) => {
    const task = await repo.findById(client, taskId);
    if (!task) {
      throw Object.assign(new Error("Task not found"), { status: 404 });
    }
    return task;
  });
}

async function getBoard(query) {
  return withSharedContext((client) =>
    repo.getBoard(client, {
      business: query.business,
      assignedTo: query.assigned_to,
    }),
  );
}

// ─────────────────────────────────────────────────────────────
// CREATE / UPDATE
// ─────────────────────────────────────────────────────────────

async function createTask(data, user) {
  return withSharedContext(async (client) => {
    validateTaskInput(data);

    const task = await repo.insert(client, {
      ...data,
      remind_at: computeRemindAt(data.due_at, data.reminder_minutes),
      created_by: user.user_id,
    });

    // Mirror the task onto the calendar so a dated task shows up there.
    await syncCalendarForTask(client, task, user);

    // Notify the assignee if they're not the creator.
    if (task.assigned_to && task.assigned_to !== user.user_id) {
      await notifService.create(client, {
        userId: task.assigned_to,
        business: task.business,
        type: "task_assigned",
        title: `New task: ${task.title}`,
        body: task.due_at
          ? `Due ${new Date(task.due_at).toLocaleDateString()}`
          : "No due date",
        referenceType: "task",
        referenceId: task.task_id,
        actionUrl: `/tasks?task=${task.task_id}`,
      });
    }

    emitToBusiness(task.business, "task:created", {
      taskId: task.task_id,
      status: task.status,
      assignedTo: task.assigned_to,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: task.business,
      module: "tasks",
      action: "create",
      table: "shared.tasks",
      recordId: task.task_id,
      after: task,
    });

    return task;
  });
}

async function updateTask(taskId, fields, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findById(client, taskId);
    if (!before) {
      throw Object.assign(new Error("Task not found"), { status: 404 });
    }

    if (fields.status && !VALID_STATUSES.includes(fields.status)) {
      throw Object.assign(
        new Error(`status must be one of: ${VALID_STATUSES.join(", ")}`),
        { status: 400 },
      );
    }
    if (fields.priority && !VALID_PRIORITIES.includes(fields.priority)) {
      throw Object.assign(
        new Error(`priority must be one of: ${VALID_PRIORITIES.join(", ")}`),
        { status: 400 },
      );
    }

    // Recompute the reminder (and re-arm it) whenever scheduling changes.
    if (fields.due_at !== undefined || fields.reminder_minutes !== undefined) {
      const dueAt = fields.due_at !== undefined ? fields.due_at : before.due_at;
      const rmins =
        fields.reminder_minutes !== undefined
          ? fields.reminder_minutes
          : before.reminder_minutes;
      fields.remind_at = computeRemindAt(dueAt, rmins);
      fields.reminder_sent = false;
    }

    const after = await repo.update(client, taskId, fields);
    if (!after) {
      throw Object.assign(new Error("Task not found"), { status: 404 });
    }

    // Keep the mirrored calendar event in sync with the task's due date.
    if (fields.due_at !== undefined || fields.reminder_minutes !== undefined) {
      await syncCalendarForTask(client, after, user);
    }

    // Notify the new assignee on reassignment.
    if (
      fields.assigned_to !== undefined &&
      fields.assigned_to !== before.assigned_to &&
      fields.assigned_to !== user.user_id
    ) {
      await notifService.create(client, {
        userId: fields.assigned_to,
        business: after.business,
        type: "task_assigned",
        title: `Task reassigned to you: ${after.title}`,
        referenceType: "task",
        referenceId: taskId,
        actionUrl: `/tasks?task=${taskId}`,
      });
    }

    emitToBusiness(after.business, "task:updated", {
      taskId,
      status: after.status,
      assignedTo: after.assigned_to,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: before.business,
      module: "tasks",
      action: fields.status === "done" ? "complete" : "update",
      table: "shared.tasks",
      recordId: taskId,
      before,
      after,
    });

    return after;
  });
}

/**
 * Convenience for drag-and-drop on the kanban board — change just the
 * status column. Frontend calls this when the user drops a card into
 * a new column.
 */
async function moveTask(taskId, newStatus, user) {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw Object.assign(
      new Error(`status must be one of: ${VALID_STATUSES.join(", ")}`),
      { status: 400 },
    );
  }
  return updateTask(taskId, { status: newStatus }, user);
}

async function deleteTask(taskId, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findById(client, taskId);
    if (!before) {
      throw Object.assign(new Error("Task not found"), { status: 404 });
    }
    const result = await repo.softDelete(client, taskId);
    if (!result) {
      throw Object.assign(new Error("Task not found or already deleted"), {
        status: 404,
      });
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: before.business,
      module: "tasks",
      action: "delete",
      table: "shared.tasks",
      recordId: taskId,
      before,
    });
    return result;
  });
}

// ─────────────────────────────────────────────────────────────
// SUBTASKS
// ─────────────────────────────────────────────────────────────

async function listSubtasks(taskId) {
  return withSharedContext((client) => repo.listSubtasks(client, taskId));
}

async function addSubtask(taskId, { title, display_order }, user) {
  return withSharedContext(async (client) => {
    const parent = await repo.findById(client, taskId);
    if (!parent) {
      throw Object.assign(new Error("Parent task not found"), { status: 404 });
    }
    const subtask = await repo.insertSubtask(client, {
      task_id: taskId,
      title,
      display_order,
    });
    return subtask;
  });
}

async function setSubtaskDone(subtaskId, isDone, user) {
  return withSharedContext(async (client) => {
    const subtask = await repo.setSubtaskDone(client, subtaskId, isDone);
    if (!subtask) {
      throw Object.assign(new Error("Subtask not found"), { status: 404 });
    }
    return subtask;
  });
}

async function deleteSubtask(subtaskId, user) {
  return withSharedContext(async (client) => {
    const ok = await repo.deleteSubtask(client, subtaskId);
    return { deleted: ok };
  });
}

// ─────────────────────────────────────────────────────────────
// PROGRAMMATIC HELPER
// Other modules (CRM, calendar) call this to create follow-up tasks.
// ─────────────────────────────────────────────────────────────

async function createFromModule({
  business,
  title,
  description,
  due_at,
  priority,
  assigned_to,
  referenceType,
  referenceId,
  user,
}) {
  return createTask(
    {
      business,
      title,
      description,
      due_at,
      priority: priority || "normal",
      assigned_to,
      reference_type: referenceType,
      reference_id: referenceId,
    },
    user || { user_id: null, display_name: "system" },
  );
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

// remind_at = due_at − reminder_minutes (null if either is missing).
function computeRemindAt(dueAt, reminderMinutes) {
  if (
    !dueAt ||
    reminderMinutes === undefined ||
    reminderMinutes === null ||
    reminderMinutes === ""
  ) {
    return null;
  }
  const mins = parseInt(reminderMinutes, 10);
  if (Number.isNaN(mins)) return null;
  return new Date(new Date(dueAt).getTime() - mins * 60000).toISOString();
}

// Mirror a dated task onto the calendar (create / update / remove the event).
// Best-effort: a calendar hiccup must never block the task write.
async function syncCalendarForTask(client, task, user) {
  try {
    if (task.due_at) {
      if (task.calendar_event_id) {
        await calendarRepo.update(client, task.calendar_event_id, {
          title: task.title,
          start_at: task.due_at,
          end_at: task.due_at,
        });
      } else {
        const ev = await calendarRepo.insert(client, {
          business: task.business,
          title: task.title,
          event_type: "task",
          start_at: task.due_at,
          end_at: task.due_at,
          reference_type: "task",
          reference_id: task.task_id,
          created_by: user?.user_id || task.created_by || null,
        });
        await repo.setCalendarEvent(client, task.task_id, ev.event_id);
        task.calendar_event_id = ev.event_id;
      }
    } else if (task.calendar_event_id) {
      // Due date cleared — drop the mirrored event.
      await calendarRepo.softDelete(client, task.calendar_event_id);
    }
  } catch (e) {
    logger.warn(
      `[tasks] calendar sync failed for ${task.task_id}: ${e.message}`,
    );
  }
}

function validateTaskInput(data) {
  if (!data.business) {
    throw Object.assign(new Error("business is required"), { status: 400 });
  }
  if (!data.title) {
    throw Object.assign(new Error("title is required"), { status: 400 });
  }
  if (data.status && !VALID_STATUSES.includes(data.status)) {
    throw Object.assign(
      new Error(`status must be one of: ${VALID_STATUSES.join(", ")}`),
      { status: 400 },
    );
  }
  if (data.priority && !VALID_PRIORITIES.includes(data.priority)) {
    throw Object.assign(
      new Error(`priority must be one of: ${VALID_PRIORITIES.join(", ")}`),
      { status: 400 },
    );
  }
}

module.exports = {
  listTasks,
  getTask,
  getBoard,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  listSubtasks,
  addSubtask,
  setSubtaskDone,
  deleteSubtask,
  createFromModule,
  VALID_STATUSES,
  VALID_PRIORITIES,
};
