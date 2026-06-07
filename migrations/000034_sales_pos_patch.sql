-- ============================================================
-- MIGRATION 000034 — Sales & POS sprint patch
--
-- Required for the patched sales.routes.js / sales.service.js /
-- sales.repository.js to function. Applies to BOTH business schemas.
--
-- Changes:
--   1. sales_orders — add deal_id, awaiting_dispatch status, dispatch fields
--   2. invoices     — add deal_id and payment-link columns
--   3. receipts     — new per-business table
--   4. document_numbering — seed receipt sequence
--
-- Re-runnable (uses IF NOT EXISTS / DO blocks for the CHECK swap).
-- ============================================================

-- ============================================================
-- JEWELRY schema
-- ============================================================

-- ── sales_orders: deal_id + awaiting_dispatch + dispatch columns ─────────────
ALTER TABLE jewelry.sales_orders
  ADD COLUMN IF NOT EXISTS deal_id            UUID
                           REFERENCES jewelry.crm_deals (deal_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_address   TEXT,
  ADD COLUMN IF NOT EXISTS delivery_notes     TEXT,
  ADD COLUMN IF NOT EXISTS courier_preference TEXT;

-- Extend the status CHECK to include 'awaiting_dispatch'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'jewelry.sales_orders'::regclass
      AND conname  = 'sales_orders_status_check'
  ) THEN
    ALTER TABLE jewelry.sales_orders DROP CONSTRAINT sales_orders_status_check;
  END IF;
END $$;
ALTER TABLE jewelry.sales_orders
  ADD CONSTRAINT sales_orders_status_check
  CHECK (status IN ('confirmed','partially_fulfilled','fulfilled',
                    'awaiting_dispatch','cancelled'));

CREATE INDEX IF NOT EXISTS idx_jewelry_sales_orders_deal
  ON jewelry.sales_orders (deal_id)
  WHERE deal_id IS NOT NULL;

-- ── invoices: deal_id + payment-link columns ─────────────────────────────────
ALTER TABLE jewelry.invoices
  ADD COLUMN IF NOT EXISTS deal_id                  UUID
                           REFERENCES jewelry.crm_deals (deal_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paystack_payment_url     TEXT,
  ADD COLUMN IF NOT EXISTS paystack_reference       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_url       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_jewelry_invoices_paystack_ref
  ON jewelry.invoices (paystack_reference)
  WHERE paystack_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jewelry_invoices_stripe_intent
  ON jewelry.invoices (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jewelry_invoices_deal
  ON jewelry.invoices (deal_id)
  WHERE deal_id IS NOT NULL;

-- ── receipts: new per-business table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jewelry.receipts (
  receipt_id        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number    TEXT          NOT NULL UNIQUE,
  invoice_id        UUID          NOT NULL
                    REFERENCES jewelry.invoices (invoice_id) ON DELETE RESTRICT,
  payment_id        UUID          REFERENCES jewelry.invoice_payments (payment_id) ON DELETE SET NULL,
  contact_id        UUID          NOT NULL REFERENCES shared.contacts (contact_id) ON DELETE RESTRICT,
  order_id          UUID          REFERENCES jewelry.sales_orders (order_id) ON DELETE SET NULL,
  deal_id           UUID          REFERENCES jewelry.crm_deals (deal_id) ON DELETE SET NULL,
  amount            NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency          TEXT          NOT NULL DEFAULT 'NGN',
  payment_method    TEXT          NOT NULL
                    CHECK (payment_method IN
                      ('bank_transfer','pos_card','cash','paystack','stripe')),
  payment_reference TEXT,
  notes             TEXT,
  issued_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  issued_by         UUID          REFERENCES shared.users (user_id) ON DELETE SET NULL,
  is_voided         BOOLEAN       NOT NULL DEFAULT false,
  voided_at         TIMESTAMPTZ,
  voided_by         UUID          REFERENCES shared.users (user_id) ON DELETE SET NULL,
  void_reason       TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jewelry_receipts_invoice ON jewelry.receipts (invoice_id);
CREATE INDEX IF NOT EXISTS idx_jewelry_receipts_contact ON jewelry.receipts (contact_id);
CREATE INDEX IF NOT EXISTS idx_jewelry_receipts_issued  ON jewelry.receipts (issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_jewelry_receipts_number  ON jewelry.receipts (receipt_number);

-- ============================================================
-- DIFFUSERS schema (identical changes)
-- ============================================================

ALTER TABLE diffusers.sales_orders
  ADD COLUMN IF NOT EXISTS deal_id            UUID
                           REFERENCES diffusers.crm_deals (deal_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_address   TEXT,
  ADD COLUMN IF NOT EXISTS delivery_notes     TEXT,
  ADD COLUMN IF NOT EXISTS courier_preference TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'diffusers.sales_orders'::regclass
      AND conname  = 'sales_orders_status_check'
  ) THEN
    ALTER TABLE diffusers.sales_orders DROP CONSTRAINT sales_orders_status_check;
  END IF;
END $$;
ALTER TABLE diffusers.sales_orders
  ADD CONSTRAINT sales_orders_status_check
  CHECK (status IN ('confirmed','partially_fulfilled','fulfilled',
                    'awaiting_dispatch','cancelled'));

CREATE INDEX IF NOT EXISTS idx_diffusers_sales_orders_deal
  ON diffusers.sales_orders (deal_id)
  WHERE deal_id IS NOT NULL;

ALTER TABLE diffusers.invoices
  ADD COLUMN IF NOT EXISTS deal_id                  UUID
                           REFERENCES diffusers.crm_deals (deal_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paystack_payment_url     TEXT,
  ADD COLUMN IF NOT EXISTS paystack_reference       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_url       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_diffusers_invoices_paystack_ref
  ON diffusers.invoices (paystack_reference)
  WHERE paystack_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diffusers_invoices_stripe_intent
  ON diffusers.invoices (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diffusers_invoices_deal
  ON diffusers.invoices (deal_id)
  WHERE deal_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS diffusers.receipts (
  receipt_id        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number    TEXT          NOT NULL UNIQUE,
  invoice_id        UUID          NOT NULL
                    REFERENCES diffusers.invoices (invoice_id) ON DELETE RESTRICT,
  payment_id        UUID          REFERENCES diffusers.invoice_payments (payment_id) ON DELETE SET NULL,
  contact_id        UUID          NOT NULL REFERENCES shared.contacts (contact_id) ON DELETE RESTRICT,
  order_id          UUID          REFERENCES diffusers.sales_orders (order_id) ON DELETE SET NULL,
  deal_id           UUID          REFERENCES diffusers.crm_deals (deal_id) ON DELETE SET NULL,
  amount            NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency          TEXT          NOT NULL DEFAULT 'NGN',
  payment_method    TEXT          NOT NULL
                    CHECK (payment_method IN
                      ('bank_transfer','pos_card','cash','paystack','stripe')),
  payment_reference TEXT,
  notes             TEXT,
  issued_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  issued_by         UUID          REFERENCES shared.users (user_id) ON DELETE SET NULL,
  is_voided         BOOLEAN       NOT NULL DEFAULT false,
  voided_at         TIMESTAMPTZ,
  voided_by         UUID          REFERENCES shared.users (user_id) ON DELETE SET NULL,
  void_reason       TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diffusers_receipts_invoice ON diffusers.receipts (invoice_id);
CREATE INDEX IF NOT EXISTS idx_diffusers_receipts_contact ON diffusers.receipts (contact_id);
CREATE INDEX IF NOT EXISTS idx_diffusers_receipts_issued  ON diffusers.receipts (issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_diffusers_receipts_number  ON diffusers.receipts (receipt_number);

-- ============================================================
-- Document numbering sequences for receipts (one per business)
-- ============================================================

INSERT INTO shared.document_numbering (business, document_type, prefix, next_number, padding)
VALUES
  ('jewelry',   'receipt', 'JWL-RCT', 1, 4),
  ('diffusers', 'receipt', 'OLV-RCT', 1, 4)
ON CONFLICT (business, document_type) DO NOTHING;
