-- ============================================================
-- Campaigns + Messaging — saved segments, WhatsApp templates,
-- thread assignment/status, message reactions.
-- ============================================================

BEGIN;

-- ── CAMPAIGNS: saved segments (per business schema) ──────────
CREATE TABLE IF NOT EXISTS jewelry.saved_segments (
  segment_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  description   TEXT,
  filter        JSONB       NOT NULL DEFAULT '{}',
  created_by    UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jewelry_saved_segments_name
  ON jewelry.saved_segments (name);

CREATE TABLE IF NOT EXISTS diffusers.saved_segments (
  segment_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  description   TEXT,
  filter        JSONB       NOT NULL DEFAULT '{}',
  created_by    UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diffusers_saved_segments_name
  ON diffusers.saved_segments (name);

-- ── CAMPAIGNS: WhatsApp template library (per business schema) ─
CREATE TABLE IF NOT EXISTS jewelry.whatsapp_templates (
  template_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT        NOT NULL,
  display_name  TEXT        NOT NULL,
  category      TEXT        NOT NULL
                CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  language      TEXT        NOT NULL DEFAULT 'en',
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','disabled')),
  body_text     TEXT        NOT NULL,
  variables     JSONB       NOT NULL DEFAULT '[]',
  header_text   TEXT,
  footer_text   TEXT,
  created_by    UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diffusers.whatsapp_templates (
  template_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT        NOT NULL,
  display_name  TEXT        NOT NULL,
  category      TEXT        NOT NULL
                CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION')),
  language      TEXT        NOT NULL DEFAULT 'en',
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','disabled')),
  body_text     TEXT        NOT NULL,
  variables     JSONB       NOT NULL DEFAULT '[]',
  header_text   TEXT,
  footer_text   TEXT,
  created_by    UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── MESSAGING: thread assignment + status ────────────────────
ALTER TABLE shared.message_channels
  ADD COLUMN IF NOT EXISTS assigned_to UUID
    REFERENCES shared.users (user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','resolved'));

CREATE INDEX IF NOT EXISTS idx_message_channels_assigned
  ON shared.message_channels (assigned_to)
  WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_message_channels_status
  ON shared.message_channels (status);

-- ── MESSAGING: emoji reactions ───────────────────────────────
CREATE TABLE IF NOT EXISTS shared.message_reactions (
  reaction_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   UUID        NOT NULL REFERENCES shared.messages (message_id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES shared.users    (user_id)    ON DELETE CASCADE,
  emoji        TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_reactions_message
  ON shared.message_reactions (message_id);

COMMIT;
