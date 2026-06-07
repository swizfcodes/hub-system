-- ============================================================
-- MIGRATION 000011 — Per-business: POS
-- pos_terminals, pos_sessions, pos_transactions,
-- pos_payment_splits, pos_session_summary
-- ============================================================

-- ┌── JEWELRY ──────────────────────────────────────────────┐

CREATE TABLE jewelry.pos_terminals (
  terminal_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  location_id           UUID        NOT NULL REFERENCES jewelry.stock_locations (location_id),
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_pos_terminals_updated_at
  BEFORE UPDATE ON jewelry.pos_terminals
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE TABLE jewelry.pos_sessions (
  session_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id           UUID        NOT NULL REFERENCES jewelry.pos_terminals (terminal_id),
  opened_by             UUID        NOT NULL REFERENCES shared.users (user_id),
  closed_by             UUID        REFERENCES shared.users (user_id),
  opened_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at             TIMESTAMPTZ,
  opening_float         NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_cash         NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_cash           NUMERIC(12,2),
  cash_variance         NUMERIC(12,2) GENERATED ALWAYS AS
                          (COALESCE(actual_cash, 0) - expected_cash) STORED,
  total_transfers       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_card            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_revenue         NUMERIC(14,2) NOT NULL DEFAULT 0,
  status                TEXT        NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','closed','reconciled')),
  reconciliation_notes  TEXT
);
CREATE INDEX idx_jewelry_pos_sessions_terminal ON jewelry.pos_sessions (terminal_id, opened_at DESC);
CREATE INDEX idx_jewelry_pos_sessions_status   ON jewelry.pos_sessions (status);

CREATE TABLE jewelry.pos_transactions (
  transaction_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number    TEXT        NOT NULL UNIQUE,
  session_id            UUID        NOT NULL REFERENCES jewelry.pos_sessions (session_id),
  contact_id            UUID        REFERENCES shared.contacts (contact_id) ON DELETE SET NULL,
  served_by             UUID        NOT NULL REFERENCES shared.users (user_id),
  subtotal              NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid           NUMERIC(14,2) NOT NULL DEFAULT 0,
  change_given          NUMERIC(12,2) NOT NULL DEFAULT 0,
  fulfilment_type       TEXT        NOT NULL DEFAULT 'walk_in'
                        CHECK (fulfilment_type IN ('walk_in','dispatch')),
  status                TEXT        NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('pending','completed','voided')),
  voided_by             UUID        REFERENCES shared.users (user_id),
  void_reason           TEXT,
  receipt_number        TEXT        UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_pos_tx_session  ON jewelry.pos_transactions (session_id, created_at DESC);
CREATE INDEX idx_jewelry_pos_tx_contact  ON jewelry.pos_transactions (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_jewelry_pos_tx_served   ON jewelry.pos_transactions (served_by, created_at DESC);
CREATE INDEX idx_jewelry_pos_tx_status   ON jewelry.pos_transactions (status);

CREATE TABLE jewelry.pos_transaction_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id        UUID        NOT NULL REFERENCES jewelry.pos_transactions (transaction_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES jewelry.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price            NUMERIC(14,2) NOT NULL,
  discount_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total            NUMERIC(14,2) NOT NULL,
  display_order         SMALLINT    NOT NULL DEFAULT 0
);
CREATE INDEX idx_jewelry_pos_tx_lines ON jewelry.pos_transaction_lines (transaction_id);

CREATE TABLE jewelry.pos_payment_splits (
  split_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id        UUID        NOT NULL REFERENCES jewelry.pos_transactions (transaction_id) ON DELETE CASCADE,
  payment_method        TEXT        NOT NULL
                        CHECK (payment_method IN ('bank_transfer','pos_card','cash','paystack','flutterwave')),
  amount                NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reference             TEXT,
  confirmed             BOOLEAN     NOT NULL DEFAULT false,
  confirmed_at          TIMESTAMPTZ,
  paystack_reference    TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_pos_payment_splits ON jewelry.pos_payment_splits (transaction_id);

CREATE TABLE jewelry.pos_session_summary (
  summary_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID        NOT NULL UNIQUE REFERENCES jewelry.pos_sessions (session_id),
  total_transactions    INTEGER     NOT NULL DEFAULT 0,
  voided_transactions   INTEGER     NOT NULL DEFAULT 0,
  total_revenue         NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_total            NUMERIC(14,2) NOT NULL DEFAULT 0,
  card_total            NUMERIC(14,2) NOT NULL DEFAULT 0,
  transfer_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_items_sold      INTEGER     NOT NULL DEFAULT 0,
  average_order_value   NUMERIC(14,2),
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ┌── DIFFUSERS ────────────────────────────────────────────┐

CREATE TABLE diffusers.pos_terminals (
  terminal_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  location_id           UUID        NOT NULL REFERENCES diffusers.stock_locations (location_id),
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_pos_terminals_updated_at
  BEFORE UPDATE ON diffusers.pos_terminals
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE TABLE diffusers.pos_sessions (
  session_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id           UUID        NOT NULL REFERENCES diffusers.pos_terminals (terminal_id),
  opened_by             UUID        NOT NULL REFERENCES shared.users (user_id),
  closed_by             UUID        REFERENCES shared.users (user_id),
  opened_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at             TIMESTAMPTZ,
  opening_float         NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_cash         NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_cash           NUMERIC(12,2),
  cash_variance         NUMERIC(12,2) GENERATED ALWAYS AS
                          (COALESCE(actual_cash, 0) - expected_cash) STORED,
  total_transfers       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_card            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_revenue         NUMERIC(14,2) NOT NULL DEFAULT 0,
  status                TEXT        NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','closed','reconciled')),
  reconciliation_notes  TEXT
);
CREATE INDEX idx_diffusers_pos_sessions_terminal ON diffusers.pos_sessions (terminal_id, opened_at DESC);

CREATE TABLE diffusers.pos_transactions (
  transaction_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number    TEXT        NOT NULL UNIQUE,
  session_id            UUID        NOT NULL REFERENCES diffusers.pos_sessions (session_id),
  contact_id            UUID        REFERENCES shared.contacts (contact_id) ON DELETE SET NULL,
  served_by             UUID        NOT NULL REFERENCES shared.users (user_id),
  subtotal              NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid           NUMERIC(14,2) NOT NULL DEFAULT 0,
  change_given          NUMERIC(12,2) NOT NULL DEFAULT 0,
  fulfilment_type       TEXT        NOT NULL DEFAULT 'walk_in'
                        CHECK (fulfilment_type IN ('walk_in','dispatch')),
  status                TEXT        NOT NULL DEFAULT 'completed'
                        CHECK (status IN ('pending','completed','voided')),
  voided_by             UUID        REFERENCES shared.users (user_id),
  void_reason           TEXT,
  receipt_number        TEXT        UNIQUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diffusers_pos_tx_session ON diffusers.pos_transactions (session_id, created_at DESC);
CREATE INDEX idx_diffusers_pos_tx_status  ON diffusers.pos_transactions (status);

CREATE TABLE diffusers.pos_transaction_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id        UUID        NOT NULL REFERENCES diffusers.pos_transactions (transaction_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES diffusers.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price            NUMERIC(14,2) NOT NULL,
  discount_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total            NUMERIC(14,2) NOT NULL,
  display_order         SMALLINT    NOT NULL DEFAULT 0
);

CREATE TABLE diffusers.pos_payment_splits (
  split_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id        UUID        NOT NULL REFERENCES diffusers.pos_transactions (transaction_id) ON DELETE CASCADE,
  payment_method        TEXT        NOT NULL
                        CHECK (payment_method IN ('bank_transfer','pos_card','cash','paystack','flutterwave')),
  amount                NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reference             TEXT,
  confirmed             BOOLEAN     NOT NULL DEFAULT false,
  confirmed_at          TIMESTAMPTZ,
  paystack_reference    TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diffusers.pos_session_summary (
  summary_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID        NOT NULL UNIQUE REFERENCES diffusers.pos_sessions (session_id),
  total_transactions    INTEGER     NOT NULL DEFAULT 0,
  voided_transactions   INTEGER     NOT NULL DEFAULT 0,
  total_revenue         NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_total            NUMERIC(14,2) NOT NULL DEFAULT 0,
  card_total            NUMERIC(14,2) NOT NULL DEFAULT 0,
  transfer_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_items_sold      INTEGER     NOT NULL DEFAULT 0,
  average_order_value   NUMERIC(14,2),
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
