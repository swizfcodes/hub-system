-- ─────────────────────────────────────────────────────────────
-- 000061 — In-house messaging uplift (WhatsApp-style internal chat)
--
-- 1. Message edits, forwards and per-user stars
-- 2. Per-member pinned / muted conversations
-- 3. Group channel description
-- 4. User presence (last_seen_at)
-- 5. shared.email_log — audit of every outbound email (invoices,
--    payslips, quotations, campaigns) surfaced in the Messaging UI
-- ─────────────────────────────────────────────────────────────

-- ── messages: edit + forward markers ─────────────────────────
ALTER TABLE shared.messages
  ADD COLUMN IF NOT EXISTS edited_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_forwarded BOOLEAN NOT NULL DEFAULT false;

-- ── message_stars: per-user starred messages ─────────────────
CREATE TABLE IF NOT EXISTS shared.message_stars (
  message_id  UUID        NOT NULL REFERENCES shared.messages (message_id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES shared.users (user_id) ON DELETE CASCADE,
  starred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_stars_user
  ON shared.message_stars (user_id, starred_at DESC);

-- ── channel_members: pin / mute per member ───────────────────
ALTER TABLE shared.channel_members
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_muted  BOOLEAN NOT NULL DEFAULT false;

-- ── message_channels: group description ──────────────────────
ALTER TABLE shared.message_channels
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ── users: presence ──────────────────────────────────────────
ALTER TABLE shared.users
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- ── email_log: outbound email audit trail ────────────────────
CREATE TABLE IF NOT EXISTS shared.email_log (
  email_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient       TEXT        NOT NULL,
  subject         TEXT,
  business        TEXT,
  sender_user_id  UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  status          TEXT        NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('sent','failed')),
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_created
  ON shared.email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_recipient
  ON shared.email_log (recipient);
