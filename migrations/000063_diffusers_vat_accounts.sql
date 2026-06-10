-- ============================================================
-- 000063 — Seed missing VAT sub-accounts for diffusers
--
-- Jewelry had 2210 + 2220 from the original seed; diffusers
-- only had the parent 2200. The POS revenue journal looks up
-- 2210 specifically, so its absence causes DR ≠ CR.
-- Also inserts into jewelry with ON CONFLICT to be safe.
-- ============================================================

-- ── DIFFUSERS ───────────────────────────────────────────────
INSERT INTO diffusers.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('2210', 'Output VAT',  'liability', 'current_liability', false),
  ('2220', 'Input VAT',   'liability', 'current_liability', false),
  ('2400', 'Customer Deposits', 'liability', 'current_liability', false)
ON CONFLICT (account_code) DO NOTHING;

-- ── JEWELRY (safe no-op if already present) ─────────────────
INSERT INTO jewelry.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('2210', 'Output VAT',  'liability', 'current_liability', false),
  ('2220', 'Input VAT',   'liability', 'current_liability', false)
ON CONFLICT (account_code) DO NOTHING;
