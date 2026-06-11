-- ============================================================
-- MIGRATION 000067 — RBAC uplift: complete role permission sets
--
-- Verified defects this fixes (live DB audit, June 2026):
--   • accountant had exactly ONE permission (help.view) despite
--     "Full access to finance modules" — locked out of everything.
--   • logistics had ONE permission (help.view) — locked out of the
--     logistics module itself.
--   • stock_manager had catalogue only — no stock, no purchasing.
--   • security.* rows existed (000038) but several modules used by
--     can() guards had no rows for any role, making them invisible
--     to the catalogue and ungrantable from the UI (tax, audit,
--     sales_campaigns, pos for some roles, …).
--
-- Approach: role_name matching (NEVER hardcoded role UUIDs — they
-- were reseeded in 000035). Idempotent: ON CONFLICT DO NOTHING, so
-- custom tweaks made in the role editor are preserved.
-- ============================================================

-- ── Helper: grant a full action set for (role, module) ───────
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
  all_actions  TEXT[] := ARRAY['view','create','edit','delete','approve','export'];
  -- Canonical module list — every module referenced by a can() guard
  -- in the backend. Keep in sync with MODULE_CATALOGUE in
  -- shared/permissions/permissions.service.js
  all_modules  TEXT[] := ARRAY[
    'accounting','audit','calendar','campaigns','catalogue','crm',
    'dashboards','discounts','documents','expenses','help','invoicing',
    'logistics','loyalty','messaging','payroll','pos','purchasing',
    'reports','retail_partners','sales','sales_campaigns','security',
    'settings','social','staff','stock','tasks','tax'
  ];
  m TEXT;
BEGIN
  -- ── OWNER: every action on every module ──────────────────
  FOREACH m IN ARRAY all_modules LOOP
    PERFORM pg_temp.grant_perms('owner', m, all_actions);
  END LOOP;

  -- ── MANAGER: everything except settings ───────────────────
  FOREACH m IN ARRAY all_modules LOOP
    IF m <> 'settings' THEN
      PERFORM pg_temp.grant_perms('manager', m, all_actions);
    END IF;
  END LOOP;

  -- ── ACCOUNTANT: full finance, read-only elsewhere ─────────
  FOREACH m IN ARRAY ARRAY['accounting','expenses','payroll','invoicing','tax','reports','purchasing'] LOOP
    PERFORM pg_temp.grant_perms('accountant', m, all_actions);
  END LOOP;
  PERFORM pg_temp.grant_perms('accountant', 'audit',           ARRAY['view','export']);
  PERFORM pg_temp.grant_perms('accountant', 'sales',           ARRAY['view','export']);
  PERFORM pg_temp.grant_perms('accountant', 'pos',             ARRAY['view','export']);
  PERFORM pg_temp.grant_perms('accountant', 'stock',           ARRAY['view','export']);
  PERFORM pg_temp.grant_perms('accountant', 'crm',             ARRAY['view']);
  PERFORM pg_temp.grant_perms('accountant', 'retail_partners', ARRAY['view','export']);
  PERFORM pg_temp.grant_perms('accountant', 'catalogue',       ARRAY['view']);
  PERFORM pg_temp.grant_perms('accountant', 'logistics',       ARRAY['view']);
  PERFORM pg_temp.grant_perms('accountant', 'documents',       ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('accountant', 'dashboards',      ARRAY['view']);
  PERFORM pg_temp.grant_perms('accountant', 'calendar',        ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('accountant', 'tasks',           ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('accountant', 'messaging',       ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('accountant', 'help',            ARRAY['view']);

  -- ── STOCK MANAGER: stock + purchasing + catalogue full ────
  FOREACH m IN ARRAY ARRAY['stock','purchasing','catalogue'] LOOP
    PERFORM pg_temp.grant_perms('stock_manager', m, all_actions);
  END LOOP;
  PERFORM pg_temp.grant_perms('stock_manager', 'sales',      ARRAY['view']);
  PERFORM pg_temp.grant_perms('stock_manager', 'pos',        ARRAY['view']);
  PERFORM pg_temp.grant_perms('stock_manager', 'logistics',  ARRAY['view']);
  PERFORM pg_temp.grant_perms('stock_manager', 'reports',    ARRAY['view','export']);
  PERFORM pg_temp.grant_perms('stock_manager', 'dashboards', ARRAY['view']);
  PERFORM pg_temp.grant_perms('stock_manager', 'documents',  ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('stock_manager', 'calendar',   ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('stock_manager', 'tasks',      ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('stock_manager', 'messaging',  ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('stock_manager', 'help',       ARRAY['view']);

  -- ── LOGISTICS: logistics full, view on adjacent modules ───
  PERFORM pg_temp.grant_perms('logistics', 'logistics', all_actions);
  PERFORM pg_temp.grant_perms('logistics', 'sales',      ARRAY['view']);
  PERFORM pg_temp.grant_perms('logistics', 'stock',      ARRAY['view']);
  PERFORM pg_temp.grant_perms('logistics', 'crm',        ARRAY['view']);
  PERFORM pg_temp.grant_perms('logistics', 'reports',    ARRAY['view']);
  PERFORM pg_temp.grant_perms('logistics', 'dashboards', ARRAY['view']);
  PERFORM pg_temp.grant_perms('logistics', 'documents',  ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('logistics', 'calendar',   ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('logistics', 'tasks',      ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('logistics', 'messaging',  ARRAY['view','create']);
  PERFORM pg_temp.grant_perms('logistics', 'help',       ARRAY['view']);

  -- ── SALES: add dashboards/help gaps (rest seeded in 000022) ─
  PERFORM pg_temp.grant_perms('sales', 'dashboards', ARRAY['view']);
  PERFORM pg_temp.grant_perms('sales', 'help',       ARRAY['view']);
END $$;

-- ── Scope sanity: staff/sales 'own' scopes were seeded in 000022
--    and are preserved by ON CONFLICT DO NOTHING above. ─────────

DROP FUNCTION IF EXISTS pg_temp.grant_perms(TEXT, TEXT, TEXT[], TEXT);
