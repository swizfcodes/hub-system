-- ============================================================
-- Social — multi-account support, caption templates, hashtag sets,
-- and nullable scheduled_at (for drafts). Shared schema.
-- ============================================================


-- Drafts have no scheduled_at.
ALTER TABLE shared.social_posts
  ALTER COLUMN scheduled_at DROP NOT NULL;

-- ── Connected social accounts (per business, per platform) ────
CREATE TABLE IF NOT EXISTS shared.social_accounts (
  account_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business      TEXT        NOT NULL,
  platform      TEXT        NOT NULL
    CHECK (platform IN ('instagram','facebook','tiktok','youtube')),
  account_name  TEXT        NOT NULL,
  external_id   TEXT        NOT NULL,        -- IG business ID / FB page ID / TikTok open_id
  access_token  TEXT        NOT NULL,        -- store encrypted at rest
  page_id       TEXT,                        -- Facebook only
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business, platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_social_accounts_business
  ON shared.social_accounts (business, platform);

-- ── Caption templates ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared.social_caption_templates (
  template_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business      TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  template_text TEXT        NOT NULL,
  platforms     TEXT[]      DEFAULT ARRAY[]::TEXT[],  -- empty = all
  created_by    UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_templates_business
  ON shared.social_caption_templates (business);

-- ── Hashtag sets ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared.social_hashtag_sets (
  set_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business      TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  hashtags      TEXT[]      NOT NULL,
  platforms     TEXT[]      DEFAULT ARRAY[]::TEXT[],
  created_by    UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_hashtag_sets_business
  ON shared.social_hashtag_sets (business);

