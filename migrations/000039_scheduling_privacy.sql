-- ============================================================
-- Calendar & Tasks — privacy/personal flags.
-- Apply once (shared schema).
-- ============================================================


-- Private calendar events (shown as "Busy" to other users).
ALTER TABLE shared.calendar_events
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

-- Personal tasks (invisible to managers / non-creators).
ALTER TABLE shared.tasks
  ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT false;

