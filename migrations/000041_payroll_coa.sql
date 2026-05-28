-- ============================================================
-- Payroll — chart-of-accounts seeds required by payroll journals.
-- Apply to BOTH business schemas: jewelry and diffusers.
-- ============================================================

BEGIN;

-- JEWELRY
INSERT INTO jewelry.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('6110', 'Salaries & Wages',         'expense',   'payroll_expense',   true),
  ('6120', 'Employer Pension Expense', 'expense',   'payroll_expense',   true),
  ('2310', 'PAYE Payable',             'liability', 'current_liability', true),
  ('2320', 'Pension Payable',          'liability', 'current_liability', true),
  ('2330', 'NHF Payable',              'liability', 'current_liability', true)
ON CONFLICT (account_code) DO NOTHING;

-- DIFFUSERS
INSERT INTO diffusers.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system)
VALUES
  ('6110', 'Salaries & Wages',         'expense',   'payroll_expense',   true),
  ('6120', 'Employer Pension Expense', 'expense',   'payroll_expense',   true),
  ('2310', 'PAYE Payable',             'liability', 'current_liability', true),
  ('2320', 'Pension Payable',          'liability', 'current_liability', true),
  ('2330', 'NHF Payable',              'liability', 'current_liability', true)
ON CONFLICT (account_code) DO NOTHING;

COMMIT;
