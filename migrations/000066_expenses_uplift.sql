-- ============================================================
-- MIGRATION 000066 — Expenses module uplift
--
-- 1. Vendor expenses: profile_id becomes optional; vendor_name /
--    vendor_contact_id added so bills from suppliers (JBS Praxis,
--    TheCodeHive, Truehost, …) can be tracked, not just staff claims.
-- 2. Partial payments: expense_payments ledger + amount_paid rollup
--    + 'partially_paid' status so milestone invoices carry a live
--    outstanding balance.
-- 3. expense_type expanded to match the UI:
--    reimbursement | petty_cash | direct_payment | cash_advance_retirement
-- 4. auto_approved flag + submitted_by for audit.
-- 5. COA gap-fill: petty cash + operating expense accounts that the
--    category→account mapping needs (idempotent).
-- 6. cash_advances gains a 'rejected' status (UI already shows it).
-- ============================================================

-- ┌── JEWELRY ──────────────────────────────────────────────┐

ALTER TABLE jewelry.expenses ALTER COLUMN profile_id DROP NOT NULL;

ALTER TABLE jewelry.expenses
  ADD COLUMN IF NOT EXISTS vendor_name        TEXT,
  ADD COLUMN IF NOT EXISTS vendor_contact_id  UUID REFERENCES shared.contacts (contact_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by       UUID REFERENCES shared.users (user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount_paid        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  ADD COLUMN IF NOT EXISTS auto_approved      BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE jewelry.expenses DROP CONSTRAINT IF EXISTS expenses_expense_type_check;
ALTER TABLE jewelry.expenses ADD CONSTRAINT expenses_expense_type_check
  CHECK (expense_type IN ('reimbursement','petty_cash','direct_payment','cash_advance_retirement'));

ALTER TABLE jewelry.expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE jewelry.expenses ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('pending','approved','rejected','partially_paid','paid'));

-- Every expense needs a payee: a staff member OR a vendor
ALTER TABLE jewelry.expenses DROP CONSTRAINT IF EXISTS chk_expenses_payee;
ALTER TABLE jewelry.expenses ADD CONSTRAINT chk_expenses_payee
  CHECK (profile_id IS NOT NULL OR vendor_name IS NOT NULL OR vendor_contact_id IS NOT NULL);

-- Paid expenses created before this migration: treat as fully paid
UPDATE jewelry.expenses SET amount_paid = amount WHERE status = 'paid' AND amount_paid = 0;

CREATE TABLE IF NOT EXISTS jewelry.expense_payments (
  payment_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id     UUID          NOT NULL REFERENCES jewelry.expenses (expense_id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
  method         TEXT          NOT NULL DEFAULT 'bank_transfer'
                 CHECK (method IN ('bank_transfer','cash','card','petty_cash','other')),
  reference      TEXT,
  notes          TEXT,
  recorded_by    UUID          REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jewelry_expense_payments ON jewelry.expense_payments (expense_id, payment_date DESC);

ALTER TABLE jewelry.cash_advances DROP CONSTRAINT IF EXISTS cash_advances_status_check;
ALTER TABLE jewelry.cash_advances ADD CONSTRAINT cash_advances_status_check
  CHECK (status IN ('pending','approved','disbursed','settled','rejected','cancelled'));

INSERT INTO jewelry.chart_of_accounts (account_code, account_name, account_type, account_subtype, is_system) VALUES
  ('1110', 'Petty Cash',               'asset',   'current_asset',     false),
  ('6810', 'Software & Subscriptions', 'expense', 'operating_expense', false),
  ('6820', 'Professional Fees',        'expense', 'operating_expense', false),
  ('6830', 'Insurance',                'expense', 'operating_expense', false),
  ('6840', 'Utilities',                'expense', 'operating_expense', false),
  ('6850', 'Repairs & Maintenance',    'expense', 'operating_expense', false),
  ('6860', 'Meals & Entertainment',    'expense', 'operating_expense', false)
ON CONFLICT (account_code) DO NOTHING;

-- ┌── DIFFUSERS ────────────────────────────────────────────┐

ALTER TABLE diffusers.expenses ALTER COLUMN profile_id DROP NOT NULL;

ALTER TABLE diffusers.expenses
  ADD COLUMN IF NOT EXISTS vendor_name        TEXT,
  ADD COLUMN IF NOT EXISTS vendor_contact_id  UUID REFERENCES shared.contacts (contact_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by       UUID REFERENCES shared.users (user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount_paid        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  ADD COLUMN IF NOT EXISTS auto_approved      BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE diffusers.expenses DROP CONSTRAINT IF EXISTS expenses_expense_type_check;
ALTER TABLE diffusers.expenses ADD CONSTRAINT expenses_expense_type_check
  CHECK (expense_type IN ('reimbursement','petty_cash','direct_payment','cash_advance_retirement'));

ALTER TABLE diffusers.expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE diffusers.expenses ADD CONSTRAINT expenses_status_check
  CHECK (status IN ('pending','approved','rejected','partially_paid','paid'));

ALTER TABLE diffusers.expenses DROP CONSTRAINT IF EXISTS chk_expenses_payee;
ALTER TABLE diffusers.expenses ADD CONSTRAINT chk_expenses_payee
  CHECK (profile_id IS NOT NULL OR vendor_name IS NOT NULL OR vendor_contact_id IS NOT NULL);

UPDATE diffusers.expenses SET amount_paid = amount WHERE status = 'paid' AND amount_paid = 0;

CREATE TABLE IF NOT EXISTS diffusers.expense_payments (
  payment_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id     UUID          NOT NULL REFERENCES diffusers.expenses (expense_id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
  method         TEXT          NOT NULL DEFAULT 'bank_transfer'
                 CHECK (method IN ('bank_transfer','cash','card','petty_cash','other')),
  reference      TEXT,
  notes          TEXT,
  recorded_by    UUID          REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diffusers_expense_payments ON diffusers.expense_payments (expense_id, payment_date DESC);

ALTER TABLE diffusers.cash_advances DROP CONSTRAINT IF EXISTS cash_advances_status_check;
ALTER TABLE diffusers.cash_advances ADD CONSTRAINT cash_advances_status_check
  CHECK (status IN ('pending','approved','disbursed','settled','rejected','cancelled'));

INSERT INTO diffusers.chart_of_accounts (account_code, account_name, account_type, account_subtype, is_system) VALUES
  ('1110', 'Petty Cash',               'asset',   'current_asset',     false),
  ('6800', 'Staff Expenses',           'expense', 'operating_expense', false),
  ('6810', 'Software & Subscriptions', 'expense', 'operating_expense', false),
  ('6820', 'Professional Fees',        'expense', 'operating_expense', false),
  ('6830', 'Insurance',                'expense', 'operating_expense', false),
  ('6840', 'Utilities',                'expense', 'operating_expense', false),
  ('6850', 'Repairs & Maintenance',    'expense', 'operating_expense', false),
  ('6860', 'Meals & Entertainment',    'expense', 'operating_expense', false)
ON CONFLICT (account_code) DO NOTHING;
