-- ============================================================
-- 000074 — Ensure an "Other Income" account exists for retained change
--
-- The POS "keep change" option books an overpayment the customer chose
-- to leave behind to Other Income (4400). Jewelry already has 4400 from
-- the original seed; diffusers only seeded sales_revenue income accounts,
-- so the lookup would fail and roll the sale back. Insert it where missing.
-- Idempotent — safe no-op if the account already exists.
-- ============================================================

-- ── DIFFUSERS ───────────────────────────────────────────────
INSERT INTO diffusers.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('4400', 'Other Income', 'income', 'other_income', false)
ON CONFLICT (account_code) DO NOTHING;

-- ── JEWELRY (safe no-op if already present) ─────────────────
INSERT INTO jewelry.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('4400', 'Other Income', 'income', 'other_income', false)
ON CONFLICT (account_code) DO NOTHING;
