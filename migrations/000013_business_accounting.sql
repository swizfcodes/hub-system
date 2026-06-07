-- ============================================================
-- MIGRATION 000013 — Per-business: Accounting
-- chart_of_accounts, journal_entries, journal_lines,
-- bank_statements, bank_reconciliations, fiscal_periods
-- ============================================================

-- ┌── JEWELRY ──────────────────────────────────────────────┐

CREATE TABLE jewelry.chart_of_accounts (
  account_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code          TEXT        NOT NULL UNIQUE,
  account_name          TEXT        NOT NULL,
  account_type          TEXT        NOT NULL
                        CHECK (account_type IN ('asset','liability','equity','income','expense')),
  account_subtype       TEXT,
  -- Subtypes: current_asset | fixed_asset | current_liability | long_term_liability
  --           equity | sales_revenue | other_income | cost_of_goods
  --           operating_expense | payroll_expense | tax_expense
  parent_account_id     UUID        REFERENCES jewelry.chart_of_accounts (account_id) ON DELETE SET NULL,
  is_system             BOOLEAN     NOT NULL DEFAULT false,  -- system accounts cannot be deleted
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  description           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_coa_updated_at
  BEFORE UPDATE ON jewelry.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_coa_code ON jewelry.chart_of_accounts (account_code);
CREATE INDEX idx_jewelry_coa_type ON jewelry.chart_of_accounts (account_type, is_active);

-- Journal entries: the header record
-- EVERY financial event must post a journal entry — no exceptions
CREATE TABLE jewelry.journal_entries (
  entry_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number          TEXT        NOT NULL UNIQUE,
  entry_date            DATE        NOT NULL,
  description           TEXT        NOT NULL,
  reference_type        TEXT,
  -- Types: invoice | purchase_order | expense | payroll_run | pos_session | manual | credit_note
  reference_id          UUID,
  fiscal_period_id      UUID,                           -- FK added after fiscal_periods
  is_posted             BOOLEAN     NOT NULL DEFAULT true,
  is_reversed           BOOLEAN     NOT NULL DEFAULT false,
  reversal_of           UUID        REFERENCES jewelry.journal_entries (entry_id) ON DELETE SET NULL,
  posted_by             UUID        NOT NULL REFERENCES shared.users (user_id),
  posted_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_journal_entries_date      ON jewelry.journal_entries (entry_date DESC);
CREATE INDEX idx_jewelry_journal_entries_reference ON jewelry.journal_entries (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;
CREATE INDEX idx_jewelry_journal_entries_period    ON jewelry.journal_entries (fiscal_period_id)
  WHERE fiscal_period_id IS NOT NULL;

-- Journal lines: the double-entry detail
-- RULE: SUM(debit) must equal SUM(credit) per entry_id — enforced by trigger in migration 000021
CREATE TABLE jewelry.journal_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id              UUID        NOT NULL REFERENCES jewelry.journal_entries (entry_id) ON DELETE CASCADE,
  account_id            UUID        NOT NULL REFERENCES jewelry.chart_of_accounts (account_id),
  debit                 NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit                NUMERIC(15,2) NOT NULL DEFAULT 0,
  description           TEXT,
  contact_id            UUID        REFERENCES shared.contacts (contact_id) ON DELETE SET NULL,
  -- Constraint: a line is either debit OR credit, never both
  CONSTRAINT debit_or_credit CHECK (
    (debit > 0 AND credit = 0) OR
    (debit = 0 AND credit > 0)
  )
);
CREATE INDEX idx_jewelry_journal_lines_entry   ON jewelry.journal_lines (entry_id);
CREATE INDEX idx_jewelry_journal_lines_account ON jewelry.journal_lines (account_id, entry_id);
CREATE INDEX idx_jewelry_journal_lines_contact ON jewelry.journal_lines (contact_id)
  WHERE contact_id IS NOT NULL;

-- Bank statement import — one row per transaction from bank feed
CREATE TABLE jewelry.bank_statements (
  statement_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id       UUID        NOT NULL REFERENCES shared.bank_accounts (account_id),
  transaction_date      DATE        NOT NULL,
  value_date            DATE,
  description           TEXT        NOT NULL,
  amount                NUMERIC(14,2) NOT NULL,   -- positive = credit, negative = debit
  balance               NUMERIC(14,2) NOT NULL,
  reference             TEXT,
  matched_payment_id    UUID,                      -- set when reconciled to invoice_payment
  matched_at            TIMESTAMPTZ,
  is_reconciled         BOOLEAN     NOT NULL DEFAULT false,
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_bank_stmt_account     ON jewelry.bank_statements (bank_account_id, transaction_date DESC);
CREATE INDEX idx_jewelry_bank_stmt_reconciled  ON jewelry.bank_statements (is_reconciled, bank_account_id)
  WHERE is_reconciled = false;

-- After invoice_payments exists, add FK
ALTER TABLE jewelry.bank_statements
  ADD CONSTRAINT fk_jewelry_bank_stmt_payment
    FOREIGN KEY (matched_payment_id) REFERENCES jewelry.invoice_payments (payment_id) ON DELETE SET NULL;

CREATE TABLE jewelry.bank_reconciliations (
  recon_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id       UUID        NOT NULL REFERENCES shared.bank_accounts (account_id),
  period_start          DATE        NOT NULL,
  period_end            DATE        NOT NULL,
  opening_balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_debits          NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_credits         NUMERIC(14,2) NOT NULL DEFAULT 0,
  unreconciled_count    INTEGER     NOT NULL DEFAULT 0,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','in_progress','completed')),
  completed_by          UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  completed_at          TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_bank_recon_account ON jewelry.bank_reconciliations (bank_account_id, period_end DESC);

CREATE TABLE jewelry.fiscal_periods (
  period_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  period_type           TEXT        NOT NULL CHECK (period_type IN ('month','quarter','year')),
  start_date            DATE        NOT NULL,
  end_date              DATE        NOT NULL,
  is_closed             BOOLEAN     NOT NULL DEFAULT false,
  closed_by             UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT period_dates_valid CHECK (end_date > start_date),
  UNIQUE (period_type, start_date)
);
CREATE INDEX idx_jewelry_fiscal_periods_dates ON jewelry.fiscal_periods (start_date, end_date);

-- Now add FK on journal_entries → fiscal_periods
ALTER TABLE jewelry.journal_entries
  ADD CONSTRAINT fk_jewelry_journal_entries_period
    FOREIGN KEY (fiscal_period_id) REFERENCES jewelry.fiscal_periods (period_id) ON DELETE SET NULL;


-- ┌── DIFFUSERS ────────────────────────────────────────────┐

CREATE TABLE diffusers.chart_of_accounts (
  account_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code          TEXT        NOT NULL UNIQUE,
  account_name          TEXT        NOT NULL,
  account_type          TEXT        NOT NULL
                        CHECK (account_type IN ('asset','liability','equity','income','expense')),
  account_subtype       TEXT,
  parent_account_id     UUID        REFERENCES diffusers.chart_of_accounts (account_id) ON DELETE SET NULL,
  is_system             BOOLEAN     NOT NULL DEFAULT false,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  description           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_coa_updated_at
  BEFORE UPDATE ON diffusers.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_diffusers_coa_code ON diffusers.chart_of_accounts (account_code);
CREATE INDEX idx_diffusers_coa_type ON diffusers.chart_of_accounts (account_type, is_active);

CREATE TABLE diffusers.journal_entries (
  entry_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number          TEXT        NOT NULL UNIQUE,
  entry_date            DATE        NOT NULL,
  description           TEXT        NOT NULL,
  reference_type        TEXT,
  reference_id          UUID,
  fiscal_period_id      UUID,
  is_posted             BOOLEAN     NOT NULL DEFAULT true,
  is_reversed           BOOLEAN     NOT NULL DEFAULT false,
  reversal_of           UUID        REFERENCES diffusers.journal_entries (entry_id) ON DELETE SET NULL,
  posted_by             UUID        NOT NULL REFERENCES shared.users (user_id),
  posted_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diffusers_journal_entries_date      ON diffusers.journal_entries (entry_date DESC);
CREATE INDEX idx_diffusers_journal_entries_reference ON diffusers.journal_entries (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

CREATE TABLE diffusers.journal_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id              UUID        NOT NULL REFERENCES diffusers.journal_entries (entry_id) ON DELETE CASCADE,
  account_id            UUID        NOT NULL REFERENCES diffusers.chart_of_accounts (account_id),
  debit                 NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit                NUMERIC(15,2) NOT NULL DEFAULT 0,
  description           TEXT,
  contact_id            UUID        REFERENCES shared.contacts (contact_id) ON DELETE SET NULL,
  CONSTRAINT debit_or_credit CHECK (
    (debit > 0 AND credit = 0) OR
    (debit = 0 AND credit > 0)
  )
);
CREATE INDEX idx_diffusers_journal_lines_entry   ON diffusers.journal_lines (entry_id);
CREATE INDEX idx_diffusers_journal_lines_account ON diffusers.journal_lines (account_id, entry_id);

CREATE TABLE diffusers.bank_statements (
  statement_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id       UUID        NOT NULL REFERENCES shared.bank_accounts (account_id),
  transaction_date      DATE        NOT NULL,
  value_date            DATE,
  description           TEXT        NOT NULL,
  amount                NUMERIC(14,2) NOT NULL,
  balance               NUMERIC(14,2) NOT NULL,
  reference             TEXT,
  matched_payment_id    UUID,
  matched_at            TIMESTAMPTZ,
  is_reconciled         BOOLEAN     NOT NULL DEFAULT false,
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diffusers_bank_stmt_account    ON diffusers.bank_statements (bank_account_id, transaction_date DESC);
CREATE INDEX idx_diffusers_bank_stmt_reconciled ON diffusers.bank_statements (is_reconciled, bank_account_id)
  WHERE is_reconciled = false;

ALTER TABLE diffusers.bank_statements
  ADD CONSTRAINT fk_diffusers_bank_stmt_payment
    FOREIGN KEY (matched_payment_id) REFERENCES diffusers.invoice_payments (payment_id) ON DELETE SET NULL;

CREATE TABLE diffusers.bank_reconciliations (
  recon_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id       UUID        NOT NULL REFERENCES shared.bank_accounts (account_id),
  period_start          DATE        NOT NULL,
  period_end            DATE        NOT NULL,
  opening_balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_debits          NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_credits         NUMERIC(14,2) NOT NULL DEFAULT 0,
  unreconciled_count    INTEGER     NOT NULL DEFAULT 0,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','in_progress','completed')),
  completed_by          UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  completed_at          TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diffusers.fiscal_periods (
  period_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  period_type           TEXT        NOT NULL CHECK (period_type IN ('month','quarter','year')),
  start_date            DATE        NOT NULL,
  end_date              DATE        NOT NULL,
  is_closed             BOOLEAN     NOT NULL DEFAULT false,
  closed_by             UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT period_dates_valid CHECK (end_date > start_date),
  UNIQUE (period_type, start_date)
);
CREATE INDEX idx_diffusers_fiscal_periods_dates ON diffusers.fiscal_periods (start_date, end_date);

ALTER TABLE diffusers.journal_entries
  ADD CONSTRAINT fk_diffusers_journal_entries_period
    FOREIGN KEY (fiscal_period_id) REFERENCES diffusers.fiscal_periods (period_id) ON DELETE SET NULL;
