-- ============================================================
-- Accounting Expansion Migration
-- Seeds the new chart-of-accounts codes and the system user that
-- the journal integrations (invoicing payments, purchasing, retail
-- partners, stock adjustments, gateway webhooks) depend on.
--
-- Apply to BOTH business schemas: jewelry and diffusers.
-- Account-code reference: ACCT_INTEGRATION_REPORT.md
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. System user — posted_by for machine-generated journals
--    (payment-gateway webhooks have no human actor).
--    UUID must match config.systemUserId
--    (env SYSTEM_USER_ID, default 00000000-0000-0000-0000-000000000001).
--    password_hash is a non-loginable placeholder; is_active = false
--    keeps it out of auth flows while still satisfying FK references.
-- ────────────────────────────────────────────────────────────
INSERT INTO shared.users
  (user_id, email, password_hash, is_active, force_password_reset,
   default_business, permitted_businesses)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   'system@orika.internal',
   '!', -- intentionally invalid bcrypt hash — cannot be used to log in
   false,
   false,
   'jewelry',
   ARRAY['jewelry', 'diffusers'])
ON CONFLICT (user_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 2. New COA accounts — JEWELRY schema
-- ────────────────────────────────────────────────────────────

-- Purchasing
INSERT INTO jewelry.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('2100', 'Accounts Payable',            'liability', 'current_liability', true),
  ('2150', 'Goods Received Not Invoiced', 'liability', 'current_liability', true)
ON CONFLICT (account_code) DO NOTHING;

-- Retail partners / consignment
INSERT INTO jewelry.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('1350', 'Retail Partner Receivable',   'asset',     'current_asset',     false),
  ('1430', 'Consignment Stock',           'asset',     'current_asset',     false)
ON CONFLICT (account_code) DO NOTHING;

-- Stock adjustments
INSERT INTO jewelry.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('4900', 'Stock Adjustment Income',     'income',    'other_income',      false),
  ('6900', 'Inventory Write-off',         'expense',   'operating_expense', false)
ON CONFLICT (account_code) DO NOTHING;

-- Non-PO purchases (bills with no goods-receipt accrual)
INSERT INTO jewelry.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('6700', 'Purchases — Non-stock',       'expense',   'cost_of_goods',     false)
ON CONFLICT (account_code) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 3. New COA accounts — DIFFUSERS schema
-- ────────────────────────────────────────────────────────────

-- Purchasing
INSERT INTO diffusers.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('2100', 'Accounts Payable',            'liability', 'current_liability', true),
  ('2150', 'Goods Received Not Invoiced', 'liability', 'current_liability', true)
ON CONFLICT (account_code) DO NOTHING;

-- Retail partners / consignment
INSERT INTO diffusers.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('1350', 'Retail Partner Receivable',   'asset',     'current_asset',     false),
  ('1430', 'Consignment Stock',           'asset',     'current_asset',     false)
ON CONFLICT (account_code) DO NOTHING;

-- Stock adjustments
INSERT INTO diffusers.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('4900', 'Stock Adjustment Income',     'income',    'other_income',      false),
  ('6900', 'Inventory Write-off',         'expense',   'operating_expense', false)
ON CONFLICT (account_code) DO NOTHING;

-- Non-PO purchases
INSERT INTO diffusers.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('6700', 'Purchases — Non-stock',       'expense',   'cost_of_goods',     false)
ON CONFLICT (account_code) DO NOTHING;

COMMIT;
