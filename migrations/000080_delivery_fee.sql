-- ============================================================
-- MIGRATION 000053 — Delivery fee on storefront orders
--
-- Adds a persisted delivery fee to both storefront order tables so the
-- checkout breakdown (Subtotal + Delivery + Total) is stored, not just
-- displayed. Fees are derived server-side from the destination + cart
-- size per the Orika delivery policy (config/deliveryFee.js).
--
--   • store.orders            — single-tenant Orika Living store (kobo).
--   • <biz>.campaign_orders   — sales-campaign storefront (naira).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, default 0 (pickup / pre-existing
-- orders read as zero).
-- ============================================================

ALTER TABLE store.orders
  ADD COLUMN IF NOT EXISTS delivery_fee_kobo INTEGER NOT NULL DEFAULT 0;

ALTER TABLE jewelry.campaign_orders
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE diffusers.campaign_orders
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0;
