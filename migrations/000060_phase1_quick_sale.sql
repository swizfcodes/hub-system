-- ============================================================
-- MIGRATION 000060 — Phase 1: Quick Sale & Unified Orders
--
-- 1. Expand sales_orders.source CHECK to include pos, campaign, direct
-- 2. Add currency/exchange columns to sales_orders
-- 3. Add subtotal, discount_total, vat_amount to sales_orders
-- 4. Add pos_transaction_id link for POS bridge
-- 5. Add pending_proof status for campaign orders in unified view
-- ============================================================

-- ── JEWELRY ─────────────────────────────────────────────────

-- 1. Expand source CHECK
ALTER TABLE jewelry.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_source_check;
ALTER TABLE jewelry.sales_orders ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE jewelry.sales_orders
  ADD CONSTRAINT sales_orders_source_check
  CHECK (source IN ('manual', 'web', 'pos', 'campaign', 'direct'));

-- 2. Currency / exchange rate columns
ALTER TABLE jewelry.sales_orders
  ADD COLUMN IF NOT EXISTS currency       TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS exchange_rate  NUMERIC(15,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amount_foreign NUMERIC(14,2);

-- 3. Financial breakdown columns
ALTER TABLE jewelry.sales_orders
  ADD COLUMN IF NOT EXISTS subtotal       NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount     NUMERIC(14,2) DEFAULT 0;

-- 4. POS bridge link
ALTER TABLE jewelry.sales_orders
  ADD COLUMN IF NOT EXISTS pos_transaction_id UUID;

-- 5. Expand status CHECK to include pending_proof
ALTER TABLE jewelry.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check;
ALTER TABLE jewelry.sales_orders
  ADD CONSTRAINT sales_orders_status_check
  CHECK (status IN ('pending_proof', 'confirmed', 'partially_fulfilled',
                    'fulfilled', 'awaiting_dispatch', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_jewelry_sales_orders_source
  ON jewelry.sales_orders (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jewelry_sales_orders_pos_tx
  ON jewelry.sales_orders (pos_transaction_id)
  WHERE pos_transaction_id IS NOT NULL;

-- ── DIFFUSERS ───────────────────────────────────────────────

-- 1. Expand source CHECK
ALTER TABLE diffusers.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_source_check;
ALTER TABLE diffusers.sales_orders ALTER COLUMN source SET DEFAULT 'manual';
ALTER TABLE diffusers.sales_orders
  ADD CONSTRAINT sales_orders_source_check
  CHECK (source IN ('manual', 'web', 'pos', 'campaign', 'direct'));

-- 2. Currency / exchange rate columns
ALTER TABLE diffusers.sales_orders
  ADD COLUMN IF NOT EXISTS currency       TEXT NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS exchange_rate  NUMERIC(15,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amount_foreign NUMERIC(14,2);

-- 3. Financial breakdown columns
ALTER TABLE diffusers.sales_orders
  ADD COLUMN IF NOT EXISTS subtotal       NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount     NUMERIC(14,2) DEFAULT 0;

-- 4. POS bridge link
ALTER TABLE diffusers.sales_orders
  ADD COLUMN IF NOT EXISTS pos_transaction_id UUID;

-- 5. Expand status CHECK to include pending_proof
ALTER TABLE diffusers.sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check;
ALTER TABLE diffusers.sales_orders
  ADD CONSTRAINT sales_orders_status_check
  CHECK (status IN ('pending_proof', 'confirmed', 'partially_fulfilled',
                    'fulfilled', 'awaiting_dispatch', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_diffusers_sales_orders_source
  ON diffusers.sales_orders (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diffusers_sales_orders_pos_tx
  ON diffusers.sales_orders (pos_transaction_id)
  WHERE pos_transaction_id IS NOT NULL;