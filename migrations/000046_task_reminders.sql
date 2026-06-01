-- ============================================================
-- MIGRATION 000046 — Task reminders + calendar link
--
-- Tasks can now carry a reminder (minutes before due) that fires a
-- notification, link to the calendar event they create, and be marked
-- personal. shared.tasks is a shared table, so these are single columns.
-- ============================================================

BEGIN;

ALTER TABLE shared.tasks
  ADD COLUMN IF NOT EXISTS reminder_minutes  INT,                       -- lead time before due_at
  ADD COLUMN IF NOT EXISTS remind_at         TIMESTAMPTZ,               -- due_at − reminder_minutes
  ADD COLUMN IF NOT EXISTS reminder_sent     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calendar_event_id UUID
    REFERENCES shared.calendar_events (event_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_personal       BOOLEAN NOT NULL DEFAULT false;

-- Index the cron uses to find due reminders cheaply.
CREATE INDEX IF NOT EXISTS idx_tasks_remind_pending
  ON shared.tasks (remind_at)
  WHERE remind_at IS NOT NULL AND reminder_sent = false AND is_deleted = false;

COMMIT;
