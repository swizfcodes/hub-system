-- ─────────────────────────────────────────────────────────────
-- 000048 — Email branding fields on business_config
--
-- Adds the columns needed for fully settings-driven branded
-- transactional emails:
--   • secondary_colour  — softer tone for email section backgrounds / dividers
--   • social_links      — per-brand social media URLs (only populated ones render)
--   • email_footer_text — custom legal / compliance footer per brand
--
-- Also backfills sensible defaults for the two existing businesses.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE shared.business_config
    ADD COLUMN IF NOT EXISTS secondary_colour  TEXT DEFAULT '#F5F0EB',
    ADD COLUMN IF NOT EXISTS social_links       JSONB DEFAULT '{}'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS email_footer_text  TEXT;

COMMENT ON COLUMN shared.business_config.secondary_colour IS
    'Softer brand tone used for email section backgrounds, borders and dividers';
COMMENT ON COLUMN shared.business_config.social_links IS
    'Per-brand social URLs: {"instagram":"https://...","facebook":"https://...","tiktok":"https://...",...}. Only populated keys render in emails.';
COMMENT ON COLUMN shared.business_config.email_footer_text IS
    'Custom legal / compliance footer line appended to every transactional email for this brand';
