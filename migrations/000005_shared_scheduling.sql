-- ============================================================
-- MIGRATION 000005 — Shared scheduling tables
-- calendar_events, event_participants, event_resources,
-- tasks, task_subtasks
-- ============================================================

-- ── calendar_events ───────────────────────────────────────
CREATE TABLE shared.calendar_events (
  event_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business              TEXT        NOT NULL,
  title                 TEXT        NOT NULL,
  event_type            TEXT        NOT NULL,
  -- Types: meeting | viewing | follow_up | delivery | task_deadline
  --        leave | reminder | appointment
  start_at              TIMESTAMPTZ NOT NULL,
  end_at                TIMESTAMPTZ NOT NULL,
  all_day               BOOLEAN     NOT NULL DEFAULT false,
  location              TEXT,
  description           TEXT,
  recurrence_rule       TEXT,           -- iCal RRULE format for repeating events
  reference_type        TEXT,           -- 'crm_deal','contact','delivery'
  reference_id          UUID,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  is_deleted            BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_time_valid CHECK (end_at >= start_at)
);

CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON shared.calendar_events
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE INDEX idx_calendar_events_start    ON shared.calendar_events (business, start_at)
  WHERE is_deleted = false;
CREATE INDEX idx_calendar_events_reference ON shared.calendar_events (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

-- ── event_participants ────────────────────────────────────
CREATE TABLE shared.event_participants (
  participant_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID        NOT NULL REFERENCES shared.calendar_events (event_id) ON DELETE CASCADE,
  user_id               UUID        REFERENCES shared.users (user_id) ON DELETE CASCADE,
  contact_id            UUID        REFERENCES shared.contacts (contact_id) ON DELETE CASCADE,
  status                TEXT        NOT NULL DEFAULT 'invited'
                        CHECK (status IN ('invited','accepted','declined','tentative')),
  is_organiser          BOOLEAN     NOT NULL DEFAULT false,
  responded_at          TIMESTAMPTZ,
  CONSTRAINT participant_user_or_contact CHECK (
    (user_id IS NOT NULL AND contact_id IS NULL) OR
    (user_id IS NULL AND contact_id IS NOT NULL)
  )
);

CREATE INDEX idx_event_participants_event   ON shared.event_participants (event_id);
CREATE INDEX idx_event_participants_user    ON shared.event_participants (user_id)    WHERE user_id IS NOT NULL;
CREATE INDEX idx_event_participants_contact ON shared.event_participants (contact_id) WHERE contact_id IS NOT NULL;

-- ── event_resources ───────────────────────────────────────
-- Room / equipment bookings linked to an event.
CREATE TABLE shared.event_resources (
  resource_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID        NOT NULL REFERENCES shared.calendar_events (event_id) ON DELETE CASCADE,
  resource_type         TEXT        NOT NULL,  -- 'showroom','meeting_room','vehicle','equipment'
  resource_name         TEXT        NOT NULL,  -- e.g. 'Lekki Showroom', 'Conference Room B'
  quantity              INTEGER     NOT NULL DEFAULT 1,
  notes                 TEXT
);

CREATE INDEX idx_event_resources_event ON shared.event_resources (event_id);

-- ── tasks ─────────────────────────────────────────────────
CREATE TABLE shared.tasks (
  task_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business              TEXT        NOT NULL,
  title                 TEXT        NOT NULL,
  description           TEXT,
  status                TEXT        NOT NULL DEFAULT 'inbox'
                        CHECK (status IN ('inbox','today','this_week','this_month','later','done','cancelled')),
  priority              TEXT        NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  due_at                TIMESTAMPTZ,
  parent_task_id        UUID        REFERENCES shared.tasks (task_id) ON DELETE CASCADE,
  reference_type        TEXT,                          -- 'crm_deal','contact','purchase_order'
  reference_id          UUID,
  completed_at          TIMESTAMPTZ,
  created_by            UUID        NOT NULL REFERENCES shared.users (user_id) ON DELETE RESTRICT,
  is_deleted            BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON shared.tasks
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE INDEX idx_tasks_assigned   ON shared.tasks (assigned_to, status)   WHERE is_deleted = false;
CREATE INDEX idx_tasks_due        ON shared.tasks (due_at)                 WHERE due_at IS NOT NULL AND is_deleted = false;
CREATE INDEX idx_tasks_reference  ON shared.tasks (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

-- ── task_subtasks ─────────────────────────────────────────
CREATE TABLE shared.task_subtasks (
  subtask_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id               UUID        NOT NULL REFERENCES shared.tasks (task_id) ON DELETE CASCADE,
  title                 TEXT        NOT NULL,
  is_done               BOOLEAN     NOT NULL DEFAULT false,
  display_order         SMALLINT    NOT NULL DEFAULT 0,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_subtasks_task ON shared.task_subtasks (task_id);

-- ============================================================
-- Verify
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'shared'
-- AND table_name IN ('calendar_events','event_participants','event_resources','tasks','task_subtasks');
-- Expected: 5 rows
-- ============================================================
