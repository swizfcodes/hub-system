"use strict";

// Fires task reminder notifications. Runs every few minutes: any task whose
// remind_at has passed (and hasn't been reminded yet, and isn't done/cancelled)
// notifies the assignee — or the creator if unassigned — then is marked sent so
// it never double-fires. remind_at is set from the task's due date minus the
// chosen reminder lead time (see tasks.service.computeRemindAt).

const { withSharedContext } = require("../config/db");
const repo = require("../shared/tasks/tasks.repository");
const notifService = require("../shared/notifications/notifications.service");
const logger = require("../config/logger");

module.exports = async function sendTaskReminders() {
  await withSharedContext(async (client) => {
    const due = await repo.findDueReminders(client);
    for (const t of due) {
      const userId = t.assigned_to || t.created_by;
      if (userId) {
        try {
          await notifService.create(client, {
            userId,
            business: t.business,
            type: "task_reminder",
            title: `Reminder: ${t.title}`,
            body: t.due_at
              ? `Due ${new Date(t.due_at).toLocaleString()}`
              : "Task reminder",
            referenceType: "task",
            referenceId: t.task_id,
            actionUrl: `/tasks/${t.task_id}`,
          });
        } catch (e) {
          logger.error(
            `[task-reminders] notify failed for ${t.task_id}: ${e.message}`,
          );
        }
      }
      await repo.markReminderSent(client, t.task_id);
    }
    if (due.length)
      logger.info(`[task-reminders] sent ${due.length} reminder(s)`);
  });
};
