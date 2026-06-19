-- ============================================================
-- MIGRATION 000054 — DB-managed delivery zones & rates (logistics)
--
-- Moves the delivery rate card out of hardcoded config and into the
-- logistics module, per business. Admins manage zones/rates; the
-- backend reads them and serves them to the storefront checkout.
--
--   delivery_zones    — per-zone flat rate (1–9 items). scope='lagos'
--                       matches the city/area against match_terms;
--                       scope='nationwide' matches the state.
--   delivery_settings — singleton: bulk-freight threshold + fees and
--                       the state name treated as "within Lagos".
--
-- Seeded with the current policy (POL-062026) for both businesses.
-- Idempotent: IF NOT EXISTS + ON CONFLICT DO NOTHING.
-- ============================================================

BEGIN;

-- ── helper: create the pair of tables in a schema ──────────────
-- (Written out per-schema since Postgres has no parametric DDL.)

-- ┌── JEWELRY ──────────────────────────────────────────────┐
CREATE TABLE IF NOT EXISTS jewelry.delivery_zones (
  zone_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL UNIQUE,
  scope         TEXT        NOT NULL CHECK (scope IN ('lagos','nationwide')),
  match_terms   TEXT[]      NOT NULL DEFAULT '{}',
  rate          NUMERIC(12,2) NOT NULL CHECK (rate >= 0),
  is_default    BOOLEAN     NOT NULL DEFAULT false,
  display_order INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jewelry.delivery_settings (
  id                  INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lagos_state_name    TEXT        NOT NULL DEFAULT 'Lagos',
  bulk_threshold      INTEGER     NOT NULL DEFAULT 10 CHECK (bulk_threshold > 0),
  bulk_fee_lagos      NUMERIC(12,2) NOT NULL DEFAULT 15000,
  bulk_fee_nationwide NUMERIC(12,2) NOT NULL DEFAULT 25000,
  pickup_free         BOOLEAN     NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ┌── DIFFUSERS ────────────────────────────────────────────┐
CREATE TABLE IF NOT EXISTS diffusers.delivery_zones (
  zone_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL UNIQUE,
  scope         TEXT        NOT NULL CHECK (scope IN ('lagos','nationwide')),
  match_terms   TEXT[]      NOT NULL DEFAULT '{}',
  rate          NUMERIC(12,2) NOT NULL CHECK (rate >= 0),
  is_default    BOOLEAN     NOT NULL DEFAULT false,
  display_order INTEGER     NOT NULL DEFAULT 0,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diffusers.delivery_settings (
  id                  INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lagos_state_name    TEXT        NOT NULL DEFAULT 'Lagos',
  bulk_threshold      INTEGER     NOT NULL DEFAULT 10 CHECK (bulk_threshold > 0),
  bulk_fee_lagos      NUMERIC(12,2) NOT NULL DEFAULT 15000,
  bulk_fee_nationwide NUMERIC(12,2) NOT NULL DEFAULT 25000,
  pickup_free         BOOLEAN     NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Seed: settings singleton ──────────────────────────────────
INSERT INTO jewelry.delivery_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
INSERT INTO diffusers.delivery_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Seed: zones (POL-062026) — applied to both businesses ─────
INSERT INTO jewelry.delivery_zones (name, scope, match_terms, rate, is_default, display_order) VALUES
  ('Zone 1: Island Core',        'lagos',      ARRAY['ikoyi','victoria island','v.i','lekki phase 1','lekki phase one'], 3500, false, 1),
  ('Zone 2: Deep Island',        'lagos',      ARRAY['chevron','ajah','sangotedo'],                                      5250, false, 2),
  ('Zone 3: Mainland Standard',  'lagos',      ARRAY['yaba','surulere','ikeja','maryland'],                              6000, true,  3),
  ('Zone 4: Mainland Outskirts', 'lagos',      ARRAY['ikorodu','festac','alimosho'],                                     8500, false, 4),
  ('Tier 1: Nationwide (South-West)',            'nationwide', ARRAY['ogun','oyo','osun','ondo','ekiti'],                          7000, false, 5),
  ('Tier 2: Nationwide (South-East & South-South)','nationwide', ARRAY['abia','anambra','ebonyi','enugu','imo','akwa ibom','bayelsa','cross river','delta','edo','rivers'], 9000, false, 6),
  ('Tier 3: Nationwide (Northern)',              'nationwide', ARRAY[]::TEXT[],                                                    11500, true, 7)
ON CONFLICT (name) DO NOTHING;

INSERT INTO diffusers.delivery_zones (name, scope, match_terms, rate, is_default, display_order) VALUES
  ('Zone 1: Island Core',        'lagos',      ARRAY['ikoyi','victoria island','v.i','lekki phase 1','lekki phase one'], 3500, false, 1),
  ('Zone 2: Deep Island',        'lagos',      ARRAY['chevron','ajah','sangotedo'],                                      5250, false, 2),
  ('Zone 3: Mainland Standard',  'lagos',      ARRAY['yaba','surulere','ikeja','maryland'],                              6000, true,  3),
  ('Zone 4: Mainland Outskirts', 'lagos',      ARRAY['ikorodu','festac','alimosho'],                                     8500, false, 4),
  ('Tier 1: Nationwide (South-West)',            'nationwide', ARRAY['ogun','oyo','osun','ondo','ekiti'],                          7000, false, 5),
  ('Tier 2: Nationwide (South-East & South-South)','nationwide', ARRAY['abia','anambra','ebonyi','enugu','imo','akwa ibom','bayelsa','cross river','delta','edo','rivers'], 9000, false, 6),
  ('Tier 3: Nationwide (Northern)',              'nationwide', ARRAY[]::TEXT[],                                                    11500, true, 7)
ON CONFLICT (name) DO NOTHING;

COMMIT;
