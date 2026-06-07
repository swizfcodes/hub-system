-- ============================================================
-- MIGRATION 000010 — Per-business: Sales
-- quotations, quotation_lines, sales_orders, order_lines,
-- discounts, discount_approvals
-- ============================================================

-- ┌── JEWELRY ──────────────────────────────────────────────┐

CREATE TABLE jewelry.quotations (
  quotation_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number      TEXT        NOT NULL UNIQUE,
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  deal_id               UUID        REFERENCES jewelry.crm_deals (deal_id) ON DELETE SET NULL,
  assigned_to           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','viewed','confirmed','expired','cancelled')),
  valid_until           DATE        NOT NULL,
  subtotal              NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency              TEXT        NOT NULL DEFAULT 'NGN',
  payment_terms         TEXT,
  notes                 TEXT,
  terms_conditions      TEXT,
  sent_at               TIMESTAMPTZ,
  confirmed_at          TIMESTAMPTZ,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  is_deleted            BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_quotations_updated_at BEFORE UPDATE ON jewelry.quotations FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_quotations_contact ON jewelry.quotations (contact_id);
CREATE INDEX idx_jewelry_quotations_status  ON jewelry.quotations (status)     WHERE is_deleted = false;
CREATE INDEX idx_jewelry_quotations_number  ON jewelry.quotations (quotation_number);

CREATE TABLE jewelry.quotation_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id          UUID        NOT NULL REFERENCES jewelry.quotations (quotation_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES jewelry.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price            NUMERIC(14,2) NOT NULL,
  discount_pct          NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total            NUMERIC(14,2) NOT NULL,
  display_order         SMALLINT    NOT NULL DEFAULT 0
);
CREATE INDEX idx_jewelry_quotation_lines ON jewelry.quotation_lines (quotation_id);

CREATE TABLE jewelry.sales_orders (
  order_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          TEXT        NOT NULL UNIQUE,
  quotation_id          UUID        UNIQUE REFERENCES jewelry.quotations (quotation_id),
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  status                TEXT        NOT NULL DEFAULT 'confirmed'
                        CHECK (status IN ('confirmed','partially_fulfilled','fulfilled','cancelled')),
  fulfilment_type       TEXT        NOT NULL CHECK (fulfilment_type IN ('walk_in','delivery')),
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid           NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_outstanding    NUMERIC(14,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  notes                 TEXT,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_sales_orders_updated_at BEFORE UPDATE ON jewelry.sales_orders FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_sales_orders_contact ON jewelry.sales_orders (contact_id);
CREATE INDEX idx_jewelry_sales_orders_status  ON jewelry.sales_orders (status);

CREATE TABLE jewelry.order_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID        NOT NULL REFERENCES jewelry.sales_orders (order_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES jewelry.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price            NUMERIC(14,2) NOT NULL,
  line_total            NUMERIC(14,2) NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','fulfilled','cancelled'))
);
CREATE INDEX idx_jewelry_order_lines ON jewelry.order_lines (order_id);

CREATE TABLE jewelry.discounts (
  discount_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_name         TEXT        NOT NULL,
  discount_type         TEXT        NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  value                 NUMERIC(10,4) NOT NULL,
  applies_to            TEXT        NOT NULL DEFAULT 'all',
  valid_from            DATE,
  valid_to              DATE,
  min_order_value       NUMERIC(14,2),
  usage_limit           INTEGER,
  usage_count           INTEGER     NOT NULL DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_by            UUID        REFERENCES shared.users (user_id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jewelry.discount_approvals (
  approval_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_type        TEXT        NOT NULL CHECK (reference_type IN ('pos_transaction','quotation')),
  reference_id          UUID        NOT NULL,
  product_id            UUID        NOT NULL REFERENCES jewelry.products (product_id),
  requested_price       NUMERIC(14,2) NOT NULL,
  min_price             NUMERIC(14,2) NOT NULL,
  requested_by          UUID        NOT NULL REFERENCES shared.users (user_id),
  reviewed_by           UUID        REFERENCES shared.users (user_id),
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected')),
  review_notes          TEXT,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_discount_approvals_status ON jewelry.discount_approvals (status) WHERE status = 'pending';

-- ┌── DIFFUSERS ────────────────────────────────────────────┐

CREATE TABLE diffusers.quotations (
  quotation_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number      TEXT        NOT NULL UNIQUE,
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  deal_id               UUID        REFERENCES diffusers.crm_deals (deal_id) ON DELETE SET NULL,
  assigned_to           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  status                TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed','confirmed','expired','cancelled')),
  valid_until           DATE        NOT NULL,
  subtotal              NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency              TEXT        NOT NULL DEFAULT 'NGN',
  payment_terms         TEXT,
  notes                 TEXT,
  terms_conditions      TEXT,
  sent_at               TIMESTAMPTZ,
  confirmed_at          TIMESTAMPTZ,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  is_deleted            BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_quotations_updated_at BEFORE UPDATE ON diffusers.quotations FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_diffusers_quotations_contact ON diffusers.quotations (contact_id);
CREATE INDEX idx_diffusers_quotations_status  ON diffusers.quotations (status) WHERE is_deleted = false;

CREATE TABLE diffusers.quotation_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id          UUID        NOT NULL REFERENCES diffusers.quotations (quotation_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES diffusers.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price            NUMERIC(14,2) NOT NULL,
  discount_pct          NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total            NUMERIC(14,2) NOT NULL,
  display_order         SMALLINT    NOT NULL DEFAULT 0
);

CREATE TABLE diffusers.sales_orders (
  order_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          TEXT        NOT NULL UNIQUE,
  quotation_id          UUID        UNIQUE REFERENCES diffusers.quotations (quotation_id),
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  status                TEXT        NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','partially_fulfilled','fulfilled','cancelled')),
  fulfilment_type       TEXT        NOT NULL CHECK (fulfilment_type IN ('walk_in','delivery')),
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid           NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_outstanding    NUMERIC(14,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  notes                 TEXT,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_sales_orders_updated_at BEFORE UPDATE ON diffusers.sales_orders FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE TABLE diffusers.order_lines (
  line_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID        NOT NULL REFERENCES diffusers.sales_orders (order_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES diffusers.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price            NUMERIC(14,2) NOT NULL,
  line_total            NUMERIC(14,2) NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','cancelled'))
);

CREATE TABLE diffusers.discounts (
  discount_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_name         TEXT        NOT NULL,
  discount_type         TEXT        NOT NULL CHECK (discount_type IN ('percentage','fixed')),
  value                 NUMERIC(10,4) NOT NULL,
  applies_to            TEXT        NOT NULL DEFAULT 'all',
  valid_from            DATE,
  valid_to              DATE,
  min_order_value       NUMERIC(14,2),
  usage_limit           INTEGER,
  usage_count           INTEGER     NOT NULL DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_by            UUID        REFERENCES shared.users (user_id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diffusers.discount_approvals (
  approval_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_type        TEXT        NOT NULL CHECK (reference_type IN ('pos_transaction','quotation')),
  reference_id          UUID        NOT NULL,
  product_id            UUID        NOT NULL REFERENCES diffusers.products (product_id),
  requested_price       NUMERIC(14,2) NOT NULL,
  min_price             NUMERIC(14,2) NOT NULL,
  requested_by          UUID        NOT NULL REFERENCES shared.users (user_id),
  reviewed_by           UUID        REFERENCES shared.users (user_id),
  status                TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_notes          TEXT,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diffusers_discount_approvals_status ON diffusers.discount_approvals (status) WHERE status = 'pending';
