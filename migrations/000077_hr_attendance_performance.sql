-- ============================================================
-- MIGRATION 000077 — HR uplift: work schedules, attendance,
-- justifications, staff queries, and performance.
--
-- Turns "HR & Staff" from a read-only employee overview into a
-- working people-management surface:
--   - per-employee weekly work pattern (on-site / remote / off) so
--     remote & hybrid staff are handled correctly
--   - office work_locations with a geofence for on-site clock-in
--   - attendance_records: clock in/out with IP + GPS capture,
--     lateness + off-site detection, and an inline justification
--     workflow (employee explains, HR approves / rejects)
--   - staff_queries: HR formally queries a staff member (e.g. an
--     off-site clock-in or repeated lateness); the employee responds
--   - performance_reviews + performance_goals to complement the
--     auto-computed, role-aware KPIs the service derives live
--
-- All tables live in `shared` — they hang off shared.staff_profiles
-- and span every business, exactly like shared.leave_requests.
--
-- Payroll wiring (modules/payroll/calculator.service.js) reads these
-- tables so unexcused absences flow onto the payslip automatically.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Work locations (office geofences), per business
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared.work_locations (
  location_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business              TEXT        NOT NULL,
  name                  TEXT        NOT NULL,
  address               TEXT,
  latitude              NUMERIC(9,6),
  longitude             NUMERIC(9,6),
  geofence_radius_m     INTEGER     NOT NULL DEFAULT 250 CHECK (geofence_radius_m > 0),
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_locations_business
  ON shared.work_locations (business) WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_work_locations_updated_at ON shared.work_locations;
CREATE TRIGGER trg_work_locations_updated_at
  BEFORE UPDATE ON shared.work_locations
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2. Work schedule on staff_profiles
--    work_schedule maps each weekday to one of: 'on_site','remote','off'
--    Set at onboarding; drives what attendance expects each day.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE shared.staff_profiles
  ADD COLUMN IF NOT EXISTS work_location_type TEXT NOT NULL DEFAULT 'on_site'
    CHECK (work_location_type IN ('on_site','remote','hybrid')),
  ADD COLUMN IF NOT EXISTS work_schedule JSONB NOT NULL DEFAULT
    '{"mon":"on_site","tue":"on_site","wed":"on_site","thu":"on_site","fri":"on_site","sat":"off","sun":"off"}'::jsonb,
  ADD COLUMN IF NOT EXISTS expected_start_time TIME,
  ADD COLUMN IF NOT EXISTS grace_minutes SMALLINT NOT NULL DEFAULT 15 CHECK (grace_minutes >= 0),
  ADD COLUMN IF NOT EXISTS work_location_id UUID REFERENCES shared.work_locations (location_id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. Attendance records — one row per staff member per work day
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared.attendance_records (
  attendance_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id              UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id) ON DELETE CASCADE,
  work_date               DATE        NOT NULL,
  -- What the schedule expected for this day.
  expected_mode           TEXT        NOT NULL DEFAULT 'on_site'
                          CHECK (expected_mode IN ('on_site','remote','off')),
  -- Derived attendance outcome.
  status                  TEXT        NOT NULL DEFAULT 'absent'
                          CHECK (status IN ('present','late','remote','absent','off','on_leave','holiday')),
  clock_in_at             TIMESTAMPTZ,
  clock_out_at            TIMESTAMPTZ,
  -- Capture at clock-in (the employee approves location sharing first).
  clock_in_ip             INET,
  clock_in_latitude       NUMERIC(9,6),
  clock_in_longitude      NUMERIC(9,6),
  clock_in_accuracy_m     NUMERIC(8,1),
  clock_in_location_label TEXT,
  clock_out_ip            INET,
  clock_out_latitude      NUMERIC(9,6),
  clock_out_longitude     NUMERIC(9,6),
  -- Distance from the assigned office (NULL when no office / remote day).
  distance_from_office_m  NUMERIC(10,1),
  -- on_site day but clocked in beyond the geofence — HR query candidate.
  is_offsite              BOOLEAN     NOT NULL DEFAULT false,
  late_minutes            SMALLINT    NOT NULL DEFAULT 0,
  worked_minutes          INTEGER,
  -- Inline justification workflow (lateness / absence / off-site).
  justification_type      TEXT        CHECK (justification_type IN ('lateness','absence','offsite')),
  justification_note      TEXT,
  justification_status    TEXT        CHECK (justification_status IN ('pending','approved','rejected')),
  justification_reviewed_by UUID      REFERENCES shared.users (user_id) ON DELETE SET NULL,
  justification_reviewed_at TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_profile_date
  ON shared.attendance_records (profile_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_date
  ON shared.attendance_records (work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_pending_justification
  ON shared.attendance_records (justification_status)
  WHERE justification_status = 'pending';

DROP TRIGGER IF EXISTS trg_attendance_updated_at ON shared.attendance_records;
CREATE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON shared.attendance_records
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. Staff queries — HR asks a staff member to explain something
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared.staff_queries (
  query_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id) ON DELETE CASCADE,
  raised_by             UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  query_type            TEXT        NOT NULL
                        CHECK (query_type IN ('lateness','absence','offsite_clockin','conduct','performance','other')),
  severity              TEXT        NOT NULL DEFAULT 'normal'
                        CHECK (severity IN ('low','normal','high')),
  related_attendance_id UUID        REFERENCES shared.attendance_records (attendance_id) ON DELETE SET NULL,
  subject               TEXT        NOT NULL,
  details               TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','responded','closed','escalated')),
  response              TEXT,
  responded_at          TIMESTAMPTZ,
  resolution            TEXT,
  resolved_by           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  resolved_at           TIMESTAMPTZ,
  due_date              DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_queries_profile
  ON shared.staff_queries (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_queries_open
  ON shared.staff_queries (status) WHERE status IN ('open','responded');

DROP TRIGGER IF EXISTS trg_staff_queries_updated_at ON shared.staff_queries;
CREATE TRIGGER trg_staff_queries_updated_at
  BEFORE UPDATE ON shared.staff_queries
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5. Performance reviews — periodic manager review cycles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared.performance_reviews (
  review_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id) ON DELETE CASCADE,
  reviewer_id           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  period_start          DATE        NOT NULL,
  period_end            DATE        NOT NULL,
  overall_rating        NUMERIC(2,1) CHECK (overall_rating >= 0 AND overall_rating <= 5),
  kpi_snapshot          JSONB,      -- KPI values captured at review time
  strengths             TEXT,
  improvements          TEXT,
  summary               TEXT,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','shared','acknowledged')),
  acknowledged_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT perf_review_period_valid CHECK (period_end >= period_start)
);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_profile
  ON shared.performance_reviews (profile_id, period_end DESC);

DROP TRIGGER IF EXISTS trg_perf_reviews_updated_at ON shared.performance_reviews;
CREATE TRIGGER trg_perf_reviews_updated_at
  BEFORE UPDATE ON shared.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 6. Performance goals — objectives tracked toward a target
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared.performance_goals (
  goal_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id) ON DELETE CASCADE,
  title                 TEXT        NOT NULL,
  description           TEXT,
  metric                TEXT,                    -- 'sales','attendance_rate', etc. (informational)
  target_value          NUMERIC(14,2),
  current_value         NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit                  TEXT,
  weight                SMALLINT    NOT NULL DEFAULT 1 CHECK (weight > 0),
  due_date              DATE,
  status                TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','achieved','missed','cancelled')),
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perf_goals_profile
  ON shared.performance_goals (profile_id, status);

DROP TRIGGER IF EXISTS trg_perf_goals_updated_at ON shared.performance_goals;
CREATE TRIGGER trg_perf_goals_updated_at
  BEFORE UPDATE ON shared.performance_goals
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- ============================================================
-- Verify
-- SELECT COUNT(*) FROM information_schema.tables
--   WHERE table_schema = 'shared'
--     AND table_name IN ('work_locations','attendance_records',
--       'staff_queries','performance_reviews','performance_goals');
-- Expected: 5
-- ============================================================
