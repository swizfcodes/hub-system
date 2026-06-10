-- ─────────────────────────────────────────────────────────────
-- 000067 — Logistics: manual couriers, drivers, standalone deliveries
--
--   1. Driver / manual-courier fields on deliveries
--      (courier_company e.g. "Uber"/"Bolt"/"inDrive", driver_name,
--       driver_phone) + names captured at signing
--   2. Standalone deliveries: reference_type gains 'manual' and
--      reference_id becomes nullable, so a delivery can be created
--      without a sales order / POS transaction behind it
--
-- Mirrored in migrations/template so new businesses match.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  biz TEXT;
BEGIN
  FOREACH biz IN ARRAY ARRAY['jewelry', 'diffusers'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = biz) THEN
      CONTINUE;
    END IF;

    -- 1. Driver / manual-courier details
    EXECUTE format($f$
      ALTER TABLE %I.deliveries
        ADD COLUMN IF NOT EXISTS courier_company      TEXT,
        ADD COLUMN IF NOT EXISTS driver_name          TEXT,
        ADD COLUMN IF NOT EXISTS driver_phone         TEXT,
        ADD COLUMN IF NOT EXISTS customer_signed_name TEXT,
        ADD COLUMN IF NOT EXISTS driver_signed_name   TEXT
    $f$, biz);

    -- 2. Standalone deliveries
    EXECUTE format(
      'ALTER TABLE %I.deliveries ALTER COLUMN reference_id DROP NOT NULL',
      biz
    );
    EXECUTE format(
      'ALTER TABLE %I.deliveries DROP CONSTRAINT IF EXISTS deliveries_reference_type_check',
      biz
    );
    EXECUTE format($f$
      ALTER TABLE %I.deliveries
        ADD CONSTRAINT deliveries_reference_type_check
        CHECK (reference_type IN ('pos_transaction','sales_order','manual'))
    $f$, biz);
  END LOOP;
END $$;
