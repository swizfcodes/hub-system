-- ============================================================
-- 000061 — Add currency + exchange_rate to POS transactions
--
-- Allows POS sales in USD, GBP, EUR. The stored amounts stay
-- in the sale currency; the exchange_rate captures the
-- conversion factor to NGN used at the time of sale.
-- Journals are always posted in NGN.
-- ============================================================

-- ── JEWELRY ──────────────────────────────────────────────────

ALTER TABLE jewelry.pos_transactions
  ADD COLUMN IF NOT EXISTS currency      TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14,6) DEFAULT NULL;

-- ── DIFFUSERS ────────────────────────────────────────────────

ALTER TABLE diffusers.pos_transactions
  ADD COLUMN IF NOT EXISTS currency      TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14,6) DEFAULT NULL;
