-- ============================================================
-- MIGRATION 000030 — Store schema (Orika Living storefront)
-- Hub Platform · JBS Praxis
--
-- Option A (final): the storefront is a SALES CHANNEL of the ERP,
-- not a parallel system. Every web sale balances with the ERP —
-- it posts revenue + COGS journals and a stock_movements row
-- against a real diffusers.products SKU, exactly like a POS sale.
--
-- Design:
--   store.products    — web PRESENTATION layer. Web-only fields
--                        (slug, scent_family, format, notes, images)
--                        plus an FK to diffusers.products. Price and
--                        stock are NOT stored here — read live from
--                        the ERP so they can never disagree with it.
--   store.scents      — pure storefront content, no ERP equivalent.
--   store.signatures  — pure storefront content, no ERP equivalent.
--   store.orders      — web orders. On payment they post journals
--                        + stock movements into the diffusers ERP.
--   store.customers   — web buyers, linked to shared.contacts so
--                        they appear in the ERP CRM.
--   store.enquiries / newsletter_* — storefront-owned, no ERP twin.
--
-- Idempotent throughout. Safe to re-run.
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS store;

-- ── Enums ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE store.scent_family AS ENUM (
    'Fresh & Marine', 'Citrus & Green', 'Oud & Floral',
    'Spice & Amber', 'Woody & Deep', 'Floral & Musk'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE store.product_format AS ENUM (
    'Grand Edition', 'Signature Edition', 'Curated Gift Set', 'Car Diffuser'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE store.order_status AS ENUM (
    'pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE store.enquiry_type AS ENUM (
    'Retail / Stockist Partnership', 'Bulk / Wholesale Order',
    'Corporate Gifting', 'Hotel / Hospitality Placement',
    'Event Setup', 'General Enquiry'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE store.enquiry_status AS ENUM (
    'new', 'read', 'replied', 'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Products — web presentation layer over diffusers SKUs ────
-- product_id FK → diffusers.products is the spine: price, cost,
-- stock and accounting all resolve through it. NO price column and
-- NO stock column here — selling price comes from
-- diffusers.products.selling_price, stock from SUM(stock_movements),
-- so the storefront can never display a figure the ERP disagrees
-- with.
CREATE TABLE IF NOT EXISTS store.products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL
                    REFERENCES diffusers.products(product_id)
                    ON DELETE RESTRICT,
  slug            text NOT NULL UNIQUE,
  scent_family    store.scent_family NOT NULL,
  format          store.product_format NOT NULL,
  size_ml         integer NOT NULL CHECK (size_ml > 0),
  images          text[] NOT NULL DEFAULT '{}',
  web_description text,
  top_notes       text[] NOT NULL DEFAULT '{}',
  heart_notes     text[] NOT NULL DEFAULT '{}',
  base_notes      text[] NOT NULL DEFAULT '{}',
  is_published    boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- one storefront listing per ERP SKU
  UNIQUE (product_id)
);
CREATE INDEX IF NOT EXISTS store_products_slug_idx
  ON store.products (slug);
CREATE INDEX IF NOT EXISTS store_products_family_idx
  ON store.products (scent_family);
CREATE INDEX IF NOT EXISTS store_products_published_idx
  ON store.products (created_at DESC) WHERE is_published = true;

-- ── Scents — pure storefront content ─────────────────────────
CREATE TABLE IF NOT EXISTS store.scents (
  family         store.scent_family PRIMARY KEY,
  name           text NOT NULL,
  slug           text NOT NULL UNIQUE,
  tagline        text NOT NULL,
  description    text NOT NULL,
  top_notes      text[] NOT NULL DEFAULT '{}',
  heart_notes    text[] NOT NULL DEFAULT '{}',
  base_notes     text[] NOT NULL DEFAULT '{}',
  swatch         text NOT NULL,
  ink            text NOT NULL,
  image          text,
  display_order  integer NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_scents_slug_idx ON store.scents (slug);

-- ── Signatures — pure storefront content ─────────────────────
CREATE TABLE IF NOT EXISTS store.signatures (
  slug           text PRIMARY KEY,
  name           text NOT NULL,
  size_label     text NOT NULL,
  price_label    text NOT NULL,
  blurb          text NOT NULL,
  image          text,
  display_order  integer NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Customers — web buyers, linked into ERP CRM ──────────────
CREATE TABLE IF NOT EXISTS store.customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid REFERENCES shared.contacts(contact_id)
                  ON DELETE SET NULL,
  email         text NOT NULL UNIQUE,
  full_name     text NOT NULL,
  phone         text NOT NULL,
  total_orders  integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Orders ───────────────────────────────────────────────────
-- journal_entry_id / cogs_entry_id record the ERP journals posted
-- on fulfilment. A non-null journal_entry_id is also the
-- double-post guard — fulfilment refuses to post twice.
CREATE TABLE IF NOT EXISTS store.orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       uuid REFERENCES store.customers(id) ON DELETE SET NULL,
  status            store.order_status NOT NULL DEFAULT 'pending',
  total_kobo        bigint NOT NULL CHECK (total_kobo >= 0),
  paystack_ref      text UNIQUE,
  delivery_address  jsonb NOT NULL,
  items             jsonb NOT NULL,
  journal_entry_id  uuid,
  cogs_entry_id     uuid,
  paid_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_orders_ref_idx
  ON store.orders (paystack_ref);
CREATE INDEX IF NOT EXISTS store_orders_status_idx
  ON store.orders (status, created_at DESC);

-- ── Enquiries ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store.enquiries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text NOT NULL,
  phone       text NOT NULL,
  type        store.enquiry_type NOT NULL,
  message     text NOT NULL,
  status      store.enquiry_status NOT NULL DEFAULT 'new',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_enquiries_status_idx
  ON store.enquiries (status, created_at DESC);

-- ── Newsletter ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store.newsletter_subscribers (
  email             text PRIMARY KEY,
  subscribed_at     timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at   timestamptz,
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  source            text NOT NULL DEFAULT 'footer'
);
CREATE INDEX IF NOT EXISTS store_newsletter_active_idx
  ON store.newsletter_subscribers (subscribed_at DESC)
  WHERE unsubscribed_at IS NULL;

CREATE TABLE IF NOT EXISTS store.newsletter_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject     text NOT NULL,
  eyebrow     text,
  title       text NOT NULL,
  body_html   text NOT NULL,
  body_text   text NOT NULL,
  cta_href    text,
  cta_label   text,
  sent_at     timestamptz,
  sent_by     uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── updated_at triggers ──────────────────────────────────────
CREATE OR REPLACE FUNCTION store.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_store_products_updated_at ON store.products;
CREATE TRIGGER trg_store_products_updated_at
  BEFORE UPDATE ON store.products
  FOR EACH ROW EXECUTE FUNCTION store.set_updated_at();

DROP TRIGGER IF EXISTS trg_store_orders_updated_at ON store.orders;
CREATE TRIGGER trg_store_orders_updated_at
  BEFORE UPDATE ON store.orders
  FOR EACH ROW EXECUTE FUNCTION store.set_updated_at();

COMMIT;