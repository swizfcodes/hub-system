-- ============================================================
-- MIGRATION 000012 — Per-business: Invoicing
-- invoices, invoice_lines, invoice_payments,
-- credit_notes, credit_note_lines
-- ============================================================

-- ┌── JEWELRY ──────────────────────────────────────────────┐

CREATE TABLE jewelry.invoices (
  invoice_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number        TEXT        NOT NULL UNIQUE,
  invoice_type          TEXT        NOT NULL DEFAULT 'standard'
                        CHECK (invoice_type IN ('standard','proforma','retail_partner_settlement')),
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  order_id              UUID        REFERENCES jewelry.sales_orders (order_id) ON DELETE SET NULL,
  pos_transaction_id    UUID        REFERENCES jewelry.pos_transactions (transaction_id) ON DELETE SET NULL,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','partially_paid','paid','overdue','voided')),
  issue_date            DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date              DATE        NOT NULL,
  subtotal              NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid           NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_outstanding    NUMERIC(14,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  currency              TEXT        NOT NULL DEFAULT 'NGN',
  notes                 TEXT,
  payment_instructions  TEXT,
  sent_at               TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  is_deleted            BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_invoices_updated_at
  BEFORE UPDATE ON jewelry.invoices
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE INDEX idx_jewelry_invoices_contact     ON jewelry.invoices (contact_id);
CREATE INDEX idx_jewelry_invoices_status      ON jewelry.invoices (status)              WHERE is_deleted = false;
CREATE INDEX idx_jewelry_invoices_outstanding ON jewelry.invoices (amount_outstanding)  WHERE is_deleted = false;
CREATE INDEX idx_jewelry_invoices_due_date    ON jewelry.invoices (due_date, status)    WHERE is_deleted = false;
CREATE INDEX idx_jewelry_invoices_number      ON jewelry.invoices (invoice_number);

CREATE TABLE jewelry.invoice_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID        NOT NULL REFERENCES jewelry.invoices (invoice_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES jewelry.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price            NUMERIC(14,2) NOT NULL,
  discount_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_rate              NUMERIC(5,4) NOT NULL DEFAULT 0.075,
  vat_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total            NUMERIC(14,2) NOT NULL,
  display_order         SMALLINT    NOT NULL DEFAULT 0
);
CREATE INDEX idx_jewelry_invoice_lines ON jewelry.invoice_lines (invoice_id);

CREATE TABLE jewelry.invoice_payments (
  payment_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID        NOT NULL REFERENCES jewelry.invoices (invoice_id),
  payment_date          DATE        NOT NULL DEFAULT CURRENT_DATE,
  amount                NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method        TEXT        NOT NULL
                        CHECK (payment_method IN ('bank_transfer','pos_card','cash','paystack','flutterwave')),
  reference             TEXT,
  paystack_reference    TEXT,
  flutterwave_reference TEXT,
  is_confirmed          BOOLEAN     NOT NULL DEFAULT false,
  confirmed_at          TIMESTAMPTZ,
  recorded_by           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_invoice_payments_invoice  ON jewelry.invoice_payments (invoice_id);
CREATE INDEX idx_jewelry_invoice_payments_paystack ON jewelry.invoice_payments (paystack_reference)
  WHERE paystack_reference IS NOT NULL;

CREATE TABLE jewelry.credit_notes (
  credit_note_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number    TEXT        NOT NULL UNIQUE,
  invoice_id            UUID        NOT NULL REFERENCES jewelry.invoices (invoice_id),
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  reason                TEXT        NOT NULL,
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','issued','applied','refunded')),
  issued_at             TIMESTAMPTZ,
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_credit_notes_updated_at
  BEFORE UPDATE ON jewelry.credit_notes
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_credit_notes_invoice ON jewelry.credit_notes (invoice_id);
CREATE INDEX idx_jewelry_credit_notes_status  ON jewelry.credit_notes (status);

CREATE TABLE jewelry.credit_note_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id        UUID        NOT NULL REFERENCES jewelry.credit_notes (credit_note_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES jewelry.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price            NUMERIC(14,2) NOT NULL,
  line_total            NUMERIC(14,2) NOT NULL
);
CREATE INDEX idx_jewelry_credit_note_lines ON jewelry.credit_note_lines (credit_note_id);


-- ┌── DIFFUSERS ────────────────────────────────────────────┐

CREATE TABLE diffusers.invoices (
  invoice_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number        TEXT        NOT NULL UNIQUE,
  invoice_type          TEXT        NOT NULL DEFAULT 'standard'
                        CHECK (invoice_type IN ('standard','proforma','retail_partner_settlement')),
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  order_id              UUID        REFERENCES diffusers.sales_orders (order_id) ON DELETE SET NULL,
  pos_transaction_id    UUID        REFERENCES diffusers.pos_transactions (transaction_id) ON DELETE SET NULL,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','partially_paid','paid','overdue','voided')),
  issue_date            DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date              DATE        NOT NULL,
  subtotal              NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid           NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_outstanding    NUMERIC(14,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  currency              TEXT        NOT NULL DEFAULT 'NGN',
  notes                 TEXT,
  payment_instructions  TEXT,
  sent_at               TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  is_deleted            BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_invoices_updated_at
  BEFORE UPDATE ON diffusers.invoices
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE INDEX idx_diffusers_invoices_contact     ON diffusers.invoices (contact_id);
CREATE INDEX idx_diffusers_invoices_status      ON diffusers.invoices (status)             WHERE is_deleted = false;
CREATE INDEX idx_diffusers_invoices_outstanding ON diffusers.invoices (amount_outstanding) WHERE is_deleted = false;
CREATE INDEX idx_diffusers_invoices_due_date    ON diffusers.invoices (due_date, status)   WHERE is_deleted = false;

CREATE TABLE diffusers.invoice_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID        NOT NULL REFERENCES diffusers.invoices (invoice_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES diffusers.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price            NUMERIC(14,2) NOT NULL,
  discount_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_rate              NUMERIC(5,4) NOT NULL DEFAULT 0.075,
  vat_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total            NUMERIC(14,2) NOT NULL,
  display_order         SMALLINT    NOT NULL DEFAULT 0
);
CREATE INDEX idx_diffusers_invoice_lines ON diffusers.invoice_lines (invoice_id);

CREATE TABLE diffusers.invoice_payments (
  payment_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID        NOT NULL REFERENCES diffusers.invoices (invoice_id),
  payment_date          DATE        NOT NULL DEFAULT CURRENT_DATE,
  amount                NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method        TEXT        NOT NULL
                        CHECK (payment_method IN ('bank_transfer','pos_card','cash','paystack','flutterwave')),
  reference             TEXT,
  paystack_reference    TEXT,
  flutterwave_reference TEXT,
  is_confirmed          BOOLEAN     NOT NULL DEFAULT false,
  confirmed_at          TIMESTAMPTZ,
  recorded_by           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diffusers_invoice_payments ON diffusers.invoice_payments (invoice_id);

CREATE TABLE diffusers.credit_notes (
  credit_note_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number    TEXT        NOT NULL UNIQUE,
  invoice_id            UUID        NOT NULL REFERENCES diffusers.invoices (invoice_id),
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  reason                TEXT        NOT NULL,
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','issued','applied','refunded')),
  issued_at             TIMESTAMPTZ,
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_credit_notes_updated_at
  BEFORE UPDATE ON diffusers.credit_notes
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE TABLE diffusers.credit_note_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id        UUID        NOT NULL REFERENCES diffusers.credit_notes (credit_note_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES diffusers.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price            NUMERIC(14,2) NOT NULL,
  line_total            NUMERIC(14,2) NOT NULL
);
