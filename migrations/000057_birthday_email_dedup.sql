-- ============================================================
-- MIGRATION 000057 — Birthday columns on shared.contacts
--
-- Adds birthday_month, birthday_day, and birthday_email_sent_year
-- to shared.contacts so that:
--   1. Birthday data can be stored directly on the contact record
--      (the single source of truth across all capture paths).
--   2. The daily sendBirthdayEmails cron can query by month/day and
--      avoid re-sending within the same calendar year.
--
-- birthday_month / birthday_day follow the same convention used on
-- shared.campaign_leads (1-indexed, no year stored).
-- birthday_email_sent_year is TEXT (e.g. '2026') — a simple equality
-- check suffices at runtime, no date arithmetic needed.
-- ============================================================

ALTER TABLE shared.contacts
  ADD COLUMN IF NOT EXISTS birthday_month SMALLINT
    CHECK (birthday_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS birthday_day SMALLINT
    CHECK (birthday_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS birthday_email_sent_year TEXT
    CHECK (birthday_email_sent_year ~ '^\d{4}$' OR birthday_email_sent_year IS NULL);

-- Fast lookup for the cron's daily birthday query:
--   WHERE birthday_month = $1 AND birthday_day = $2
--     AND email IS NOT NULL AND is_deleted = false
--     AND (birthday_email_sent_year IS NULL OR birthday_email_sent_year != $3)
CREATE INDEX IF NOT EXISTS idx_contacts_birthday_lookup
  ON shared.contacts (birthday_month, birthday_day)
  WHERE email IS NOT NULL AND is_deleted = false;

COMMENT ON COLUMN shared.contacts.birthday_month IS
  '1-indexed birth month (1 = January). No year stored — anniversary-style.';
COMMENT ON COLUMN shared.contacts.birthday_day IS
  'Day of birth (1–31). Paired with birthday_month for the annual birthday query.';
COMMENT ON COLUMN shared.contacts.birthday_email_sent_year IS
  'Calendar year (e.g. ''2026'') in which the last birthday greeting was sent. '
  'Set by jobs/sendBirthdayEmails.js to prevent duplicate sends within a year.';
