-- ============================================================
-- MIGRATION 000072 — Self-service password reset (OTP by email)
--
-- "Forgot password" on the login page: a 6-digit OTP is emailed,
-- verified, and the password reset — admin reset becomes the last
-- resort instead of the only path.
--
-- Security model (mirrors shared.invite_tokens):
--   • Only the SHA-256 hash of the OTP is stored.
--   • 10-minute expiry, single-use (used_at), max 5 verify attempts.
--   • One active OTP per user — requesting a new one deletes the old.
-- ============================================================

CREATE TABLE IF NOT EXISTS shared.password_reset_otps (
  reset_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES shared.users (user_id) ON DELETE CASCADE,
  otp_hash    TEXT        NOT NULL,
  attempts    INTEGER     NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes',
  used_at     TIMESTAMPTZ,
  request_ip  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user ON shared.password_reset_otps (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_expires ON shared.password_reset_otps (expires_at)
  WHERE used_at IS NULL;
