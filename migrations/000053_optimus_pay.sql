-- 000053_optimus_pay.sql
-- Add Optimus Pay (OnePipe virtual-account) as a parallel payment gateway
-- alongside Paystack. No existing data or constraints are removed.
--
-- Changes:
--   1. invoice_payments (jewelry + diffusers)
--      • Add optimus_pay to the payment_method CHECK
--      • Add optimus_transaction_ref  TEXT  — the transaction_ref we sent to OnePipe
--      • Add optimus_virtual_account  TEXT  — the virtual account number returned
--      • Add optimus_bank_name        TEXT  — bank name shown to customer
--      • Add index on optimus_transaction_ref
--
--   2. campaign_orders (jewelry + diffusers)
--      • Add optimus_pay to the payment_method CHECK
--      • Add optimus_transaction_ref  TEXT
--      • Add optimus_virtual_account  TEXT
--      • Add optimus_bank_name        TEXT
--      • Add index on optimus_transaction_ref
--
--   3. store.orders
--      • Add optimus_transaction_ref  TEXT
--      • Add optimus_virtual_account  TEXT
--      • Add optimus_bank_name        TEXT
--      • Add index on optimus_transaction_ref

-- ── 1a. jewelry.invoice_payments ─────────────────────────────────────────────

ALTER TABLE jewelry.invoice_payments
  DROP CONSTRAINT IF EXISTS invoice_payments_payment_method_check;

ALTER TABLE jewelry.invoice_payments
  ADD CONSTRAINT invoice_payments_payment_method_check
    CHECK (payment_method IN (
      'bank_transfer','pos_card','cash','paystack','flutterwave','optimus_pay'
    ));

ALTER TABLE jewelry.invoice_payments
  ADD COLUMN IF NOT EXISTS optimus_transaction_ref  TEXT,
  ADD COLUMN IF NOT EXISTS optimus_virtual_account  TEXT,
  ADD COLUMN IF NOT EXISTS optimus_bank_name        TEXT;

CREATE INDEX IF NOT EXISTS idx_jewelry_invoice_payments_optimus
  ON jewelry.invoice_payments (optimus_transaction_ref)
  WHERE optimus_transaction_ref IS NOT NULL;

-- ── 1b. diffusers.invoice_payments ───────────────────────────────────────────

ALTER TABLE diffusers.invoice_payments
  DROP CONSTRAINT IF EXISTS invoice_payments_payment_method_check;

ALTER TABLE diffusers.invoice_payments
  ADD CONSTRAINT invoice_payments_payment_method_check
    CHECK (payment_method IN (
      'bank_transfer','pos_card','cash','paystack','flutterwave','optimus_pay'
    ));

ALTER TABLE diffusers.invoice_payments
  ADD COLUMN IF NOT EXISTS optimus_transaction_ref  TEXT,
  ADD COLUMN IF NOT EXISTS optimus_virtual_account  TEXT,
  ADD COLUMN IF NOT EXISTS optimus_bank_name        TEXT;

CREATE INDEX IF NOT EXISTS idx_diffusers_invoice_payments_optimus
  ON diffusers.invoice_payments (optimus_transaction_ref)
  WHERE optimus_transaction_ref IS NOT NULL;

-- ── 2a. jewelry.campaign_orders ──────────────────────────────────────────────

ALTER TABLE jewelry.campaign_orders
  DROP CONSTRAINT IF EXISTS campaign_orders_payment_method_check;

ALTER TABLE jewelry.campaign_orders
  ADD CONSTRAINT campaign_orders_payment_method_check
    CHECK (payment_method IN ('paystack', 'bank_transfer', 'optimus_pay'));

ALTER TABLE jewelry.campaign_orders
  ADD COLUMN IF NOT EXISTS optimus_transaction_ref  TEXT,
  ADD COLUMN IF NOT EXISTS optimus_virtual_account  TEXT,
  ADD COLUMN IF NOT EXISTS optimus_bank_name        TEXT;

CREATE INDEX IF NOT EXISTS idx_j_campaign_orders_optimus
  ON jewelry.campaign_orders (optimus_transaction_ref)
  WHERE optimus_transaction_ref IS NOT NULL;

-- ── 2b. diffusers.campaign_orders ────────────────────────────────────────────

ALTER TABLE diffusers.campaign_orders
  DROP CONSTRAINT IF EXISTS campaign_orders_payment_method_check;

ALTER TABLE diffusers.campaign_orders
  ADD CONSTRAINT campaign_orders_payment_method_check
    CHECK (payment_method IN ('paystack', 'bank_transfer', 'optimus_pay'));

ALTER TABLE diffusers.campaign_orders
  ADD COLUMN IF NOT EXISTS optimus_transaction_ref  TEXT,
  ADD COLUMN IF NOT EXISTS optimus_virtual_account  TEXT,
  ADD COLUMN IF NOT EXISTS optimus_bank_name        TEXT;

CREATE INDEX IF NOT EXISTS idx_d_campaign_orders_optimus
  ON diffusers.campaign_orders (optimus_transaction_ref)
  WHERE optimus_transaction_ref IS NOT NULL;

-- ── 3. store.orders ──────────────────────────────────────────────────────────

ALTER TABLE store.orders
  ADD COLUMN IF NOT EXISTS optimus_transaction_ref  TEXT,
  ADD COLUMN IF NOT EXISTS optimus_virtual_account  TEXT,
  ADD COLUMN IF NOT EXISTS optimus_bank_name        TEXT;

CREATE INDEX IF NOT EXISTS store_orders_optimus_ref_idx
  ON store.orders (optimus_transaction_ref)
  WHERE optimus_transaction_ref IS NOT NULL;
