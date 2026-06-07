-- ============================================================
-- MIGRATION 000052 — POS offline sync idempotency key
--
-- Adds pos_transactions.offline_id so the offline POS queue
-- (POST /pos/sync) can be replayed idempotently: the client stamps
-- each queued sale with a stable offline_id, and the partial UNIQUE
-- index guarantees a re-sent batch can never create a duplicate sale
-- (and its duplicate revenue/COGS journals).
--
-- Nullable — online sales leave it NULL. The unique index is partial
-- (WHERE offline_id IS NOT NULL) so NULLs don't collide.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
-- ============================================================

ALTER TABLE jewelry.pos_transactions   ADD COLUMN IF NOT EXISTS offline_id UUID;
ALTER TABLE diffusers.pos_transactions ADD COLUMN IF NOT EXISTS offline_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_jewelry_pos_tx_offline_id
  ON jewelry.pos_transactions (offline_id) WHERE offline_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_diffusers_pos_tx_offline_id
  ON diffusers.pos_transactions (offline_id) WHERE offline_id IS NOT NULL;
