-- ============================================================
-- MIGRATION 000002 — Shared system tables
-- business_config, custom_field_defs, pipeline_stage_defs,
-- document_numbering, tax_rates, currency_rates,
-- bank_accounts, webhook_log, migrations
-- ============================================================

-- ── business_config ──────────────────────────────────────
CREATE TABLE shared.business_config (
  config_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_key          TEXT        NOT NULL UNIQUE,    -- matches schema name: 'jewelry' | 'diffusers'
  display_name          TEXT        NOT NULL,
  legal_name            TEXT        NOT NULL,
  address               TEXT,
  phone                 TEXT,
  email                 TEXT,
  website               TEXT,
  tin                   TEXT,                          -- Tax Identification Number
  cac_number            TEXT,                          -- CAC registration
  logo_path             TEXT,
  accent_colour         TEXT        DEFAULT '#2563EB',
  fiscal_year_start     SMALLINT    DEFAULT 1          CHECK (fiscal_year_start BETWEEN 1 AND 12),
  default_currency      TEXT        DEFAULT 'NGN',
  vat_number            TEXT,
  vat_rate              NUMERIC(5,4) DEFAULT 0.075,    -- 7.5% Nigerian VAT
  wht_rate              NUMERIC(5,4) DEFAULT 0.05,     -- 5% Withholding Tax
  -- Configurable pipeline stages stored as ordered JSON array
  -- [{"key":"new_inquiry","label":"New Inquiry","colour":"#60A5FA","is_terminal":false}, ...]
  pipeline_stages       JSONB       NOT NULL DEFAULT '[]',
  -- Custom product field definitions
  -- [{"key":"metal_type","label":"Metal Type","type":"select","options":["Gold","Silver"],"required":true}]
  custom_field_defs     JSONB       NOT NULL DEFAULT '[]',
  -- Document prefix map
  -- {"invoice":"JWL-INV","po":"JWL-PO","quotation":"JWL-QT","delivery":"JWL-DN","payslip":"JWL-PS"}
  document_prefixes     JSONB       NOT NULL DEFAULT '{}',
  payment_methods       JSONB       NOT NULL DEFAULT '{}',
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_business_config_updated_at
  BEFORE UPDATE ON shared.business_config
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- ── custom_field_defs ─────────────────────────────────────
-- Standalone table for field definitions (in addition to JSONB in business_config)
-- Allows querying, sorting and managing fields individually
CREATE TABLE shared.custom_field_defs (
  field_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business              TEXT        NOT NULL,
  entity_type           TEXT        NOT NULL,   -- 'product', 'contact', 'crm_deal'
  field_key             TEXT        NOT NULL,   -- machine name e.g. 'metal_type'
  field_label           TEXT        NOT NULL,   -- display label e.g. 'Metal Type'
  field_type            TEXT        NOT NULL,   -- 'text','number','select','multiselect','date','boolean'
  options               JSONB       DEFAULT '[]', -- for select/multiselect types
  is_required           BOOLEAN     NOT NULL DEFAULT false,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  visible_to_roles      TEXT[]      DEFAULT '{}', -- empty = visible to all
  display_order         SMALLINT    DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business, entity_type, field_key)
);

-- ── pipeline_stage_defs ───────────────────────────────────
CREATE TABLE shared.pipeline_stage_defs (
  stage_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business              TEXT        NOT NULL,
  pipeline_type         TEXT        NOT NULL,   -- 'crm', 'delivery', 'purchase_order'
  stage_key             TEXT        NOT NULL,
  stage_label           TEXT        NOT NULL,
  display_order         SMALLINT    NOT NULL DEFAULT 0,
  is_terminal           BOOLEAN     NOT NULL DEFAULT false,  -- won/lost/delivered
  is_positive_terminal  BOOLEAN     DEFAULT NULL,            -- true=won, false=lost
  colour                TEXT        DEFAULT '#64748B',
  UNIQUE (business, pipeline_type, stage_key)
);

-- ── document_numbering ────────────────────────────────────
-- Atomic sequence counter per document type per business.
-- Use SELECT ... FOR UPDATE to increment safely under concurrency.
CREATE TABLE shared.document_numbering (
  seq_id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business              TEXT        NOT NULL,
  document_type         TEXT        NOT NULL,  -- 'invoice','po','quotation','delivery','payslip','credit_note','settlement'
  prefix                TEXT        NOT NULL,  -- e.g. 'JWL-INV'
  next_number           INTEGER     NOT NULL DEFAULT 1,
  padding               SMALLINT    NOT NULL DEFAULT 4,  -- zero-pad to 4 digits: 0001
  UNIQUE (business, document_type)
);

-- ── tax_rates ─────────────────────────────────────────────
CREATE TABLE shared.tax_rates (
  tax_id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business              TEXT        NOT NULL,
  tax_name              TEXT        NOT NULL,   -- 'VAT','WHT','PAYE','Pension_Employee','Pension_Employer','NHF'
  tax_type              TEXT        NOT NULL,   -- 'sales','purchases','payroll'
  rate                  NUMERIC(7,4) NOT NULL,  -- 0.075 = 7.5%
  applies_to            TEXT        NOT NULL,   -- 'all','products','services','salaries'
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  effective_from        DATE        NOT NULL,
  effective_to          DATE,                   -- NULL = currently active
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── currency_rates ────────────────────────────────────────
-- Updated daily by a cron job hitting an exchange rate API.
-- All money stored in NGN. Rates are for display/conversion only.
CREATE TABLE shared.currency_rates (
  rate_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency         TEXT        NOT NULL,   -- 'USD','GBP','EUR'
  to_currency           TEXT        NOT NULL DEFAULT 'NGN',
  rate                  NUMERIC(15,6) NOT NULL,
  source                TEXT,                   -- API source name
  valid_at              TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_currency_rates_valid_at ON shared.currency_rates (from_currency, valid_at DESC);

-- ── bank_accounts ─────────────────────────────────────────
-- Company bank accounts (NOT staff personal accounts — those are in staff_profiles)
CREATE TABLE shared.bank_accounts (
  account_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business              TEXT        NOT NULL,
  bank_name             TEXT        NOT NULL,
  account_name          TEXT        NOT NULL,
  account_number        TEXT        NOT NULL,
  sort_code             TEXT,
  currency              TEXT        NOT NULL DEFAULT 'NGN',
  is_primary            BOOLEAN     NOT NULL DEFAULT false,
  paystack_recipient_code TEXT,                -- for automated payouts
  flutterwave_bank_code   TEXT,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_bank_accounts_updated_at
  BEFORE UPDATE ON shared.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- ── webhook_log ───────────────────────────────────────────
-- All inbound webhook payloads logged BEFORE processing.
-- If processing fails the row stays and can be replayed.
CREATE TABLE shared.webhook_log (
  webhook_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source                TEXT        NOT NULL,   -- 'paystack','flutterwave','chowdeck','gigl'
  event_type            TEXT        NOT NULL,   -- 'charge.success','delivery.status' etc.
  payload               JSONB       NOT NULL,
  signature_valid       BOOLEAN     NOT NULL,
  processed             BOOLEAN     NOT NULL DEFAULT false,
  processed_at          TIMESTAMPTZ,
  error_message         TEXT,
  retry_count           SMALLINT    NOT NULL DEFAULT 0,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_log_unprocessed ON shared.webhook_log (source, processed, received_at)
  WHERE processed = false;

-- ── migrations ────────────────────────────────────────────
-- Tracks which SQL files have been applied.
-- The Node.js migrator reads this before running.
CREATE TABLE shared.migrations (
  migration_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filename              TEXT        NOT NULL UNIQUE,
  applied_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by            TEXT,                    -- hostname / environment tag
  checksum              TEXT        NOT NULL,    -- SHA-256 of file contents
  execution_ms          INTEGER,                 -- how long it took
  status                TEXT        NOT NULL DEFAULT 'applied' -- 'applied','failed','rolled_back'
);

CREATE INDEX idx_migrations_filename ON shared.migrations (filename);

-- ============================================================
-- Verify
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'shared' ORDER BY table_name;
-- Expected: bank_accounts, business_config, currency_rates,
--           custom_field_defs, document_numbering,
--           migrations, pipeline_stage_defs, tax_rates, webhook_log
-- ============================================================
