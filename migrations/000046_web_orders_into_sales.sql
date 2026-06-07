-- ============================================================
-- MIGRATION 000044 — Web orders flow into the ERP sales pipeline
--
-- Storefront orders should appear in ERP Sales like any other
-- order. To support that:
--
--   1. sales_orders gains a `source` column ('manual' | 'web')
--      so ERP Sales can distinguish and filter web orders.
--      Added to BOTH business schemas for symmetry, though only
--      diffusers receives web orders today.
--
--   2. store.orders gains `sales_order_id`, linking each web
--      order to the diffusers.sales_orders row it created. This
--      keeps store.orders as the customer-facing record while
--      sales_orders becomes the ERP source of truth.
--
-- Additive and safe: existing rows default to source='manual'
-- and sales_order_id stays NULL.
-- ============================================================

-- 1. source column on sales_orders (both schemas) -------------
ALTER TABLE jewelry.sales_orders
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'web'));

ALTER TABLE diffusers.sales_orders
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'web'));

CREATE INDEX IF NOT EXISTS diffusers_sales_orders_source_idx
  ON diffusers.sales_orders (source, created_at DESC);

-- 2. link column on store.orders ------------------------------
ALTER TABLE store.orders
  ADD COLUMN IF NOT EXISTS sales_order_id UUID
  REFERENCES diffusers.sales_orders (order_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS store_orders_sales_order_idx
  ON store.orders (sales_order_id);
