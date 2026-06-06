-- ============================================================
-- MIGRATION 000055 — Campaign QR Lead Capture
--
-- 1. Adds campaign_type to sales_campaigns (online / popup_event)
-- 2. Expands shared.campaign_leads with:
--      • first_name / last_name  (split from the old `name` field)
--      • address_city / address_state  (optional location)
--      • wants_birthday_wishes / birthday_month / birthday_day
--      • lead_source  ('qr_scan' added to lead_type CHECK)
-- 3. Keeps the existing `name` column for backwards-compat
--    (filled from first_name + last_name on insert via trigger)
-- ============================================================

-- ── 1. campaign_type on sales_campaigns (both schemas) ────────

ALTER TABLE jewelry.sales_campaigns
  ADD COLUMN IF NOT EXISTS campaign_type TEXT NOT NULL DEFAULT 'online'
    CHECK (campaign_type IN ('online','popup_event'));

ALTER TABLE diffusers.sales_campaigns
  ADD COLUMN IF NOT EXISTS campaign_type TEXT NOT NULL DEFAULT 'online'
    CHECK (campaign_type IN ('online','popup_event'));

-- ── 2. Expand shared.campaign_leads ──────────────────────────

-- Split name fields
ALTER TABLE shared.campaign_leads
  ADD COLUMN IF NOT EXISTS first_name       TEXT,
  ADD COLUMN IF NOT EXISTS last_name        TEXT,
  ADD COLUMN IF NOT EXISTS address_city     TEXT,
  ADD COLUMN IF NOT EXISTS address_state    TEXT,
  ADD COLUMN IF NOT EXISTS wants_birthday   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS birthday_month   SMALLINT CHECK (birthday_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS birthday_day     SMALLINT CHECK (birthday_day   BETWEEN 1 AND 31);

-- Widen the lead_type CHECK to include qr_scan
ALTER TABLE shared.campaign_leads
  DROP CONSTRAINT IF EXISTS campaign_leads_lead_type_check;

ALTER TABLE shared.campaign_leads
  ADD CONSTRAINT campaign_leads_lead_type_check
    CHECK (lead_type IN ('form','whatsapp_tap','qr_scan'));

-- ── 3. Index for birthday-wishes queries ─────────────────────

CREATE INDEX IF NOT EXISTS idx_campaign_leads_birthday
  ON shared.campaign_leads (birthday_month, birthday_day)
  WHERE wants_birthday = true;

CREATE INDEX IF NOT EXISTS idx_campaign_leads_business_type
  ON shared.campaign_leads (business, lead_type, created_at DESC);
