-- ============================================================
-- MIGRATION 000084 — Delivery fee on ERP sales orders
--
-- Web checkouts add a delivery fee to the amount the customer pays, but
-- when the paid order is mirrored into the ERP (diffusers.sales_orders),
-- only total_amount was stored — the fee was folded into the grand total
-- and subtotal was left NULL. The order view then showed the gross total
-- as the "Subtotal" with no Delivery line.
--
-- This adds a persisted delivery_fee so the order view can show the
-- proper breakdown (Subtotal + Delivery + Total), mirroring 000080 for
-- store/campaign orders.
--
--   • <biz>.sales_orders — delivery_fee NUMERIC, default 0 (walk-in /
--     pickup / pre-existing orders read as zero).
--
-- Backfill: for already-paid web orders, recover the fee from the linked
-- store.orders.delivery_fee_kobo and set subtotal = total_amount - fee
-- (the product subtotal) where subtotal is missing.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, default 0.
-- ============================================================

ALTER TABLE jewelry.sales_orders
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE diffusers.sales_orders
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Backfill existing diffusers web orders from their source store.orders.
-- store.orders holds kobo; sales_orders holds naira.
UPDATE diffusers.sales_orders so
   SET delivery_fee = COALESCE(o.delivery_fee_kobo, 0) / 100.0,
       subtotal     = COALESCE(so.subtotal,
                               so.total_amount - COALESCE(o.delivery_fee_kobo, 0) / 100.0)
  FROM store.orders o
 WHERE o.sales_order_id = so.order_id
   AND so.source = 'web'
   AND so.delivery_fee = 0;
