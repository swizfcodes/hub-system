-- ============================================================
-- Security Module — invite tokens, optional TOTP 2FA, and
-- security/settings permission seeds.
-- Apply once (shared schema) — invite_tokens & users are shared.
-- ============================================================

BEGIN;

-- ── Invite tokens ──────────────────────────────────────────────
-- One-time, single-use links for new-user onboarding. Raw token is
-- emailed; only its SHA-256 hash is stored. Expires after 1 hour.
CREATE TABLE IF NOT EXISTS shared.invite_tokens (
  token_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  TEXT        NOT NULL UNIQUE,
  email       TEXT        NOT NULL,
  role_id     UUID        NOT NULL REFERENCES shared.roles(role_id) ON DELETE CASCADE,
  businesses  TEXT[]      NOT NULL DEFAULT ARRAY['jewelry'],
  invited_by  UUID        NOT NULL REFERENCES shared.users(user_id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '1 hour',
  used_at     TIMESTAMPTZ,
  metadata    JSONB       NOT NULL DEFAULT '{}'  -- {display_name, job_title}
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_hash    ON shared.invite_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_email   ON shared.invite_tokens (email);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_expires ON shared.invite_tokens (expires_at)
  WHERE used_at IS NULL;

-- ── Optional TOTP 2FA (per user) ──────────────────────────────
ALTER TABLE shared.users
  ADD COLUMN IF NOT EXISTS totp_secret       TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT[];

-- ── Security & settings permission seeds ──────────────────────
-- Owner (role 0001): full security/settings access.
INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
SELECT '00000001-0000-0000-0000-000000000001', m, a, 'all', '{}'
FROM unnest(ARRAY['settings','security']) m,
     unnest(ARRAY['view','create','edit','delete','approve','export']) a
ON CONFLICT (role_id, module, action) DO NOTHING;

-- Manager (role 0002): settings view/edit + security view (no approve).
INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
VALUES
  ('00000001-0000-0000-0000-000000000002', 'settings', 'view', 'all', '{}'),
  ('00000001-0000-0000-0000-000000000002', 'settings', 'edit', 'all', '{}'),
  ('00000001-0000-0000-0000-000000000002', 'security', 'view', 'all', '{}')
ON CONFLICT (role_id, module, action) DO NOTHING;

COMMIT;
