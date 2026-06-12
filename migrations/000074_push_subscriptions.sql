-- ============================================================
-- MIGRATION 000074 — Web Push subscriptions
--
-- True push notifications for in-house messaging: the browser's push
-- subscription (endpoint + encryption keys) is stored per user so the
-- server can reach them when no tab is open. A user can hold several
-- (laptop Chrome, installed iPhone PWA, …).
--
--   • endpoint is unique — re-subscribing the same browser upserts.
--   • Dead subscriptions (push service answers 404/410) are pruned
--     by the sender (lib/push).
-- ============================================================

CREATE TABLE shared.push_subscriptions (
  subscription_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES shared.users (user_id) ON DELETE CASCADE,
  endpoint        TEXT        NOT NULL UNIQUE,
  p256dh          TEXT        NOT NULL,
  auth            TEXT        NOT NULL,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ
);

CREATE INDEX idx_push_subscriptions_user ON shared.push_subscriptions (user_id);

-- ============================================================
-- Verify
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'shared' AND table_name = 'push_subscriptions';
-- ============================================================
