-- ============================================================
-- MIGRATION 000007 — Per-business: Catalogue
-- product_categories, products, product_images,
-- product_suppliers, barcodes
-- Applied to BOTH jewelry and diffusers schemas.
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │  JEWELRY SCHEMA                                         │
-- └─────────────────────────────────────────────────────────┘

-- ── jewelry.product_categories ────────────────────────────
CREATE TABLE jewelry.product_categories (
  category_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL UNIQUE,
  parent_category_id    UUID        REFERENCES jewelry.product_categories (category_id) ON DELETE SET NULL,
  description           TEXT,
  display_order         SMALLINT    NOT NULL DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_jewelry_categories_updated_at
  BEFORE UPDATE ON jewelry.product_categories
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- ── jewelry.products ──────────────────────────────────────
CREATE TABLE jewelry.products (
  product_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                   TEXT        NOT NULL UNIQUE,
  name                  TEXT        NOT NULL,
  description           TEXT,
  category_id           UUID        REFERENCES jewelry.product_categories (category_id) ON DELETE SET NULL,
  cost_price            NUMERIC(14,2) NOT NULL DEFAULT 0,  -- restricted: hidden from sales role
  selling_price         NUMERIC(14,2) NOT NULL DEFAULT 0,
  min_selling_price     NUMERIC(14,2),                     -- POS discount floor
  currency              TEXT        NOT NULL DEFAULT 'NGN',
  weight_grams          NUMERIC(8,2),
  barcode               TEXT        UNIQUE,
  -- Business-specific dynamic fields (per custom_field_defs)
  -- Jewelry example: {"metal_type":"18k Yellow Gold","stone_type":"Diamond","weight_grams":4.2}
  custom_fields         JSONB       NOT NULL DEFAULT '{}',
  supplier_cert_number  TEXT,
  reorder_level         INTEGER     NOT NULL DEFAULT 0,
  reorder_quantity      INTEGER     NOT NULL DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  is_deleted            BOOLEAN     NOT NULL DEFAULT false,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

CREATE TRIGGER trg_jewelry_products_updated_at
  BEFORE UPDATE ON jewelry.products
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE INDEX idx_jewelry_products_sku      ON jewelry.products (sku);
CREATE INDEX idx_jewelry_products_barcode  ON jewelry.products (barcode)    WHERE barcode IS NOT NULL;
CREATE INDEX idx_jewelry_products_category ON jewelry.products (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_jewelry_products_active   ON jewelry.products (is_active)   WHERE is_deleted = false;

-- ── jewelry.product_images ────────────────────────────────
CREATE TABLE jewelry.product_images (
  image_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID        NOT NULL REFERENCES jewelry.products (product_id) ON DELETE CASCADE,
  document_id           UUID        NOT NULL REFERENCES shared.documents (document_id),
  is_primary            BOOLEAN     NOT NULL DEFAULT false,
  display_order         SMALLINT    NOT NULL DEFAULT 0,
  alt_text              TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jewelry_product_images ON jewelry.product_images (product_id);

-- ── jewelry.product_suppliers ─────────────────────────────
-- Many-to-many: product ↔ supplier
-- suppliers table created in migration 000014 (purchasing)
-- FK to suppliers added there via ALTER TABLE
CREATE TABLE jewelry.product_suppliers (
  product_id            UUID        NOT NULL REFERENCES jewelry.products (product_id) ON DELETE CASCADE,
  supplier_id           UUID        NOT NULL,           -- FK added in migration 000014
  supplier_sku          TEXT,
  unit_cost             NUMERIC(14,2),
  lead_time_days        SMALLINT,
  is_preferred          BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, supplier_id)
);

-- ── jewelry.barcodes ──────────────────────────────────────
-- Supports multiple scan codes per product (EAN-13, QR, custom)
CREATE TABLE jewelry.barcodes (
  barcode_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode_value         TEXT        NOT NULL UNIQUE,
  product_id            UUID        NOT NULL REFERENCES jewelry.products (product_id) ON DELETE CASCADE,
  barcode_type          TEXT        NOT NULL DEFAULT 'EAN13',  -- 'EAN13','QR','CODE128','custom'
  is_primary            BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jewelry_barcodes_value   ON jewelry.barcodes (barcode_value);
CREATE INDEX idx_jewelry_barcodes_product ON jewelry.barcodes (product_id);


-- ┌─────────────────────────────────────────────────────────┐
-- │  DIFFUSERS SCHEMA                                       │
-- └─────────────────────────────────────────────────────────┘

-- ── diffusers.product_categories ──────────────────────────
CREATE TABLE diffusers.product_categories (
  category_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL UNIQUE,
  parent_category_id    UUID        REFERENCES diffusers.product_categories (category_id) ON DELETE SET NULL,
  description           TEXT,
  display_order         SMALLINT    NOT NULL DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_diffusers_categories_updated_at
  BEFORE UPDATE ON diffusers.product_categories
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- ── diffusers.products ────────────────────────────────────
CREATE TABLE diffusers.products (
  product_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                   TEXT        NOT NULL UNIQUE,
  name                  TEXT        NOT NULL,
  description           TEXT,
  category_id           UUID        REFERENCES diffusers.product_categories (category_id) ON DELETE SET NULL,
  cost_price            NUMERIC(14,2) NOT NULL DEFAULT 0,
  selling_price         NUMERIC(14,2) NOT NULL DEFAULT 0,
  min_selling_price     NUMERIC(14,2),
  currency              TEXT        NOT NULL DEFAULT 'NGN',
  weight_grams          NUMERIC(8,2),
  barcode               TEXT        UNIQUE,
  -- Diffuser example: {"fragrance_family":"Floral","diffuser_type":"Reed","volume_ml":200,"burn_time_hrs":60}
  custom_fields         JSONB       NOT NULL DEFAULT '{}',
  supplier_cert_number  TEXT,
  reorder_level         INTEGER     NOT NULL DEFAULT 0,
  reorder_quantity      INTEGER     NOT NULL DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  is_deleted            BOOLEAN     NOT NULL DEFAULT false,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

CREATE TRIGGER trg_diffusers_products_updated_at
  BEFORE UPDATE ON diffusers.products
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE INDEX idx_diffusers_products_sku      ON diffusers.products (sku);
CREATE INDEX idx_diffusers_products_barcode  ON diffusers.products (barcode)     WHERE barcode IS NOT NULL;
CREATE INDEX idx_diffusers_products_category ON diffusers.products (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_diffusers_products_active   ON diffusers.products (is_active)    WHERE is_deleted = false;

-- ── diffusers.product_images ──────────────────────────────
CREATE TABLE diffusers.product_images (
  image_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID        NOT NULL REFERENCES diffusers.products (product_id) ON DELETE CASCADE,
  document_id           UUID        NOT NULL REFERENCES shared.documents (document_id),
  is_primary            BOOLEAN     NOT NULL DEFAULT false,
  display_order         SMALLINT    NOT NULL DEFAULT 0,
  alt_text              TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_diffusers_product_images ON diffusers.product_images (product_id);

-- ── diffusers.product_suppliers ───────────────────────────
CREATE TABLE diffusers.product_suppliers (
  product_id            UUID        NOT NULL REFERENCES diffusers.products (product_id) ON DELETE CASCADE,
  supplier_id           UUID        NOT NULL,           -- FK added in migration 000014
  supplier_sku          TEXT,
  unit_cost             NUMERIC(14,2),
  lead_time_days        SMALLINT,
  is_preferred          BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, supplier_id)
);

-- ── diffusers.barcodes ────────────────────────────────────
CREATE TABLE diffusers.barcodes (
  barcode_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode_value         TEXT        NOT NULL UNIQUE,
  product_id            UUID        NOT NULL REFERENCES diffusers.products (product_id) ON DELETE CASCADE,
  barcode_type          TEXT        NOT NULL DEFAULT 'EAN13',
  is_primary            BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_diffusers_barcodes_value   ON diffusers.barcodes (barcode_value);
CREATE INDEX idx_diffusers_barcodes_product ON diffusers.barcodes (product_id);

-- ============================================================
-- Verify
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema IN ('jewelry','diffusers')
-- ORDER BY table_schema, table_name;
-- Expected: 5 tables in each schema = 10 rows
-- ============================================================
