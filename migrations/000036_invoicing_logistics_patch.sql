-- ============================================================
-- Invoicing & Logistics Patch Migration
-- Apply to BOTH schemas: jewelry and diffusers
-- ============================================================

-- ── INVOICING ────────────────────────────────────────────────

-- COA: Bad Debt Expense account (required by write-off journal)
INSERT INTO jewelry.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('6000', 'Bad Debt Expense', 'expense', 'operating_expense', true)
ON CONFLICT (account_code) DO NOTHING;

-- ── LOGISTICS ────────────────────────────────────────────────

-- 1. Add 'relay' to courier CHECK constraints
ALTER TABLE jewelry.deliveries
  DROP CONSTRAINT IF EXISTS deliveries_courier_check;

ALTER TABLE jewelry.courier_webhooks
  DROP CONSTRAINT IF EXISTS courier_webhooks_courier_check;

ALTER TABLE jewelry.deliveries
  ADD CONSTRAINT deliveries_courier_check
  CHECK (courier IN ('relay', 'chowdeck', 'gigl', 'manual'));

ALTER TABLE jewelry.courier_webhooks
  ADD CONSTRAINT courier_webhooks_courier_check
  CHECK (courier IN ('relay', 'chowdeck', 'gigl'));

-- 2. Signature columns on deliveries
ALTER TABLE jewelry.deliveries
  ADD COLUMN IF NOT EXISTS signature_token    TEXT        UNIQUE,
  ADD COLUMN IF NOT EXISTS customer_signature TEXT,
  ADD COLUMN IF NOT EXISTS driver_signature   TEXT,
  ADD COLUMN IF NOT EXISTS customer_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS driver_signed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS token_expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_at          TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jewelry_deliveries_signature_token
  ON jewelry.deliveries (signature_token)
  WHERE signature_token IS NOT NULL;

-- 3. Business column on deliveries (used by sign service for multi-schema lookup)
ALTER TABLE jewelry.deliveries
  ADD COLUMN IF NOT EXISTS business TEXT NOT NULL DEFAULT 'jewelry';


INSERT INTO diffusers.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('6000', 'Bad Debt Expense', 'expense', 'operating_expense', true)
ON CONFLICT (account_code) DO NOTHING;

-- 1. Add 'relay' to courier CHECK constraints
ALTER TABLE diffusers.deliveries
  DROP CONSTRAINT IF EXISTS deliveries_courier_check;

ALTER TABLE diffusers.courier_webhooks
  DROP CONSTRAINT IF EXISTS courier_webhooks_courier_check;

ALTER TABLE diffusers.deliveries
  ADD CONSTRAINT deliveries_courier_check
  CHECK (courier IN ('relay', 'chowdeck', 'gigl', 'manual'));

ALTER TABLE diffusers.courier_webhooks
  ADD CONSTRAINT courier_webhooks_courier_check
  CHECK (courier IN ('relay', 'chowdeck', 'gigl'));

-- 2. Signature columns on deliveries
ALTER TABLE diffusers.deliveries
  ADD COLUMN IF NOT EXISTS signature_token    TEXT        UNIQUE,
  ADD COLUMN IF NOT EXISTS customer_signature TEXT,
  ADD COLUMN IF NOT EXISTS driver_signature   TEXT,
  ADD COLUMN IF NOT EXISTS customer_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS driver_signed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS token_expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_at          TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_diffusers_deliveries_signature_token
  ON diffusers.deliveries (signature_token)
  WHERE signature_token IS NOT NULL;

-- 3. Business column on deliveries (used by sign service for multi-schema lookup)
ALTER TABLE diffusers.deliveries
  ADD COLUMN IF NOT EXISTS business TEXT NOT NULL DEFAULT 'diffusers';