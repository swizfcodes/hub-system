-- ============================================================
-- 000078 — Quick-login PIN
--
-- Adds an optional 6-digit numeric PIN as a convenience alternative
-- to the full password at login. Users opt in (setting a PIN always
-- requires the current password), and the PIN is bcrypt-hashed just
-- like the password — never stored in clear.
--
-- A 6-digit PIN is low-entropy (1,000,000 combinations), so it gets
-- its OWN throttle: failed_pin_attempts / pin_locked_until, separate
-- from the password's failed_login_attempts / locked_until. That way
-- fat-fingering the PIN locks only PIN login for a cooldown and never
-- locks the account out of password login.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS); existing users simply have a
-- NULL pin_hash (no PIN set) until they choose to create one.
-- ============================================================

ALTER TABLE shared.users
  ADD COLUMN IF NOT EXISTS pin_hash            TEXT,
  ADD COLUMN IF NOT EXISTS pin_set_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_pin_attempts SMALLINT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until    TIMESTAMPTZ;
