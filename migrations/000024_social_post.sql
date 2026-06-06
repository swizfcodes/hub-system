-- ============================================================
-- MIGRATION 000024 — Social Media Scheduling (Module 14)
-- Hub Platform · JBS Praxis
--
-- Adds the schema needed to schedule, publish, and track posts
-- across the four social channels the platform integrates with:
-- Instagram, Facebook, TikTok, YouTube.
--
-- This migration is idempotent — every statement uses IF (NOT)
-- EXISTS, so re-running it is safe.
--
-- Tables (both shared, since social posts are brand-level
-- advertising rather than financial records):
--   1. shared.social_posts          — the post content + schedule
--   2. shared.social_post_metrics   — daily engagement snapshots
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. social_posts
--
-- One row per logical post. A single post can be published to
-- multiple channels (an Instagram + Facebook cross-post is one
-- row with channels = ['instagram','facebook']).
--
-- Lifecycle:
--   draft        → user is composing, not yet scheduled
--   scheduled    → ready to publish at scheduled_at
--   publishing   → in-flight (scheduler picked it up)
--   published    → all channels succeeded
--   partial      → some channels succeeded, some failed
--   failed       → all channels failed
--   cancelled    → user cancelled before scheduled_at
--
-- channels and media_paths are TEXT[] (Postgres arrays) — simple
-- enough that JSONB would be overkill. external_ids is JSONB
-- because the shape varies per platform (Instagram returns one
-- id, TikTok returns a publish_id, YouTube returns a video id).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shared.social_posts (
    post_id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    business         text        NOT NULL,
    channels         text[]      NOT NULL,
    caption          text,
    -- For YouTube + TikTok (video uploads): title and description
    -- are distinct from caption. For image posts (IG/FB) they are
    -- unused. Stored together so a single post row can drive all
    -- four channels.
    title            text,
    description      text,
    media_paths      text[]      NOT NULL DEFAULT ARRAY[]::text[],
    -- video_path used only by TikTok and YouTube. Kept separate
    -- from media_paths (which is for image arrays on IG/FB).
    video_path       text,
    scheduled_at     timestamp with time zone NOT NULL,
    published_at     timestamp with time zone,
    status           text        NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('draft','scheduled','publishing',
                                        'published','partial','failed','cancelled')),
    -- Map of channel name → external id (or error message on failure).
    -- Example shape:
    --   {
    --     "instagram": {"status":"published","postId":"17841…"},
    --     "facebook":  {"status":"published","postId":"110218…_309…"},
    --     "tiktok":    {"status":"failed","error":"rate_limited"}
    --   }
    external_ids     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- Optional reference back to the marketing campaign this post
    -- belongs to (Module 13). Lets the dashboard count organic
    -- posts that drove a campaign.
    campaign_id      uuid,
    created_by       uuid,
    created_at       timestamp with time zone NOT NULL DEFAULT now(),
    updated_at       timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_business
    ON shared.social_posts(business);

-- The scheduler hits this every 5 minutes to find what's due.
-- A partial index keeps it tiny — only scheduled rows that haven't
-- fired yet.
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled_pickup
    ON shared.social_posts(scheduled_at)
    WHERE status = 'scheduled';

-- For the "all posts in this campaign" dashboard query.
CREATE INDEX IF NOT EXISTS idx_social_posts_campaign
    ON shared.social_posts(campaign_id)
    WHERE campaign_id IS NOT NULL;

-- For the "what did we post last week" page.
CREATE INDEX IF NOT EXISTS idx_social_posts_published_at
    ON shared.social_posts(business, published_at DESC)
    WHERE status IN ('published','partial');

-- Bump updated_at on every row change so the UI can show recency.
CREATE TRIGGER trg_social_posts_updated_at
    BEFORE UPDATE ON shared.social_posts
    FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

COMMENT ON TABLE shared.social_posts IS
    'Scheduled and published social media posts. Module 14 — Social Media Management.';


-- ─────────────────────────────────────────────────────────────
-- 2. social_post_metrics
--
-- One row per (post, channel, fetch date). The metric-refresh
-- cron polls each platform's analytics API and records a snapshot
-- daily, so engagement trends can be charted over time.
--
-- post_id is NOT a foreign key on purpose — keeping metrics decoupled
-- from the parent post means deleting a post (rare but possible —
-- e.g. accidentally scheduling something off-brand) doesn't blow
-- away the engagement audit trail. The post_id will simply orphan;
-- the dashboard JOIN handles missing parents gracefully.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shared.social_post_metrics (
    metric_id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id          uuid        NOT NULL,
    channel          text        NOT NULL
                     CHECK (channel IN ('instagram','facebook','tiktok','youtube')),
    fetched_at       timestamp with time zone NOT NULL DEFAULT now(),
    likes            integer     NOT NULL DEFAULT 0,
    comments         integer     NOT NULL DEFAULT 0,
    shares           integer     NOT NULL DEFAULT 0,
    saves            integer     NOT NULL DEFAULT 0,
    reach            integer     NOT NULL DEFAULT 0,
    impressions      integer     NOT NULL DEFAULT 0,
    -- Per-channel extras (video views for TikTok/YouTube,
    -- profile-visits for Instagram, etc.). Optional.
    extras           jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_social_post_metrics_post
    ON shared.social_post_metrics(post_id, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_post_metrics_recent
    ON shared.social_post_metrics(channel, fetched_at DESC);

COMMENT ON TABLE shared.social_post_metrics IS
    'Engagement snapshots for published social posts. Module 14 — Social Media Management.';

