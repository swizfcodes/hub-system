-- ============================================================
-- MIGRATION 000014 — Per-business: Purchasing
-- suppliers, rfqs, rfq_lines, supplier_quotes,
-- purchase_orders, po_lines, goods_received,
-- goods_received_lines, supplier_invoices
-- Also wires up deferred FK on product_suppliers
-- ============================================================

-- ┌── JEWELRY ──────────────────────────────────────────────┐

CREATE TABLE jewelry.suppliers (
  supplier_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID        NOT NULL UNIQUE REFERENCES shared.contacts (contact_id),
  supplier_code         TEXT        NOT NULL UNIQUE,
  payment_terms_days    SMALLINT    NOT NULL DEFAULT 30,
  preferred_currency    TEXT        NOT NULL DEFAULT 'USD',
  lead_time_days        SMALLINT,
  -- Secure self-service portal link for RFQ responses
  portal_access_token   TEXT        UNIQUE,
  rating                SMALLINT    DEFAULT 3 CHECK (rating BETWEEN 1 AND 5),
  credit_limit          NUMERIC(14,2) DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_suppliers_updated_at
  BEFORE UPDATE ON jewelry.suppliers
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_suppliers_code ON jewelry.suppliers (supplier_code);

-- Now wire up deferred FK on product_suppliers
ALTER TABLE jewelry.product_suppliers
  ADD CONSTRAINT fk_jewelry_product_suppliers_supplier
    FOREIGN KEY (supplier_id) REFERENCES jewelry.suppliers (supplier_id) ON DELETE CASCADE;

-- Wire up stock_locations.partner_id once retail_partners exists (done in 000017)
-- for now we leave it as nullable UUID

CREATE TABLE jewelry.rfqs (
  rfq_id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number            TEXT        NOT NULL UNIQUE,
  title                 TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','responses_received','closed','cancelled')),
  response_deadline     DATE,
  notes                 TEXT,
  created_by            UUID        NOT NULL REFERENCES shared.users (user_id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_rfqs_updated_at
  BEFORE UPDATE ON jewelry.rfqs
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE TABLE jewelry.rfq_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id                UUID        NOT NULL REFERENCES jewelry.rfqs (rfq_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES jewelry.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity_needed       INTEGER     NOT NULL CHECK (quantity_needed > 0),
  target_price          NUMERIC(14,2),
  notes                 TEXT
);
CREATE INDEX idx_jewelry_rfq_lines ON jewelry.rfq_lines (rfq_id);

CREATE TABLE jewelry.supplier_quotes (
  quote_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id                UUID        NOT NULL REFERENCES jewelry.rfqs (rfq_id) ON DELETE CASCADE,
  supplier_id           UUID        NOT NULL REFERENCES jewelry.suppliers (supplier_id),
  rfq_line_id           UUID        REFERENCES jewelry.rfq_lines (line_id) ON DELETE CASCADE,
  unit_price            NUMERIC(14,2) NOT NULL,
  currency              TEXT        NOT NULL DEFAULT 'USD',
  lead_time_days        SMALLINT,
  valid_until           DATE,
  notes                 TEXT,
  status                TEXT        NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received','accepted','rejected')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_supplier_quotes_rfq ON jewelry.supplier_quotes (rfq_id, supplier_id);

CREATE TABLE jewelry.purchase_orders (
  po_id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number             TEXT        NOT NULL UNIQUE,
  supplier_id           UUID        NOT NULL REFERENCES jewelry.suppliers (supplier_id),
  rfq_id                UUID        REFERENCES jewelry.rfqs (rfq_id) ON DELETE SET NULL,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','acknowledged','partially_received',
                                          'received','invoiced','paid','cancelled')),
  order_date            DATE        NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery     DATE,
  delivery_address      TEXT,
  subtotal              NUMERIC(14,2) NOT NULL DEFAULT 0,
  shipping_cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
  import_duty           NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_charges         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency              TEXT        NOT NULL DEFAULT 'USD',
  exchange_rate         NUMERIC(10,4),
  ngn_equivalent        NUMERIC(14,2),
  notes                 TEXT,
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  created_by            UUID        NOT NULL REFERENCES shared.users (user_id),
  is_deleted            BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_pos_updated_at
  BEFORE UPDATE ON jewelry.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_purchase_orders_supplier ON jewelry.purchase_orders (supplier_id, status);
CREATE INDEX idx_jewelry_purchase_orders_status   ON jewelry.purchase_orders (status)
  WHERE is_deleted = false;

CREATE TABLE jewelry.po_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id                 UUID        NOT NULL REFERENCES jewelry.purchase_orders (po_id) ON DELETE CASCADE,
  product_id            UUID        NOT NULL REFERENCES jewelry.products (product_id),
  quantity_ordered      INTEGER     NOT NULL CHECK (quantity_ordered > 0),
  quantity_received     INTEGER     NOT NULL DEFAULT 0,
  unit_price            NUMERIC(14,2) NOT NULL,
  line_total            NUMERIC(14,2) NOT NULL,
  tracking_number       TEXT
);
CREATE INDEX idx_jewelry_po_lines ON jewelry.po_lines (po_id);

CREATE TABLE jewelry.goods_received (
  receipt_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id                 UUID        NOT NULL REFERENCES jewelry.purchase_orders (po_id),
  received_date         DATE        NOT NULL DEFAULT CURRENT_DATE,
  received_by           UUID        NOT NULL REFERENCES shared.users (user_id),
  warehouse_location_id UUID        REFERENCES jewelry.stock_locations (location_id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_goods_received_po ON jewelry.goods_received (po_id);

CREATE TABLE jewelry.goods_received_lines (
  gr_line_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id            UUID        NOT NULL REFERENCES jewelry.goods_received (receipt_id) ON DELETE CASCADE,
  po_line_id            UUID        NOT NULL REFERENCES jewelry.po_lines (line_id),
  quantity_received     INTEGER     NOT NULL CHECK (quantity_received >= 0),
  quantity_accepted     INTEGER     NOT NULL CHECK (quantity_accepted >= 0),
  quantity_rejected     INTEGER     NOT NULL DEFAULT 0,
  rejection_reason      TEXT,
  quality_status        TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (quality_status IN ('pending','accepted','partially_rejected','rejected'))
);
CREATE INDEX idx_jewelry_gr_lines_receipt ON jewelry.goods_received_lines (receipt_id);

CREATE TABLE jewelry.supplier_invoices (
  sup_invoice_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id           UUID        NOT NULL REFERENCES jewelry.suppliers (supplier_id),
  po_id                 UUID        REFERENCES jewelry.purchase_orders (po_id) ON DELETE SET NULL,
  supplier_invoice_number TEXT      NOT NULL,
  invoice_date          DATE        NOT NULL,
  due_date              DATE        NOT NULL,
  amount                NUMERIC(14,2) NOT NULL,
  currency              TEXT        NOT NULL,
  amount_ngn            NUMERIC(14,2),
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','matched','approved','paid','disputed')),
  amount_paid           NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_at               TIMESTAMPTZ,
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_sup_invoices_updated_at
  BEFORE UPDATE ON jewelry.supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_supplier_invoices_supplier ON jewelry.supplier_invoices (supplier_id, status);
CREATE INDEX idx_jewelry_supplier_invoices_po       ON jewelry.supplier_invoices (po_id)
  WHERE po_id IS NOT NULL;


-- ┌── DIFFUSERS ────────────────────────────────────────────┐

CREATE TABLE diffusers.suppliers (
  supplier_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID        NOT NULL UNIQUE REFERENCES shared.contacts (contact_id),
  supplier_code         TEXT        NOT NULL UNIQUE,
  payment_terms_days    SMALLINT    NOT NULL DEFAULT 30,
  preferred_currency    TEXT        NOT NULL DEFAULT 'USD',
  lead_time_days        SMALLINT,
  portal_access_token   TEXT        UNIQUE,
  rating                SMALLINT    DEFAULT 3 CHECK (rating BETWEEN 1 AND 5),
  credit_limit          NUMERIC(14,2) DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_suppliers_updated_at
  BEFORE UPDATE ON diffusers.suppliers
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

ALTER TABLE diffusers.product_suppliers
  ADD CONSTRAINT fk_diffusers_product_suppliers_supplier
    FOREIGN KEY (supplier_id) REFERENCES diffusers.suppliers (supplier_id) ON DELETE CASCADE;

CREATE TABLE diffusers.rfqs (
  rfq_id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number            TEXT        NOT NULL UNIQUE,
  title                 TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','responses_received','closed','cancelled')),
  response_deadline     DATE,
  notes                 TEXT,
  created_by            UUID        NOT NULL REFERENCES shared.users (user_id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_rfqs_updated_at BEFORE UPDATE ON diffusers.rfqs FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE TABLE diffusers.rfq_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id                UUID        NOT NULL REFERENCES diffusers.rfqs (rfq_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES diffusers.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity_needed       INTEGER     NOT NULL CHECK (quantity_needed > 0),
  target_price          NUMERIC(14,2),
  notes                 TEXT
);

CREATE TABLE diffusers.supplier_quotes (
  quote_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id                UUID        NOT NULL REFERENCES diffusers.rfqs (rfq_id) ON DELETE CASCADE,
  supplier_id           UUID        NOT NULL REFERENCES diffusers.suppliers (supplier_id),
  rfq_line_id           UUID        REFERENCES diffusers.rfq_lines (line_id) ON DELETE CASCADE,
  unit_price            NUMERIC(14,2) NOT NULL,
  currency              TEXT        NOT NULL DEFAULT 'USD',
  lead_time_days        SMALLINT,
  valid_until           DATE,
  notes                 TEXT,
  status                TEXT        NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received','accepted','rejected')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diffusers.purchase_orders (
  po_id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number             TEXT        NOT NULL UNIQUE,
  supplier_id           UUID        NOT NULL REFERENCES diffusers.suppliers (supplier_id),
  rfq_id                UUID        REFERENCES diffusers.rfqs (rfq_id) ON DELETE SET NULL,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','acknowledged','partially_received',
                                          'received','invoiced','paid','cancelled')),
  order_date            DATE        NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery     DATE,
  delivery_address      TEXT,
  subtotal              NUMERIC(14,2) NOT NULL DEFAULT 0,
  shipping_cost         NUMERIC(12,2) NOT NULL DEFAULT 0,
  import_duty           NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_charges         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency              TEXT        NOT NULL DEFAULT 'USD',
  exchange_rate         NUMERIC(10,4),
  ngn_equivalent        NUMERIC(14,2),
  notes                 TEXT,
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  created_by            UUID        NOT NULL REFERENCES shared.users (user_id),
  is_deleted            BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_po_updated_at BEFORE UPDATE ON diffusers.purchase_orders FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_diffusers_purchase_orders_supplier ON diffusers.purchase_orders (supplier_id, status);

CREATE TABLE diffusers.po_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id                 UUID        NOT NULL REFERENCES diffusers.purchase_orders (po_id) ON DELETE CASCADE,
  product_id            UUID        NOT NULL REFERENCES diffusers.products (product_id),
  quantity_ordered      INTEGER     NOT NULL CHECK (quantity_ordered > 0),
  quantity_received     INTEGER     NOT NULL DEFAULT 0,
  unit_price            NUMERIC(14,2) NOT NULL,
  line_total            NUMERIC(14,2) NOT NULL,
  tracking_number       TEXT
);

CREATE TABLE diffusers.goods_received (
  receipt_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id                 UUID        NOT NULL REFERENCES diffusers.purchase_orders (po_id),
  received_date         DATE        NOT NULL DEFAULT CURRENT_DATE,
  received_by           UUID        NOT NULL REFERENCES shared.users (user_id),
  warehouse_location_id UUID        REFERENCES diffusers.stock_locations (location_id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diffusers.goods_received_lines (
  gr_line_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id            UUID        NOT NULL REFERENCES diffusers.goods_received (receipt_id) ON DELETE CASCADE,
  po_line_id            UUID        NOT NULL REFERENCES diffusers.po_lines (line_id),
  quantity_received     INTEGER     NOT NULL CHECK (quantity_received >= 0),
  quantity_accepted     INTEGER     NOT NULL CHECK (quantity_accepted >= 0),
  quantity_rejected     INTEGER     NOT NULL DEFAULT 0,
  rejection_reason      TEXT,
  quality_status        TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (quality_status IN ('pending','accepted','partially_rejected','rejected'))
);

CREATE TABLE diffusers.supplier_invoices (
  sup_invoice_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id           UUID        NOT NULL REFERENCES diffusers.suppliers (supplier_id),
  po_id                 UUID        REFERENCES diffusers.purchase_orders (po_id) ON DELETE SET NULL,
  supplier_invoice_number TEXT      NOT NULL,
  invoice_date          DATE        NOT NULL,
  due_date              DATE        NOT NULL,
  amount                NUMERIC(14,2) NOT NULL,
  currency              TEXT        NOT NULL,
  amount_ngn            NUMERIC(14,2),
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','matched','approved','paid','disputed')),
  amount_paid           NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_at               TIMESTAMPTZ,
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_sup_invoices_updated_at BEFORE UPDATE ON diffusers.supplier_invoices FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
