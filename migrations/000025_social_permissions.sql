-- ============================================================
-- MIGRATION 000025 — Social module permissions (back-fill)
-- Hub Platform · JBS Praxis
--
-- 000022 (original seed) was authored before Module 14 (Social
-- Media Management) existed. Fresh installs from now on get
-- social permissions from the updated 000022 directly. This
-- migration back-fills installs that already ran 000022 and so
-- have no social permission rows yet.
--
-- This migration is idempotent — every INSERT uses
-- ON CONFLICT (role_id, module, action) DO NOTHING, so
-- re-running it is safe and running it on a fresh install where
-- 000022 already covered social is a no-op.
--
-- Roles touched here:
--   owner    — all six actions, all records
--   manager  — all six actions, all records
--   sales    — view + create (all), edit (own)
--
-- Other roles (accountant, stock_manager, logistics, staff) get
-- no social permissions seeded — they're expected to be granted
-- through the admin UI on a per-install basis if that brand
-- wants those roles managing social posts.
-- ============================================================


-- ── Owner: full access to social ──────────────────────────────
DO $$
DECLARE
  v_owner_id UUID := '00000001-0000-0000-0000-000000000001';
  v_actions  TEXT[] := ARRAY['view','create','edit','delete','approve','export'];
  a TEXT;
BEGIN
  FOREACH a IN ARRAY v_actions LOOP
    INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
    VALUES (v_owner_id, 'social', a, 'all', '{}')
    ON CONFLICT (role_id, module, action) DO NOTHING;
  END LOOP;
END $$;

-- ── Manager: full access to social ────────────────────────────
DO $$
DECLARE
  v_manager_id UUID := '00000001-0000-0000-0000-000000000002';
  v_actions    TEXT[] := ARRAY['view','create','edit','delete','approve','export'];
  a TEXT;
BEGIN
  FOREACH a IN ARRAY v_actions LOOP
    INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
    VALUES (v_manager_id, 'social', a, 'all', '{}')
    ON CONFLICT (role_id, module, action) DO NOTHING;
  END LOOP;
END $$;

-- ── Sales: view + create + edit-own ───────────────────────────
-- Sales staff typically schedule promotional posts but shouldn't
-- be able to delete posts that other team members scheduled.
DO $$
DECLARE
  v_sales_id UUID := '00000001-0000-0000-0000-000000000004';
BEGIN
  INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields) VALUES
    (v_sales_id, 'social', 'view',   'all', '{}'),
    (v_sales_id, 'social', 'create', 'all', '{}'),
    (v_sales_id, 'social', 'edit',   'own', '{}')
  ON CONFLICT (role_id, module, action) DO NOTHING;
END $$;

-- ── Cache invalidation note ───────────────────────────────────
-- The middleware caches permissions in Redis keyed by role_id.
-- After applying this migration, restart the API server (or
-- flush the Redis permission cache) so the new permission rows
-- take effect immediately. Otherwise existing user sessions will
-- continue to read stale cached permissions until they expire
-- (default TTL set in config/redis.js).
