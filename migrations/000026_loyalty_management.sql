-- ============================================================
-- MIGRATION 000026 — Add Loyalty Management
-- Tier CRUD support + configurable loyalty settings
-- ============================================================


-- Add loyalty settings to business_config
-- Stores: points_rate, expiry_months, notifications, etc.
ALTER TABLE shared.business_config
    ADD COLUMN IF NOT EXISTS loyalty_settings jsonb DEFAULT '{
  "points_per_naira": 0.001,
  "expiry_months": 12,
  "notify_on_tier_upgrade": true,
  "tier_display_in_receipt": true
}'::jsonb NOT NULL;

-- Add updated_at to loyalty_tiers for audit tracking
ALTER TABLE jewelry.loyalty_tiers
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_by UUID;

ALTER TABLE diffusers.loyalty_tiers
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_by UUID;

-- Trigger to update loyalty_tiers.updated_at
CREATE OR REPLACE FUNCTION shared.fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- DROP-then-CREATE so the migration is safely re-runnable. PostgreSQL
-- has no CREATE TRIGGER IF NOT EXISTS, so a bare CREATE TRIGGER throws
-- "trigger already exists" on the second run.
DROP TRIGGER IF EXISTS trg_jewelry_loyalty_tiers_updated_at
  ON jewelry.loyalty_tiers;
CREATE TRIGGER trg_jewelry_loyalty_tiers_updated_at
  BEFORE UPDATE ON jewelry.loyalty_tiers
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_diffusers_loyalty_tiers_updated_at
  ON diffusers.loyalty_tiers;
CREATE TRIGGER trg_diffusers_loyalty_tiers_updated_at
  BEFORE UPDATE ON diffusers.loyalty_tiers
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- Index for tier queries
CREATE INDEX IF NOT EXISTS idx_jewelry_loyalty_tiers_active
    ON jewelry.loyalty_tiers (display_order) WHERE display_order > 0;

CREATE INDEX IF NOT EXISTS idx_diffusers_loyalty_tiers_active
    ON diffusers.loyalty_tiers (display_order) WHERE display_order > 0;
