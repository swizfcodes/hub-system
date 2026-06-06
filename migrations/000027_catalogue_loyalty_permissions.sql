-- ============================================================
-- MIGRATION 000027 — Catalogue & Loyalty module permissions
-- Hub Platform · JBS Praxis
--
-- The original permission seed (000022) predates two modules:
--   - catalogue  (product/category/location/image/supplier/barcode CRUD)
--   - loyalty    (points + tier management)
--
-- Their route handlers gate on can("catalogue", ...) and
-- can("loyalty", ...). With no permission rows for these modules,
-- EVERY request — including the owner's — is denied. This migration
-- back-fills the baseline so the new modules are reachable on day one.
--
-- Idempotent: every INSERT uses ON CONFLICT DO NOTHING. Safe to
-- re-run and safe on fresh installs.
--
-- Roles seeded here:
--   owner          — all six actions on both modules
--   manager        — all six actions on both modules
--   stock_manager  — full catalogue access (they own the product
--                    catalogue day to day); no loyalty
--   sales          — catalogue view only (they look products up but
--                    shouldn't edit the master catalogue);
--                    loyalty view + create (award/redeem at POS)
--
-- Anything finer-grained is left to the in-app permissions admin UI.
-- ============================================================


-- ── Owner & Manager: full access to both modules ─────────────
DO $$
DECLARE
  v_roles   UUID[] := ARRAY[
    '00000001-0000-0000-0000-000000000001',  -- owner
    '00000001-0000-0000-0000-000000000002'   -- manager
  ];
  v_modules TEXT[] := ARRAY['catalogue','loyalty'];
  v_actions TEXT[] := ARRAY['view','create','edit','delete','approve','export'];
  r UUID;
  m TEXT;
  a TEXT;
BEGIN
  FOREACH r IN ARRAY v_roles LOOP
    FOREACH m IN ARRAY v_modules LOOP
      FOREACH a IN ARRAY v_actions LOOP
        INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
        VALUES (r, m, a, 'all', '{}')
        ON CONFLICT (role_id, module, action) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ── Stock manager: full catalogue (they own product master data) ─
DO $$
DECLARE
  v_stock_id UUID := '00000001-0000-0000-0000-000000000005';
  v_actions  TEXT[] := ARRAY['view','create','edit','delete','approve','export'];
  a TEXT;
BEGIN
  FOREACH a IN ARRAY v_actions LOOP
    INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
    VALUES (v_stock_id, 'catalogue', a, 'all', '{}')
    ON CONFLICT (role_id, module, action) DO NOTHING;
  END LOOP;
END $$;

-- ── Sales: catalogue view-only + loyalty view/create ─────────
-- Sales staff look products up and award/redeem loyalty points at
-- the till, but should not edit the master catalogue.
DO $$
DECLARE
  v_sales_id UUID := '00000001-0000-0000-0000-000000000004';
BEGIN
  INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields) VALUES
    (v_sales_id, 'catalogue', 'view',   'all', '{}'),
    (v_sales_id, 'loyalty',   'view',   'all', '{}'),
    (v_sales_id, 'loyalty',   'create', 'all', '{}')
  ON CONFLICT (role_id, module, action) DO NOTHING;
END $$;

-- ── Cache invalidation note ───────────────────────────────────
-- The permission middleware caches per role_id in Redis. After
-- applying this migration, restart the API server or flush the
-- Redis permission cache so the new rows take effect immediately
-- rather than after the cache TTL expires.
