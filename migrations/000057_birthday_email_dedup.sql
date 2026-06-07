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
-- Uses DO $$ blocks with EXCEPTION WHEN duplicate_column so the
-- migration is safely re-runnable if it was partially applied.
-- ============================================================

DO $$
BEGIN
  ALTER TABLE shared.contacts ADD COLUMN birthday_month SMALLINT;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE shared.contacts ADD COLUMN birthday_day SMALLINT;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE shared.contacts ADD COLUMN birthday_email_sent_year TEXT;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- CHECK constraints (add only if not already present)
DO $$
BEGIN
  ALTER TABLE shared.contacts
    ADD CONSTRAINT contacts_birthday_month_check
      CHECK (birthday_month IS NULL OR birthday_month BETWEEN 1 AND 12);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE shared.contacts
    ADD CONSTRAINT contacts_birthday_day_check
      CHECK (birthday_day IS NULL OR birthday_day BETWEEN 1 AND 31);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE shared.contacts
    ADD CONSTRAINT contacts_birthday_year_check
      CHECK (birthday_email_sent_year ~ '^\d{4}$' OR birthday_email_sent_year IS NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for the cron's daily birthday query
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
