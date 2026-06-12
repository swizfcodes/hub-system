-- ============================================================
-- 000075 — Add vat_exempt flag to POS transactions
--
-- The POS checkout exposes a VAT toggle. When VAT is switched off
-- the sale is recorded with zero VAT and this flag is set so any
-- downstream document (e.g. an invoice generated from the sale)
-- recomputes VAT consistently rather than re-adding it.
-- ============================================================

-- ── JEWELRY ──────────────────────────────────────────────────
ALTER TABLE jewelry.pos_transactions
  ADD COLUMN IF NOT EXISTS vat_exempt BOOLEAN NOT NULL DEFAULT false;

-- ── DIFFUSERS ────────────────────────────────────────────────
ALTER TABLE diffusers.pos_transactions
  ADD COLUMN IF NOT EXISTS vat_exempt BOOLEAN NOT NULL DEFAULT false;
