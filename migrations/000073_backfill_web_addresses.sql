-- ============================================================
-- MIGRATION 000073 — Backfill web-store delivery addresses
--
-- Same class of bug as the campaign bridge (000072): the web-store
-- → ERP bridge (insertSalesOrderForWeb) created diffusers.sales_orders
-- WITHOUT the delivery address the customer entered at checkout, even
-- though it lives on store.orders.delivery_address (JSONB). Hand-to-
-- Logistics then opened blank for website orders.
--
-- The bridge now carries the address; this repairs the web orders
-- created before the fix. The web store is diffusers-only, and the
-- link is store.orders.sales_order_id → diffusers.sales_orders.order_id.
--
-- Flattening matches lib/formatAddress.js:
--   "line1, area, city, state (landmark)"
-- ============================================================

UPDATE diffusers.sales_orders so
SET delivery_address = NULLIF(
      CONCAT_WS(', ',
        NULLIF(TRIM(o.delivery_address->>'line1'), ''),
        NULLIF(TRIM(o.delivery_address->>'area'),  ''),
        NULLIF(TRIM(o.delivery_address->>'city'),  ''),
        NULLIF(TRIM(o.delivery_address->>'state'), '')
      ) ||
      CASE WHEN NULLIF(TRIM(o.delivery_address->>'landmark'), '') IS NOT NULL
           THEN ' (' || TRIM(o.delivery_address->>'landmark') || ')'
           ELSE '' END,
    '')
FROM store.orders o
WHERE o.sales_order_id = so.order_id
  AND o.delivery_address IS NOT NULL
  AND (so.delivery_address IS NULL OR TRIM(so.delivery_address) = '');
