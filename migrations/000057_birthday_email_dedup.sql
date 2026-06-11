-- Columns
ALTER TABLE shared.contacts ADD COLUMN IF NOT EXISTS birthday_month           SMALLINT;
ALTER TABLE shared.contacts ADD COLUMN IF NOT EXISTS birthday_day             SMALLINT;
ALTER TABLE shared.contacts ADD COLUMN IF NOT EXISTS birthday_email_sent_year TEXT;

-- Constraints: drop-then-recreate is safe since they are pure checks
-- (no data depends on them; re-adding the same rule is idempotent in effect)
ALTER TABLE shared.contacts DROP CONSTRAINT IF EXISTS contacts_birthday_month_check;
ALTER TABLE shared.contacts ADD  CONSTRAINT         contacts_birthday_month_check
  CHECK (birthday_month IS NULL OR birthday_month BETWEEN 1 AND 12);

ALTER TABLE shared.contacts DROP CONSTRAINT IF EXISTS contacts_birthday_day_check;
ALTER TABLE shared.contacts ADD  CONSTRAINT         contacts_birthday_day_check
  CHECK (birthday_day IS NULL OR birthday_day BETWEEN 1 AND 31);

ALTER TABLE shared.contacts DROP CONSTRAINT IF EXISTS contacts_birthday_year_check;
ALTER TABLE shared.contacts ADD  CONSTRAINT         contacts_birthday_year_check
  CHECK (birthday_email_sent_year ~ '^\d{4}$' OR birthday_email_sent_year IS NULL);

-- Index
CREATE INDEX IF NOT EXISTS idx_contacts_birthday_lookup
  ON shared.contacts (birthday_month, birthday_day)
  WHERE email IS NOT NULL AND is_deleted = false;

-- Comments
COMMENT ON COLUMN shared.contacts.birthday_month IS
  '1-indexed birth month (1 = January). No year stored — anniversary-style.';
COMMENT ON COLUMN shared.contacts.birthday_day IS
  'Day of birth (1–31). Paired with birthday_month for the annual birthday query.';
COMMENT ON COLUMN shared.contacts.birthday_email_sent_year IS
  'Calendar year (e.g. ''2026'') in which the last birthday greeting was sent. '
  'Set by jobs/sendBirthdayEmails.js to prevent duplicate sends within a year.';