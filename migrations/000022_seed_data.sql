-- ============================================================
-- MIGRATION 000022 — Seed data
-- System roles, default permissions, business config,
-- document sequences, tax rates, chart of accounts,
-- pipeline stage definitions, loyalty tiers
-- ============================================================

-- ── System roles ──────────────────────────────────────────
INSERT INTO shared.roles (role_id, role_name, business, is_system, description) VALUES
  ('00000001-0000-0000-0000-000000000001', 'owner',         NULL, true,  'Full access to all modules and all businesses'),
  ('00000001-0000-0000-0000-000000000002', 'manager',       NULL, true,  'Full access within assigned business, cannot change system config'),
  ('00000001-0000-0000-0000-000000000003', 'accountant',    NULL, true,  'Full access to finance modules, read-only elsewhere'),
  ('00000001-0000-0000-0000-000000000004', 'sales',         NULL, true,  'CRM, Sales, POS, Invoicing. No access to cost prices, payroll, accounting'),
  ('00000001-0000-0000-0000-000000000005', 'stock_manager', NULL, true,  'Full access to Stock and Purchasing modules'),
  ('00000001-0000-0000-0000-000000000006', 'logistics',     NULL, true,  'Full access to Logistics module, view-only on Sales'),
  ('00000001-0000-0000-0000-000000000007', 'staff',         NULL, true,  'Own expenses, view own payslips, messaging only');

-- ── Default permissions (owner gets everything) ───────────
DO $$
DECLARE
  v_owner_id UUID := '00000001-0000-0000-0000-000000000001';
  v_modules  TEXT[] := ARRAY['crm','sales','pos','invoicing','accounting','stock',
                              'catalogue','purchasing','expenses','payroll','logistics',
                              'retail_partners','messaging','campaigns','social','loyalty',
                              'discounts','reports','calendar','tasks','dashboards',
                              'documents','staff','settings'];
  v_actions  TEXT[] := ARRAY['view','create','edit','delete','approve','export'];
  m TEXT;
  a TEXT;
BEGIN
  FOREACH m IN ARRAY v_modules LOOP
    FOREACH a IN ARRAY v_actions LOOP
      INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
      VALUES (v_owner_id, m, a, 'all', '{}')
      ON CONFLICT (role_id, module, action) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Manager permissions (same as owner except settings)
DO $$
DECLARE
  v_manager_id UUID := '00000001-0000-0000-0000-000000000002';
  v_modules    TEXT[] := ARRAY['crm','sales','pos','invoicing','accounting','stock',
                                'catalogue','purchasing','expenses','payroll','logistics',
                                'retail_partners','messaging','campaigns','social','loyalty',
                                'discounts','reports','calendar','tasks','dashboards',
                                'documents','staff'];
  v_actions    TEXT[] := ARRAY['view','create','edit','delete','approve','export'];
  m TEXT; a TEXT;
BEGIN
  FOREACH m IN ARRAY v_modules LOOP
    FOREACH a IN ARRAY v_actions LOOP
      INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
      VALUES (v_manager_id, m, a, 'all', '{}')
      ON CONFLICT (role_id, module, action) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Sales role permissions (hidden: cost_price, supplier_cert details)
DO $$
DECLARE
  v_sales_id UUID := '00000001-0000-0000-0000-000000000004';
BEGIN
  INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields) VALUES
    (v_sales_id, 'crm',       'view',   'all',  '{}'),
    (v_sales_id, 'crm',       'create', 'all',  '{}'),
    (v_sales_id, 'crm',       'edit',   'own',  '{}'),
    (v_sales_id, 'sales',     'view',   'own',  '{}'),
    (v_sales_id, 'sales',     'create', 'all',  '{}'),
    (v_sales_id, 'sales',     'edit',   'own',  '{}'),
    (v_sales_id, 'pos',       'view',   'own',  '{}'),
    (v_sales_id, 'pos',       'create', 'all',  '{}'),
    (v_sales_id, 'invoicing', 'view',   'own',  '{}'),
    (v_sales_id, 'invoicing', 'create', 'all',  '{}'),
    (v_sales_id, 'stock',     'view',   'all',  ARRAY['cost_price']),
    (v_sales_id, 'messaging', 'view',   'all',  '{}'),
    (v_sales_id, 'messaging', 'create', 'all',  '{}'),
    (v_sales_id, 'calendar',  'view',   'all',  '{}'),
    (v_sales_id, 'calendar',  'create', 'all',  '{}'),
    (v_sales_id, 'tasks',     'view',   'own',  '{}'),
    (v_sales_id, 'tasks',     'create', 'all',  '{}'),
    (v_sales_id, 'dashboards','view',   'all',  '{}'),
    (v_sales_id, 'expenses',  'view',   'own',  '{}'),
    (v_sales_id, 'expenses',  'create', 'own',  '{}'),
    (v_sales_id, 'social',    'view',   'all',  '{}'),
    (v_sales_id, 'social',    'create', 'all',  '{}'),
    (v_sales_id, 'social',    'edit',   'own',  '{}')
  ON CONFLICT (role_id, module, action) DO NOTHING;
END $$;

-- Staff role — own expenses, own payslip, messaging only
DO $$
DECLARE
  v_staff_id UUID := '00000001-0000-0000-0000-000000000007';
BEGIN
  INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields) VALUES
    (v_staff_id, 'expenses',  'view',   'own',  '{}'),
    (v_staff_id, 'expenses',  'create', 'own',  '{}'),
    (v_staff_id, 'payroll',   'view',   'own',  '{}'),
    (v_staff_id, 'messaging', 'view',   'all',  '{}'),
    (v_staff_id, 'messaging', 'create', 'all',  '{}'),
    (v_staff_id, 'calendar',  'view',   'all',  '{}'),
    (v_staff_id, 'tasks',     'view',   'own',  '{}'),
    (v_staff_id, 'tasks',     'create', 'own',  '{}')
  ON CONFLICT (role_id, module, action) DO NOTHING;
END $$;

-- ── Business configuration ────────────────────────────────
INSERT INTO shared.business_config (
  business_key, display_name, legal_name,
  vat_rate, wht_rate,
  pipeline_stages, custom_field_defs, document_prefixes
) VALUES
(
  'jewelry',
  'Hub Jewelry',
  'Hub Jewelry Ltd',
  0.075, 0.05,
  '[
    {"key":"new_inquiry",       "label":"New Inquiry",        "colour":"#94A3B8","is_terminal":false},
    {"key":"viewing_scheduled", "label":"Viewing Scheduled",  "colour":"#60A5FA","is_terminal":false},
    {"key":"offer_sent",        "label":"Offer Sent",         "colour":"#FBBF24","is_terminal":false},
    {"key":"payment_pending",   "label":"Payment Pending",    "colour":"#F97316","is_terminal":false},
    {"key":"completed",         "label":"Completed",          "colour":"#34D399","is_terminal":true,"is_positive":true},
    {"key":"lost",              "label":"Lost",               "colour":"#F87171","is_terminal":true,"is_positive":false}
  ]',
  '[
    {"key":"item_type",         "label":"Item Type",          "type":"select",   "required":true,  "options":["Ring","Necklace","Bracelet","Earring","Watch","Pendant","Brooch","Anklet"]},
    {"key":"metal_type",        "label":"Metal Type",         "type":"select",   "required":true,  "options":["18k Yellow Gold","18k White Gold","18k Rose Gold","Silver 925","Platinum","Gold Plated"]},
    {"key":"stone_type",        "label":"Stone Type",         "type":"select",   "required":false, "options":["Diamond","Ruby","Sapphire","Emerald","Pearl","None","Other"]},
    {"key":"weight_grams",      "label":"Weight (grams)",     "type":"number",   "required":false, "options":[]},
    {"key":"ring_size",         "label":"Ring Size (US)",     "type":"text",     "required":false, "options":[]},
    {"key":"supplier_cert_no",  "label":"Certificate Number", "type":"text",     "required":false, "options":[]}
  ]',
  '{"invoice":"JWL-INV","po":"JWL-PO","quotation":"JWL-QT","delivery":"JWL-DN","payslip":"JWL-PS","credit_note":"JWL-CN","settlement":"JWL-STL","receipt":"JWL-RCP"}'
),
(
  'diffusers',
  'Hub Diffusers',
  'Hub Diffusers Ltd',
  0.075, 0.05,
  '[
    {"key":"lead",         "label":"Lead",          "colour":"#94A3B8","is_terminal":false},
    {"key":"sample_sent",  "label":"Sample Sent",   "colour":"#60A5FA","is_terminal":false},
    {"key":"negotiating",  "label":"Negotiating",   "colour":"#FBBF24","is_terminal":false},
    {"key":"bulk_order",   "label":"Bulk Order",    "colour":"#F97316","is_terminal":false},
    {"key":"delivered",    "label":"Delivered",     "colour":"#34D399","is_terminal":true,"is_positive":true},
    {"key":"lost",         "label":"Lost",          "colour":"#F87171","is_terminal":true,"is_positive":false}
  ]',
  '[
    {"key":"diffuser_type",    "label":"Diffuser Type",      "type":"select",  "required":true,  "options":["Reed Diffuser","Electric Diffuser","Essential Oil","Candle","Room Spray","Gift Set"]},
    {"key":"fragrance_family", "label":"Fragrance Family",   "type":"select",  "required":true,  "options":["Floral","Woody","Citrus","Fresh","Oriental","Aquatic","Gourmand"]},
    {"key":"scent_name",       "label":"Scent Name",         "type":"text",    "required":true,  "options":[]},
    {"key":"volume_ml",        "label":"Volume (ml)",        "type":"number",  "required":false, "options":[]},
    {"key":"burn_time_hrs",    "label":"Burn Time (hrs)",    "type":"number",  "required":false, "options":[]},
    {"key":"is_natural",       "label":"Natural Ingredients","type":"boolean", "required":false, "options":[]}
  ]',
  '{"invoice":"DFS-INV","po":"DFS-PO","quotation":"DFS-QT","delivery":"DFS-DN","payslip":"DFS-PS","credit_note":"DFS-CN","settlement":"DFS-STL","receipt":"DFS-RCP"}'
);

-- ── Document sequences (starting at 1) ───────────────────
INSERT INTO shared.document_numbering (business, document_type, prefix, next_number, padding) VALUES
  ('jewelry',   'invoice',      'JWL-INV',  1, 4),
  ('jewelry',   'purchase_order','JWL-PO',  1, 4),
  ('jewelry',   'quotation',    'JWL-QT',   1, 4),
  ('jewelry',   'sales_order',  'JWL-SO',   1, 4),
  ('jewelry',   'delivery',     'JWL-DN',   1, 4),
  ('jewelry',   'payslip',      'JWL-PS',   1, 4),
  ('jewelry',   'credit_note',  'JWL-CN',   1, 4),
  ('jewelry',   'settlement',   'JWL-STL',  1, 4),
  ('jewelry',   'receipt',      'JWL-RCP',  1, 4),
  ('jewelry',   'rfq',          'JWL-RFQ',  1, 4),
  ('jewelry',   'transfer',     'JWL-TRF',  1, 4),
  ('jewelry',   'expense',      'JWL-EXP',  1, 4),
  ('jewelry',   'supplier',     'JWL-SUP',  1, 4),
  ('jewelry',   'payroll_run',  'JWL-PR',   1, 4),
  ('diffusers', 'invoice',      'DFS-INV',  1, 4),
  ('diffusers', 'purchase_order','DFS-PO',  1, 4),
  ('diffusers', 'quotation',    'DFS-QT',   1, 4),
  ('diffusers', 'sales_order',  'DFS-SO',   1, 4),
  ('diffusers', 'delivery',     'DFS-DN',   1, 4),
  ('diffusers', 'payslip',      'DFS-PS',   1, 4),
  ('diffusers', 'credit_note',  'DFS-CN',   1, 4),
  ('diffusers', 'settlement',   'DFS-STL',  1, 4),
  ('diffusers', 'receipt',      'DFS-RCP',  1, 4),
  ('diffusers', 'rfq',          'DFS-RFQ',  1, 4),
  ('diffusers', 'transfer',     'DFS-TRF',  1, 4),
  ('diffusers', 'expense',      'DFS-EXP',  1, 4),
  ('diffusers', 'supplier',     'DFS-SUP',  1, 4),
  ('diffusers', 'payroll_run',  'DFS-PR',   1, 4);

-- ── Tax rates (Nigerian) ──────────────────────────────────
INSERT INTO shared.tax_rates (business, tax_name, tax_type, rate, applies_to, effective_from) VALUES
  ('jewelry',   'VAT',              'sales',    0.0750, 'all',      '2020-02-01'),
  ('jewelry',   'WHT',              'purchases',0.0500, 'services', '2020-01-01'),
  ('jewelry',   'PAYE',             'payroll',  0.0000, 'salaries', '2020-01-01'),
  ('jewelry',   'Pension_Employee', 'payroll',  0.0800, 'salaries', '2020-01-01'),
  ('jewelry',   'Pension_Employer', 'payroll',  0.1000, 'salaries', '2020-01-01'),
  ('jewelry',   'NHF',              'payroll',  0.0250, 'basic',    '2020-01-01'),
  ('diffusers', 'VAT',              'sales',    0.0750, 'all',      '2020-02-01'),
  ('diffusers', 'WHT',              'purchases',0.0500, 'services', '2020-01-01'),
  ('diffusers', 'PAYE',             'payroll',  0.0000, 'salaries', '2020-01-01'),
  ('diffusers', 'Pension_Employee', 'payroll',  0.0800, 'salaries', '2020-01-01'),
  ('diffusers', 'Pension_Employer', 'payroll',  0.1000, 'salaries', '2020-01-01'),
  ('diffusers', 'NHF',              'payroll',  0.0250, 'basic',    '2020-01-01');

-- ── Chart of Accounts — Nigerian retail (jewelry) ─────────
INSERT INTO jewelry.chart_of_accounts (account_code, account_name, account_type, account_subtype, is_system) VALUES
  -- ASSETS
  ('1000', 'Current Assets',               'asset',     'current_asset',       true),
  ('1100', 'Cash on Hand',                 'asset',     'current_asset',       true),
  ('1110', 'Petty Cash',                   'asset',     'current_asset',       false),
  ('1200', 'Bank Accounts',                'asset',     'current_asset',       true),
  ('1210', 'GTBank NGN Account',           'asset',     'current_asset',       false),
  ('1220', 'GTBank USD Account',           'asset',     'current_asset',       false),
  ('1300', 'Accounts Receivable',          'asset',     'current_asset',       true),
  ('1310', 'Trade Receivables',            'asset',     'current_asset',       false),
  ('1320', 'Retail Partner Receivables',   'asset',     'current_asset',       false),
  ('1400', 'Inventory',                    'asset',     'current_asset',       true),
  ('1410', 'Jewelry Stock',                'asset',     'current_asset',       false),
  ('1420', 'Goods in Transit',             'asset',     'current_asset',       false),
  ('1500', 'Prepaid Expenses',             'asset',     'current_asset',       false),
  ('1600', 'Fixed Assets',                 'asset',     'fixed_asset',         true),
  ('1610', 'Equipment',                    'asset',     'fixed_asset',         false),
  ('1620', 'Accumulated Depreciation',     'asset',     'fixed_asset',         false),
  -- LIABILITIES
  ('2000', 'Current Liabilities',          'liability', 'current_liability',   true),
  ('2100', 'Accounts Payable',             'liability', 'current_liability',   true),
  ('2110', 'Supplier Payables',            'liability', 'current_liability',   false),
  ('2200', 'VAT Payable',                  'liability', 'current_liability',   true),
  ('2210', 'Output VAT',                   'liability', 'current_liability',   false),
  ('2220', 'Input VAT',                    'liability', 'current_liability',   false),
  ('2300', 'Payroll Liabilities',          'liability', 'current_liability',   true),
  ('2310', 'PAYE Payable',                 'liability', 'current_liability',   false),
  ('2320', 'Pension Payable',              'liability', 'current_liability',   false),
  ('2330', 'NHF Payable',                  'liability', 'current_liability',   false),
  ('2400', 'Customer Deposits',            'liability', 'current_liability',   false),
  ('2500', 'Consignment Liability',        'liability', 'current_liability',   false),
  -- EQUITY
  ('3000', 'Equity',                       'equity',    'equity',              true),
  ('3100', 'Owner Capital',                'equity',    'equity',              false),
  ('3200', 'Retained Earnings',            'equity',    'equity',              true),
  -- INCOME
  ('4000', 'Revenue',                      'income',    'sales_revenue',       true),
  ('4100', 'Jewelry Sales',                'income',    'sales_revenue',       false),
  ('4110', 'POS Sales',                    'income',    'sales_revenue',       false),
  ('4120', 'Online / Invoice Sales',       'income',    'sales_revenue',       false),
  ('4130', 'Wholesale Sales',              'income',    'sales_revenue',       false),
  ('4200', 'Consignment Revenue',          'income',    'sales_revenue',       false),
  ('4300', 'Delivery Fee Revenue',         'income',    'other_income',        false),
  ('4400', 'Other Income',                 'income',    'other_income',        false),
  -- COST OF GOODS
  ('5000', 'Cost of Goods Sold',           'expense',   'cost_of_goods',       true),
  ('5100', 'Inventory Cost',               'expense',   'cost_of_goods',       false),
  ('5110', 'Import Costs',                 'expense',   'cost_of_goods',       false),
  ('5120', 'Shipping & Freight In',        'expense',   'cost_of_goods',       false),
  ('5130', 'Import Duties & Levies',       'expense',   'cost_of_goods',       false),
  -- OPERATING EXPENSES
  ('6000', 'Operating Expenses',           'expense',   'operating_expense',   true),
  ('6100', 'Payroll Expense',              'expense',   'payroll_expense',     true),
  ('6110', 'Salaries',                     'expense',   'payroll_expense',     false),
  ('6120', 'Pension Employer Contribution','expense',   'payroll_expense',     false),
  ('6130', 'Commission Expense',           'expense',   'payroll_expense',     false),
  ('6200', 'Logistics & Delivery',         'expense',   'operating_expense',   false),
  ('6300', 'Rent & Premises',              'expense',   'operating_expense',   false),
  ('6400', 'Marketing & Advertising',      'expense',   'operating_expense',   false),
  ('6500', 'Office & Admin',               'expense',   'operating_expense',   false),
  ('6600', 'Bank Charges',                 'expense',   'operating_expense',   false),
  ('6700', 'Depreciation',                 'expense',   'operating_expense',   false),
  ('6800', 'Staff Expenses',               'expense',   'operating_expense',   false),
  ('6900', 'Tax Expense',                  'expense',   'tax_expense',         true),
  ('6910', 'WHT Expense',                  'expense',   'tax_expense',         false);

-- Mirror COA for diffusers (same structure, diffuser-specific names)
INSERT INTO diffusers.chart_of_accounts (account_code, account_name, account_type, account_subtype, is_system) VALUES
  ('1000', 'Current Assets',               'asset',     'current_asset',       true),
  ('1100', 'Cash on Hand',                 'asset',     'current_asset',       true),
  ('1200', 'Bank Accounts',                'asset',     'current_asset',       true),
  ('1210', 'GTBank NGN Account',           'asset',     'current_asset',       false),
  ('1300', 'Accounts Receivable',          'asset',     'current_asset',       true),
  ('1310', 'Trade Receivables',            'asset',     'current_asset',       false),
  ('1320', 'Retail Partner Receivables',   'asset',     'current_asset',       false),
  ('1400', 'Inventory',                    'asset',     'current_asset',       true),
  ('1410', 'Diffuser Stock',               'asset',     'current_asset',       false),
  ('1420', 'Goods in Transit',             'asset',     'current_asset',       false),
  ('2000', 'Current Liabilities',          'liability', 'current_liability',   true),
  ('2100', 'Accounts Payable',             'liability', 'current_liability',   true),
  ('2200', 'VAT Payable',                  'liability', 'current_liability',   true),
  ('2300', 'Payroll Liabilities',          'liability', 'current_liability',   true),
  ('2310', 'PAYE Payable',                 'liability', 'current_liability',   false),
  ('2320', 'Pension Payable',              'liability', 'current_liability',   false),
  ('3000', 'Equity',                       'equity',    'equity',              true),
  ('3100', 'Owner Capital',                'equity',    'equity',              false),
  ('3200', 'Retained Earnings',            'equity',    'equity',              true),
  ('4000', 'Revenue',                      'income',    'sales_revenue',       true),
  ('4100', 'Diffuser Sales',               'income',    'sales_revenue',       false),
  ('4110', 'POS Sales',                    'income',    'sales_revenue',       false),
  ('4120', 'Online / Invoice Sales',       'income',    'sales_revenue',       false),
  ('4200', 'Consignment Revenue',          'income',    'sales_revenue',       false),
  ('5000', 'Cost of Goods Sold',           'expense',   'cost_of_goods',       true),
  ('5100', 'Inventory Cost',               'expense',   'cost_of_goods',       false),
  ('5120', 'Shipping & Freight In',        'expense',   'cost_of_goods',       false),
  ('6000', 'Operating Expenses',           'expense',   'operating_expense',   true),
  ('6100', 'Payroll Expense',              'expense',   'payroll_expense',     true),
  ('6110', 'Salaries',                     'expense',   'payroll_expense',     false),
  ('6120', 'Pension Employer Contribution','expense',   'payroll_expense',     false),
  ('6200', 'Logistics & Delivery',         'expense',   'operating_expense',   false),
  ('6300', 'Rent & Premises',              'expense',   'operating_expense',   false),
  ('6400', 'Marketing & Advertising',      'expense',   'operating_expense',   false),
  ('6500', 'Office & Admin',               'expense',   'operating_expense',   false),
  ('6600', 'Bank Charges',                 'expense',   'operating_expense',   false);

-- ── Pipeline stage definitions ────────────────────────────
INSERT INTO shared.pipeline_stage_defs (business, pipeline_type, stage_key, stage_label, display_order, is_terminal, is_positive_terminal, colour) VALUES
  ('jewelry', 'crm', 'new_inquiry',        'New Inquiry',        1, false, NULL,  '#94A3B8'),
  ('jewelry', 'crm', 'viewing_scheduled',  'Viewing Scheduled',  2, false, NULL,  '#60A5FA'),
  ('jewelry', 'crm', 'offer_sent',         'Offer Sent',         3, false, NULL,  '#FBBF24'),
  ('jewelry', 'crm', 'payment_pending',    'Payment Pending',     4, false, NULL,  '#F97316'),
  ('jewelry', 'crm', 'completed',          'Completed',          5, true,  true,  '#34D399'),
  ('jewelry', 'crm', 'lost',               'Lost',               6, true,  false, '#F87171'),
  ('diffusers','crm','lead',               'Lead',               1, false, NULL,  '#94A3B8'),
  ('diffusers','crm','sample_sent',        'Sample Sent',        2, false, NULL,  '#60A5FA'),
  ('diffusers','crm','negotiating',        'Negotiating',        3, false, NULL,  '#FBBF24'),
  ('diffusers','crm','bulk_order',         'Bulk Order',         4, false, NULL,  '#F97316'),
  ('diffusers','crm','delivered',          'Delivered',          5, true,  true,  '#34D399'),
  ('diffusers','crm','lost',               'Lost',               6, true,  false, '#F87171');

-- ── Loyalty tiers ─────────────────────────────────────────
INSERT INTO jewelry.loyalty_tiers (tier_name, min_points, max_points, benefits, colour, display_order) VALUES
  ('New',      0,     999,   '{"discount_pct":0,   "priority_service":false,"birthday_gift":false}', '#94A3B8', 1),
  ('Silver',   1000,  4999,  '{"discount_pct":2.5, "priority_service":false,"birthday_gift":true}',  '#C0C0C0', 2),
  ('Gold',     5000,  14999, '{"discount_pct":5,   "priority_service":true, "birthday_gift":true}',  '#FBBF24', 3),
  ('Platinum', 15000, NULL,  '{"discount_pct":10,  "priority_service":true, "birthday_gift":true,"exclusive_previews":true}', '#A855F7', 4);

INSERT INTO diffusers.loyalty_tiers (tier_name, min_points, max_points, benefits, colour, display_order) VALUES
  ('New',      0,    499,   '{"discount_pct":0,   "free_shipping":false}', '#94A3B8', 1),
  ('Regular',  500,  1999,  '{"discount_pct":3,   "free_shipping":false}', '#60A5FA', 2),
  ('VIP',      2000, NULL,  '{"discount_pct":7,   "free_shipping":true,"exclusive_access":true}', '#FBBF24', 3);

-- ── First fiscal periods (2026) ───────────────────────────
DO $$
DECLARE
  m INTEGER;
  mn TEXT;
BEGIN
  FOR m IN 1..12 LOOP
    mn := TO_CHAR(TO_DATE(m::TEXT, 'MM'), 'Month');
    INSERT INTO jewelry.fiscal_periods (name, period_type, start_date, end_date)
    VALUES (
      TRIM(mn) || ' 2026',
      'month',
      DATE_TRUNC('month', MAKE_DATE(2026, m, 1)),
      (DATE_TRUNC('month', MAKE_DATE(2026, m, 1)) + INTERVAL '1 month - 1 day')::DATE
    ) ON CONFLICT DO NOTHING;

    INSERT INTO diffusers.fiscal_periods (name, period_type, start_date, end_date)
    VALUES (
      TRIM(mn) || ' 2026',
      'month',
      DATE_TRUNC('month', MAKE_DATE(2026, m, 1)),
      (DATE_TRUNC('month', MAKE_DATE(2026, m, 1)) + INTERVAL '1 month - 1 day')::DATE
    ) ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Annual period 2026
INSERT INTO jewelry.fiscal_periods   (name, period_type, start_date, end_date)
VALUES ('FY 2026', 'year', '2026-01-01', '2026-12-31') ON CONFLICT DO NOTHING;
INSERT INTO diffusers.fiscal_periods (name, period_type, start_date, end_date)
VALUES ('FY 2026', 'year', '2026-01-01', '2026-12-31') ON CONFLICT DO NOTHING;

-- ── Record this migration run ──────────────────────────────
INSERT INTO shared.migrations (filename, applied_by, checksum, status)
VALUES ('000022_seed_data.sql', 'initial_setup', 'manual', 'applied');

-- ============================================================
-- ALL 22 MIGRATIONS COMPLETE
--
-- Final verification queries:
--
-- 1. Table counts per schema:
--    SELECT table_schema, COUNT(*) as table_count
--    FROM information_schema.tables
--    WHERE table_schema IN ('shared','jewelry','diffusers')
--    AND table_type = 'BASE TABLE'
--    GROUP BY table_schema ORDER BY table_schema;
--
-- 2. Trigger count:
--    SELECT COUNT(*) FROM information_schema.triggers
--    WHERE trigger_schema IN ('shared','jewelry','diffusers');
--
-- 3. Roles seeded:
--    SELECT role_name, business, is_system FROM shared.roles;
--
-- 4. COA row count:
--    SELECT COUNT(*) FROM jewelry.chart_of_accounts;
--    SELECT COUNT(*) FROM diffusers.chart_of_accounts;
--
-- 5. Document sequences:
--    SELECT business, document_type, prefix FROM shared.document_numbering
--    ORDER BY business, document_type;
-- ============================================================