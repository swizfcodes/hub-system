-- ============================================================
-- 000076 — Record NGN-equivalent + currency on POS payment splits
--
-- Payment splits stored `amount` in the sale currency, so a foreign
-- tender (e.g. $100) was summed into session totals and the cash-drawer
-- expected figure as if it were ₦100, corrupting Z-reports and variance
-- for any session containing a foreign sale.
--
-- We keep `amount` as the original tender (for the receipt / audit trail)
-- and add the NGN-equivalent that all session, drawer, and reconciliation
-- math uses, plus the currency and the exchange rate the system applied.
-- Existing rows are NGN, so backfill amount_ngn = amount.
-- ============================================================

-- ── JEWELRY ──────────────────────────────────────────────────
ALTER TABLE jewelry.pos_payment_splits
  ADD COLUMN IF NOT EXISTS currency      TEXT          NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14,6) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS amount_ngn    NUMERIC(14,2);

UPDATE jewelry.pos_payment_splits
  SET amount_ngn = amount
  WHERE amount_ngn IS NULL;

-- ── DIFFUSERS ────────────────────────────────────────────────
ALTER TABLE diffusers.pos_payment_splits
  ADD COLUMN IF NOT EXISTS currency      TEXT          NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14,6) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS amount_ngn    NUMERIC(14,2);

UPDATE diffusers.pos_payment_splits
  SET amount_ngn = amount
  WHERE amount_ngn IS NULL;
