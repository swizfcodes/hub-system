-- ============================================================
-- MIGRATION 000051 — Stock batch / lot tracking
--
-- The storefront/ERP UI has a Batches feature (lib/schemas/stock
-- batchCreateSchema, services/stock/batches.ts) that had no backend
-- table. This creates stock_batches in both business schemas so the
-- GET/POST /stock/batches endpoints have somewhere to read/write.
--
-- remaining_quantity defaults to initial_quantity on insert and is
-- decremented as the lot is consumed (future work hooks movements to
-- it; for now it tracks the opening lot size).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS jewelry.stock_batches (
  batch_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID        NOT NULL REFERENCES jewelry.products (product_id) ON DELETE CASCADE,
  batch_number        TEXT        NOT NULL,
  manufactured_date   DATE,
  expiry_date         DATE,
  initial_quantity    INTEGER     NOT NULL CHECK (initial_quantity > 0),
  remaining_quantity  INTEGER     NOT NULL DEFAULT 0,
  location_id         UUID        REFERENCES jewelry.stock_locations (location_id) ON DELETE SET NULL,
  notes               TEXT,
  created_by          UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, batch_number)
);
CREATE INDEX IF NOT EXISTS idx_jewelry_stock_batches_product ON jewelry.stock_batches (product_id);
CREATE INDEX IF NOT EXISTS idx_jewelry_stock_batches_expiry  ON jewelry.stock_batches (expiry_date)
  WHERE expiry_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS diffusers.stock_batches (
  batch_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID        NOT NULL REFERENCES diffusers.products (product_id) ON DELETE CASCADE,
  batch_number        TEXT        NOT NULL,
  manufactured_date   DATE,
  expiry_date         DATE,
  initial_quantity    INTEGER     NOT NULL CHECK (initial_quantity > 0),
  remaining_quantity  INTEGER     NOT NULL DEFAULT 0,
  location_id         UUID        REFERENCES diffusers.stock_locations (location_id) ON DELETE SET NULL,
  notes               TEXT,
  created_by          UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, batch_number)
);
CREATE INDEX IF NOT EXISTS idx_diffusers_stock_batches_product ON diffusers.stock_batches (product_id);
CREATE INDEX IF NOT EXISTS idx_diffusers_stock_batches_expiry  ON diffusers.stock_batches (expiry_date)
  WHERE expiry_date IS NOT NULL;

COMMIT;
