-- ============================================================
-- MIGRATION 000069 — Seed the hr_manager role
--
-- shared/staff/staff.service.js treats 'hr_manager' as a privileged
-- role for reading sensitive staff data (salary, NIN, BVN, contracts)
-- but the role was never seeded, so the only way to run HR was to
-- hand out the much broader owner/manager roles.
--
-- hr_manager: full HR (staff) + payroll, plus the supporting modules
-- an HR desk needs day to day. No access to accounting, sales, stock
-- or settings.
--
-- Same conventions as 000067: role_name matching, idempotent inserts.
-- ============================================================

INSERT INTO shared.roles (role_name, business, is_system, description)
SELECT 'hr_manager', NULL, true,
       'Human resources: full staff & payroll management, leave approval, contracts'
WHERE NOT EXISTS (
  SELECT 1 FROM shared.roles
  WHERE role_name = 'hr_manager' AND business IS NULL
);

CREATE OR REPLACE FUNCTION pg_temp.grant_perms(
  p_role TEXT, p_module TEXT, p_actions TEXT[], p_scope TEXT DEFAULT 'all'
) RETURNS void AS $$
  INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
  SELECT r.role_id, p_module, a, p_scope, '{}'
  FROM shared.roles r, unnest(p_actions) AS a
  WHERE r.role_name = p_role AND r.business IS NULL
  ON CONFLICT (role_id, module, action) DO NOTHING;
$$ LANGUAGE sql;

DO $$
DECLARE
  all_actions TEXT[] := ARRAY['view','create','edit','delete','approve','export'];
  m TEXT;
BEGIN
  -- Full HR surface.
  FOREACH m IN ARRAY ARRAY['staff','payroll'] LOOP
    PERFORM pg_temp.grant_perms('hr_manager', m, all_actions);
  END LOOP;

  -- Supporting modules.
  PERFORM pg_temp.grant_perms('hr_manager', 'documents',  ARRAY['view','create','edit']);
  PERFORM pg_temp.grant_perms('hr_manager', 'expenses',   ARRAY['view']);
  PERFORM pg_temp.grant_perms('hr_manager', 'reports',    ARRAY['view','export']);
  PERFORM pg_temp.grant_perms('hr_manager', 'dashboards', ARRAY['view']);
  PERFORM pg_temp.grant_perms('hr_manager', 'calendar',   ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('hr_manager', 'tasks',      ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('hr_manager', 'messaging',  ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('hr_manager', 'help',       ARRAY['view']);
END $$;

DROP FUNCTION IF EXISTS pg_temp.grant_perms(TEXT, TEXT, TEXT[], TEXT);
