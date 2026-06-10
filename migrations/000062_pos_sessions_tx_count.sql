-- ============================================================
-- 000062 — Add total_transactions counter to pos_sessions
--
-- The updateSessionTotals query increments this on every sale.
-- Column was present in pos_session_summary but missing from
-- pos_sessions itself.
-- ============================================================

ALTER TABLE jewelry.pos_sessions
  ADD COLUMN IF NOT EXISTS total_transactions INTEGER NOT NULL DEFAULT 0;

ALTER TABLE diffusers.pos_sessions
  ADD COLUMN IF NOT EXISTS total_transactions INTEGER NOT NULL DEFAULT 0;
