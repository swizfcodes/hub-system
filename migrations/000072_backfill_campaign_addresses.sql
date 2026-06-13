-- ============================================================
-- MIGRATION 000072 — Backfill campaign-order delivery addresses
--
-- The campaign → ERP bridge created sales_orders WITHOUT the
-- delivery_address the customer typed at campaign checkout (it
-- lives on campaign_orders.delivery_address as JSONB). Staff then
-- hit Hand-to-Logistics with an empty address and had to re-key
-- it. The bridge inserts now carry the address; this repairs the
-- orders created before the fix.
--
-- Flattening matches lib/formatAddress.js:
--   "line1, area, city, state (landmark)"
-- ============================================================

DO $$
DECLARE
  biz TEXT;
BEGIN
  FOREACH biz IN ARRAY ARRAY['jewelry', 'diffusers'] LOOP
    EXECUTE format($f$
      UPDATE %1$I.sales_orders so
      SET delivery_address = NULLIF(
            CONCAT_WS(', ',
              NULLIF(TRIM(co.delivery_address->>'line1'), ''),
              NULLIF(TRIM(co.delivery_address->>'area'),  ''),
              NULLIF(TRIM(co.delivery_address->>'city'),  ''),
              NULLIF(TRIM(co.delivery_address->>'state'), '')
            ) ||
            CASE WHEN NULLIF(TRIM(co.delivery_address->>'landmark'), '') IS NOT NULL
                 THEN ' (' || TRIM(co.delivery_address->>'landmark') || ')'
                 ELSE '' END,
          '')
      FROM %1$I.campaign_orders co
      WHERE co.hub_order_id = so.order_id
        AND co.delivery_address IS NOT NULL
        AND (so.delivery_address IS NULL OR TRIM(so.delivery_address) = '')
    $f$, biz);
  END LOOP;
END $$;
