-- ============================================================
-- MIGRATION 000045 — Tax module
--
-- Adds the chart-of-accounts entries and per-business tables the
-- tax engine needs to compute, file and settle Nigerian taxes
-- (VAT, WHT, PAYE, CIT, Development Levy) for each entity (TIN).
--
-- Both Orika entities (jewelry, diffusers) have turnover < ₦100m and
-- fixed assets < ₦250m → "small company" under the Nigeria Tax Act
-- 2025 (effective 2026): 0% CIT, exempt from Development Levy & CGT.
-- They still must FILE: VAT (monthly), WHT (monthly), PAYE (monthly,
-- Lagos LIRS) and a nil CIT return (annual). This module covers that.
-- ============================================================

BEGIN;

-- ── Chart of accounts additions (idempotent) ────────────────
-- account_code is UNIQUE per schema, so ON CONFLICT is safe.

INSERT INTO jewelry.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system) VALUES
  ('1340', 'WHT Receivable (Tax Credits)',  'asset',     'current_asset',     true),
  ('2340', 'WHT Payable',                    'liability', 'current_liability', true),
  ('2350', 'Company Income Tax Payable',     'liability', 'current_liability', true),
  ('2360', 'Development Levy Payable',       'liability', 'current_liability', true),
  ('6920', 'Company Income Tax',             'expense',   'tax_expense',       true),
  ('6930', 'Development Levy',               'expense',   'tax_expense',       true)
ON CONFLICT (account_code) DO NOTHING;

INSERT INTO diffusers.chart_of_accounts
  (account_code, account_name, account_type, account_subtype, is_system) VALUES
  ('1340', 'WHT Receivable (Tax Credits)',  'asset',     'current_asset',     true),
  ('2340', 'WHT Payable',                    'liability', 'current_liability', true),
  ('2350', 'Company Income Tax Payable',     'liability', 'current_liability', true),
  ('2360', 'Development Levy Payable',       'liability', 'current_liability', true),
  ('6920', 'Company Income Tax',             'expense',   'tax_expense',       true),
  ('6930', 'Development Levy',               'expense',   'tax_expense',       true)
ON CONFLICT (account_code) DO NOTHING;

-- ── Per-entity tax profile ──────────────────────────────────
-- One row per business/legal entity. Drives exemptions & filing.

CREATE TABLE IF NOT EXISTS jewelry.tax_profile (
  profile_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name             TEXT,
  tin                    TEXT,
  tax_state              TEXT        NOT NULL DEFAULT 'Lagos',   -- PAYE jurisdiction (LIRS)
  vat_registered         BOOLEAN     NOT NULL DEFAULT true,
  fiscal_year_end_month  SMALLINT    NOT NULL DEFAULT 12,
  is_small_company       BOOLEAN     NOT NULL DEFAULT true,      -- turnover ≤ cap & assets ≤ ₦250m
  small_co_turnover_cap  NUMERIC(15,2) NOT NULL DEFAULT 100000000,
  cit_rate               NUMERIC(6,4) NOT NULL DEFAULT 0.0000,   -- 0 small co, 0.30 standard
  dev_levy_rate          NUMERIC(6,4) NOT NULL DEFAULT 0.0400,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS diffusers.tax_profile (LIKE jewelry.tax_profile INCLUDING ALL);

-- Seed one profile per entity (TIN filled in by finance).
INSERT INTO jewelry.tax_profile (legal_name, is_small_company, cit_rate)
  SELECT 'Orika (Jewelry)', true, 0.0000
  WHERE NOT EXISTS (SELECT 1 FROM jewelry.tax_profile);
INSERT INTO diffusers.tax_profile (legal_name, is_small_company, cit_rate)
  SELECT 'Orika (Diffusers)', true, 0.0000
  WHERE NOT EXISTS (SELECT 1 FROM diffusers.tax_profile);

-- ── Tax filings (one per tax type + period) ─────────────────

CREATE TABLE IF NOT EXISTS jewelry.tax_filings (
  filing_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_number       TEXT,
  tax_type            TEXT        NOT NULL
                      CHECK (tax_type IN ('VAT','WHT','PAYE','CIT','DEV_LEVY')),
  period_label        TEXT        NOT NULL,   -- '2026-05' (monthly) or '2026' (annual)
  period_start        DATE        NOT NULL,
  period_end          DATE        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','reviewed','filed','paid','exempt')),
  computed_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,   -- straight from the ledger
  adjustment_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,   -- sum of manual adjustments
  final_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,   -- what gets filed/paid
  workpaper           JSONB,                              -- snapshot of the breakdown
  notes               TEXT,
  filing_reference    TEXT,                               -- NRS/LIRS confirmation ref
  filed_at            TIMESTAMPTZ,
  filed_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  settlement_entry_id UUID        REFERENCES jewelry.journal_entries (entry_id) ON DELETE SET NULL,
  paid_at             TIMESTAMPTZ,
  created_by          UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tax_type, period_label)
);
CREATE INDEX IF NOT EXISTS idx_jewelry_tax_filings_lookup
  ON jewelry.tax_filings (tax_type, period_end DESC);

CREATE TABLE IF NOT EXISTS diffusers.tax_filings (
  filing_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_number       TEXT,
  tax_type            TEXT        NOT NULL
                      CHECK (tax_type IN ('VAT','WHT','PAYE','CIT','DEV_LEVY')),
  period_label        TEXT        NOT NULL,
  period_start        DATE        NOT NULL,
  period_end          DATE        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','reviewed','filed','paid','exempt')),
  computed_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  adjustment_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
  final_amount        NUMERIC(15,2) NOT NULL DEFAULT 0,
  workpaper           JSONB,
  notes               TEXT,
  filing_reference    TEXT,
  filed_at            TIMESTAMPTZ,
  filed_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  settlement_entry_id UUID        REFERENCES diffusers.journal_entries (entry_id) ON DELETE SET NULL,
  paid_at             TIMESTAMPTZ,
  created_by          UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tax_type, period_label)
);
CREATE INDEX IF NOT EXISTS idx_diffusers_tax_filings_lookup
  ON diffusers.tax_filings (tax_type, period_end DESC);

-- ── Manual adjustments to a filing (reason-coded, audited) ───

CREATE TABLE IF NOT EXISTS jewelry.tax_filing_adjustments (
  adjustment_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id      UUID        NOT NULL REFERENCES jewelry.tax_filings (filing_id) ON DELETE CASCADE,
  label          TEXT        NOT NULL,
  amount         NUMERIC(15,2) NOT NULL,   -- +increases / -reduces the tax due
  reason         TEXT,
  created_by     UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jewelry_tax_adj_filing
  ON jewelry.tax_filing_adjustments (filing_id);

CREATE TABLE IF NOT EXISTS diffusers.tax_filing_adjustments (
  adjustment_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id      UUID        NOT NULL REFERENCES diffusers.tax_filings (filing_id) ON DELETE CASCADE,
  label          TEXT        NOT NULL,
  amount         NUMERIC(15,2) NOT NULL,
  reason         TEXT,
  created_by     UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diffusers_tax_adj_filing
  ON diffusers.tax_filing_adjustments (filing_id);

-- ── Permissions (owner + manager manage tax) ────────────────
INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
SELECT r.role_id, 'tax', a, 'all', '{}'
FROM shared.roles r,
     unnest(ARRAY['view','create','edit','approve','export']) a
WHERE r.role_name IN ('owner', 'manager')
ON CONFLICT (role_id, module, action) DO NOTHING;

COMMIT;
