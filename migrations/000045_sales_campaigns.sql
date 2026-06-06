-- ============================================================
-- MIGRATION 000030 — Sales Campaigns & Landing Page
--
-- Tables live in per-business schemas (jewelry / diffusers)
-- because campaigns are business-scoped and products FK to
-- the business schema. The shared.campaign_analytics and
-- shared.campaign_leads tables live in shared because public
-- routes don't carry a business-context JWT.
--
-- Run for each business schema by replacing {business}:
--   \i 000030_sales_campaigns.sql  (with search_path set)
-- ============================================================


-- ── Per-business tables ───────────────────────────────────────

-- Main campaign entity ----------------------------------------
CREATE TABLE IF NOT EXISTS jewelry.sales_campaigns (
  campaign_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name   TEXT        NOT NULL,
  slug            TEXT        NOT NULL UNIQUE,  -- /c/jewelry/easter-2026
  template        TEXT        NOT NULL DEFAULT 'editorial'
                              CHECK (template IN ('minimal','editorial','bold')),
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','scheduled','live','expired','archived')),

  -- Hero content
  headline        TEXT,
  subheadline     TEXT,
  body_copy       TEXT,
  hero_image_url  TEXT,

  -- Offer terms
  discount_type   TEXT        CHECK (discount_type IN ('percentage','fixed_amount','none')),
  discount_value  NUMERIC(12,2),

  -- Which sections appear on the public page
  sections        JSONB       NOT NULL DEFAULT '{
    "hero":true,
    "countdown":true,
    "products":true,
    "inquiry_form":true,
    "whatsapp_button":true,
    "stock_indicator":true
  }'::jsonb,

  -- Scheduling
  start_date      TIMESTAMPTZ,
  end_date        TIMESTAMPTZ,
  is_evergreen    BOOLEAN     NOT NULL DEFAULT false,

  -- Contact / CTA config
  whatsapp_number TEXT,       -- pre-filled wa.me number for this campaign
  inquiry_email   TEXT,
  store_location  TEXT,       -- shown on pickup confirmation + expired-page CTA

  -- Post-expiry redirect
  redirect_url    TEXT,       -- where expired-page CTA sends them

  -- Sharing
  qr_code_url     TEXT,       -- generated and stored on publish

  -- Metadata
  created_by      UUID        REFERENCES shared.users(user_id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diffusers.sales_campaigns (
  LIKE jewelry.sales_campaigns INCLUDING ALL
);

-- Products featured on a campaign ----------------------------
CREATE TABLE IF NOT EXISTS jewelry.campaign_products (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID        NOT NULL REFERENCES jewelry.sales_campaigns(campaign_id)
                                  ON DELETE CASCADE,
  product_id          UUID        NOT NULL REFERENCES jewelry.products(product_id),
  display_order       INT         NOT NULL DEFAULT 0,

  -- Campaign-specific overrides
  campaign_price      NUMERIC(12,2),  -- NULL = use products.selling_price
  campaign_label      TEXT,           -- 'Limited Edition', 'Best Seller', etc.
  campaign_image_url  TEXT,           -- NULL = use products.primary_image_url

  -- Stock allocation for this campaign
  quantity_allocated  INT         NOT NULL DEFAULT 0,  -- 0 = unlimited from live stock
  quantity_sold       INT         NOT NULL DEFAULT 0,
  quantity_reserved   INT         NOT NULL DEFAULT 0,  -- pending proof uploads

  -- Psychological pressure settings
  show_stock_count    BOOLEAN     NOT NULL DEFAULT true,
  low_stock_threshold INT         NOT NULL DEFAULT 5,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT campaign_products_campaign_product_unique
    UNIQUE (campaign_id, product_id)
);

CREATE TABLE IF NOT EXISTS diffusers.campaign_products (
  LIKE jewelry.campaign_products INCLUDING ALL
);
-- Fix FK references for diffusers
ALTER TABLE diffusers.campaign_products
  DROP CONSTRAINT IF EXISTS campaign_products_campaign_id_fkey;
ALTER TABLE diffusers.campaign_products
  ADD CONSTRAINT campaign_products_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES diffusers.sales_campaigns(campaign_id) ON DELETE CASCADE;
ALTER TABLE diffusers.campaign_products
  DROP CONSTRAINT IF EXISTS campaign_products_product_id_fkey;
ALTER TABLE diffusers.campaign_products
  ADD CONSTRAINT campaign_products_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES diffusers.products(product_id);

-- Bank accounts accepted for direct transfers -----------------
CREATE TABLE IF NOT EXISTS jewelry.campaign_bank_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID        NOT NULL REFERENCES jewelry.sales_campaigns(campaign_id)
                              ON DELETE CASCADE,
  bank_name       TEXT        NOT NULL,
  account_number  TEXT        NOT NULL,
  account_name    TEXT        NOT NULL,
  sort_code       TEXT,
  is_primary      BOOLEAN     NOT NULL DEFAULT false,
  display_order   INT         NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS diffusers.campaign_bank_accounts (
  LIKE jewelry.campaign_bank_accounts INCLUDING ALL
);
ALTER TABLE diffusers.campaign_bank_accounts
  DROP CONSTRAINT IF EXISTS campaign_bank_accounts_campaign_id_fkey;
ALTER TABLE diffusers.campaign_bank_accounts
  ADD CONSTRAINT campaign_bank_accounts_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES diffusers.sales_campaigns(campaign_id) ON DELETE CASCADE;

-- Campaign orders --------------------------------------------
-- Status flow: pending → proof_submitted → confirmed
--                              ↓                ↓
--                           cancelled      dispatched | ready_for_pickup
--                                                    ↓
--                                               completed
CREATE TABLE IF NOT EXISTS jewelry.campaign_orders (
  order_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID        NOT NULL REFERENCES jewelry.sales_campaigns(campaign_id),
  order_number        TEXT        NOT NULL,

  -- Customer (captured at checkout)
  customer_name       TEXT        NOT NULL,
  customer_phone      TEXT        NOT NULL,
  customer_email      TEXT,

  -- Fulfilment
  fulfilment_type     TEXT        NOT NULL CHECK (fulfilment_type IN ('delivery','pickup')),
  delivery_address    JSONB,      -- {line1, area, city, state, landmark}
  pickup_location     TEXT,       -- store address/instructions shown to customer

  -- Payment
  payment_method      TEXT        NOT NULL CHECK (payment_method IN ('paystack','bank_transfer')),
  paystack_reference  TEXT,
  bank_account_id     UUID,       -- which bank account they transferred to

  -- Amounts
  subtotal            NUMERIC(12,2) NOT NULL,
  discount_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(12,2) NOT NULL,

  -- Status
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN (
                                    'pending','proof_submitted','confirmed',
                                    'dispatched','ready_for_pickup','completed','cancelled'
                                  )),
  cancellation_reason TEXT,

  -- Proof of payment (bank transfer)
  proof_image_url     TEXT,
  proof_uploaded_at   TIMESTAMPTZ,

  -- Hub integration (populated on order confirmation)
  hub_contact_id      UUID,       -- shared.contacts.contact_id
  hub_order_id        UUID,       -- jewelry.sales_orders.order_id
  hub_invoice_id      UUID,       -- jewelry.invoices.invoice_id

  -- Loyalty
  loyalty_points_awarded INT,

  -- Public tracking (no-auth order status page)
  tracking_token      TEXT        NOT NULL UNIQUE
                                  DEFAULT encode(gen_random_bytes(16), 'hex'),

  -- Analytics
  source              TEXT,       -- ?ref= query param value

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS diffusers.campaign_orders (
  LIKE jewelry.campaign_orders INCLUDING ALL
);
ALTER TABLE diffusers.campaign_orders
  DROP CONSTRAINT IF EXISTS campaign_orders_campaign_id_fkey;
ALTER TABLE diffusers.campaign_orders
  ADD CONSTRAINT campaign_orders_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES diffusers.sales_campaigns(campaign_id);

-- Campaign order line items
CREATE TABLE IF NOT EXISTS jewelry.campaign_order_items (
  item_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID        NOT NULL REFERENCES jewelry.campaign_orders(order_id)
                                   ON DELETE CASCADE,
  campaign_product_id  UUID        NOT NULL REFERENCES jewelry.campaign_products(id),
  product_id           UUID        NOT NULL,
  product_name         TEXT        NOT NULL,
  quantity             INT         NOT NULL CHECK (quantity > 0),
  unit_price           NUMERIC(12,2) NOT NULL,
  discount_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total           NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS diffusers.campaign_order_items (
  LIKE jewelry.campaign_order_items INCLUDING ALL
);
ALTER TABLE diffusers.campaign_order_items
  DROP CONSTRAINT IF EXISTS campaign_order_items_order_id_fkey;
ALTER TABLE diffusers.campaign_order_items
  ADD CONSTRAINT campaign_order_items_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES diffusers.campaign_orders(order_id) ON DELETE CASCADE;
ALTER TABLE diffusers.campaign_order_items
  DROP CONSTRAINT IF EXISTS campaign_order_items_campaign_product_id_fkey;
ALTER TABLE diffusers.campaign_order_items
  ADD CONSTRAINT campaign_order_items_campaign_product_id_fkey
    FOREIGN KEY (campaign_product_id) REFERENCES diffusers.campaign_products(id);

-- ── Shared tables (no business context on public routes) ──────

-- Inquiry form leads (non-purchase interest)
CREATE TABLE IF NOT EXISTS shared.campaign_leads (
  lead_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID        NOT NULL,  -- cross-schema, no FK
  business        TEXT        NOT NULL,
  slug            TEXT        NOT NULL,

  name            TEXT,
  phone           TEXT,
  email           TEXT,
  message         TEXT,

  lead_type       TEXT        NOT NULL DEFAULT 'form'
                              CHECK (lead_type IN ('form','whatsapp_tap')),
  source          TEXT,       -- ?ref= value

  hub_contact_id  UUID,       -- linked or auto-created contact

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Page-level analytics events
CREATE TABLE IF NOT EXISTS shared.campaign_analytics (
  event_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID        NOT NULL,
  business        TEXT        NOT NULL,
  slug            TEXT        NOT NULL,

  event_type      TEXT        NOT NULL
                              CHECK (event_type IN (
                                'page_view','whatsapp_tap','form_submit',
                                'add_to_cart','checkout_start','order_placed',
                                'proof_uploaded'
                              )),

  source          TEXT,       -- ?ref= value (wa, ig, direct, etc.)
  ip_hash         TEXT,       -- SHA-256 of IP for unique-visitor counting (not stored raw)
  session_id      TEXT,       -- random UUID set in localStorage

  product_id      UUID,       -- for product-level events
  metadata        JSONB,

  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_j_campaigns_status_dates
  ON jewelry.sales_campaigns (status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_j_campaigns_slug
  ON jewelry.sales_campaigns (slug);

CREATE INDEX IF NOT EXISTS idx_d_campaigns_status_dates
  ON diffusers.sales_campaigns (status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_d_campaigns_slug
  ON diffusers.sales_campaigns (slug);

CREATE INDEX IF NOT EXISTS idx_j_campaign_orders_campaign
  ON jewelry.campaign_orders (campaign_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_j_campaign_orders_token
  ON jewelry.campaign_orders (tracking_token);
CREATE INDEX IF NOT EXISTS idx_j_campaign_orders_phone
  ON jewelry.campaign_orders (customer_phone);

CREATE INDEX IF NOT EXISTS idx_d_campaign_orders_campaign
  ON diffusers.campaign_orders (campaign_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_d_campaign_orders_token
  ON diffusers.campaign_orders (tracking_token);

CREATE INDEX IF NOT EXISTS idx_campaign_analytics_campaign_type
  ON shared.campaign_analytics (campaign_id, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign
  ON shared.campaign_leads (campaign_id, created_at DESC);

-- ── Auto-update updated_at ────────────────────────────────────

CREATE OR REPLACE FUNCTION shared.fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_j_sales_campaigns_updated_at ON jewelry.sales_campaigns;
CREATE TRIGGER trg_j_sales_campaigns_updated_at
  BEFORE UPDATE ON jewelry.sales_campaigns
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_d_sales_campaigns_updated_at ON diffusers.sales_campaigns;
CREATE TRIGGER trg_d_sales_campaigns_updated_at
  BEFORE UPDATE ON diffusers.sales_campaigns
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_j_campaign_orders_updated_at ON jewelry.campaign_orders;
CREATE TRIGGER trg_j_campaign_orders_updated_at
  BEFORE UPDATE ON jewelry.campaign_orders
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_d_campaign_orders_updated_at ON diffusers.campaign_orders;
CREATE TRIGGER trg_d_campaign_orders_updated_at
  BEFORE UPDATE ON diffusers.campaign_orders
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- ── Permissions (000027 pattern) ─────────────────────────────
INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
SELECT r.role_id, 'sales_campaigns', a, 'all', '{}'
FROM shared.roles r,
unnest(ARRAY['view','create','edit','delete','approve','export']) a
WHERE r.role_name IN ('owner', 'manager')
ON CONFLICT (role_id, module, action) DO NOTHING;

INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
SELECT r.role_id, 'sales_campaigns', a, 'all', '{}'
FROM shared.roles r,
unnest(ARRAY['view','create']) a
WHERE r.role_name = 'sales'   -- replace with your actual role name
ON CONFLICT (role_id, module, action) DO NOTHING;