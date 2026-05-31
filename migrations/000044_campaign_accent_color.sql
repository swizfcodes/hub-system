-- ============================================================
-- MIGRATION 000044 — Sales campaign accent colour
--
-- Adds a per-campaign accent colour used to theme the public
-- landing page (CTA buttons, prices, badges). Defaults to the
-- house gold (#C9A86C). Selectable from the campaign builder.
-- ============================================================

BEGIN;

ALTER TABLE jewelry.sales_campaigns
  ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#C9A86C';

ALTER TABLE diffusers.sales_campaigns
  ADD COLUMN IF NOT EXISTS accent_color TEXT NOT NULL DEFAULT '#C9A86C';

COMMIT;
