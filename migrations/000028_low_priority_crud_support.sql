-- ============================================================
-- MIGRATION 000028 — Low-priority CRUD: constraints & permissions
-- Hub Platform · JBS Praxis
--
-- Supports the final five CRUD features (credit_notes, discounts,
-- saved_reports, dashboard_configs, notification_preferences).
-- Two things those features need that the base schema lacks:
--
--   1. shared.notification_preferences has no unique constraint on
--      (user_id, notification_type). The upsert in
--      notifications.repository.upsertPreference uses
--      ON CONFLICT (user_id, notification_type) — without a matching
--      unique constraint that statement throws at runtime.
--
--   2. The discounts module gates routes on can("discounts", ...).
--      'discounts' was never a seeded permission module, so every
--      request — including the owner's — would be denied.
--
-- credit_notes, saved_reports and dashboard_configs reuse existing
-- permission modules (invoicing / reports / dashboards) and existing
-- tables, so they need nothing here.
--
-- Idempotent throughout. Safe to re-run.
-- ============================================================


-- ── 1. notification_preferences uniqueness ───────────────────
-- De-dupe first in case any duplicate (user, type) rows already
-- exist, keeping the most recently updated row — otherwise adding
-- the constraint would fail.
DELETE FROM shared.notification_preferences a
USING shared.notification_preferences b
WHERE a.user_id = b.user_id
  AND a.notification_type = b.notification_type
  AND a.updated_at < b.updated_at;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_preferences_user_type_uniq'
  ) THEN
    ALTER TABLE shared.notification_preferences
      ADD CONSTRAINT notification_preferences_user_type_uniq
      UNIQUE (user_id, notification_type);
  END IF;
END $$;

-- ── 2. discounts module permissions ──────────────────────────
-- Owner + manager get all six actions; sales gets view + create
-- (they apply promotions at the till but shouldn't redefine the
-- catalogue).
DO $$
DECLARE
  v_roles   UUID[] := ARRAY[
    '00000001-0000-0000-0000-000000000001',  -- owner
    '00000001-0000-0000-0000-000000000002'   -- manager
  ];
  v_actions TEXT[] := ARRAY['view','create','edit','delete','approve','export'];
  r UUID;
  a TEXT;
BEGIN
  FOREACH r IN ARRAY v_roles LOOP
    FOREACH a IN ARRAY v_actions LOOP
      INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
      VALUES (r, 'discounts', a, 'all', '{}')
      ON CONFLICT (role_id, module, action) DO NOTHING;
    END LOOP;
  END LOOP;

  -- sales: view + create only
  INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
  VALUES
    ('00000001-0000-0000-0000-000000000004', 'discounts', 'view',   'all', '{}'),
    ('00000001-0000-0000-0000-000000000004', 'discounts', 'create', 'all', '{}')
  ON CONFLICT (role_id, module, action) DO NOTHING;
END $$;

-- ── Cache note ────────────────────────────────────────────────
-- The permission middleware caches per role in Redis. Restart the
-- API or flush the permission cache after applying so the new
-- discounts rows take effect immediately.
