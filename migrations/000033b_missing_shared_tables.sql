-- ============================================================
-- MIGRATION 000003b — Missing tables from HTML schema spec
-- contact_addresses  (Auth & People — shared schema)
-- document_tags      (Docs & Comms — shared schema)
--
-- Run this AFTER 000003 and 000004 have been applied.
-- These were present in the HTML visualisation but were
-- accidentally omitted from the original migration files.
-- ============================================================

-- ── contact_addresses ─────────────────────────────────────
-- Normalised address table alongside the JSONB addresses
-- column on contacts. This version is used for structured
-- querying (e.g. find all customers in Lagos Island).
-- The JSONB column on contacts remains for free-form / legacy
-- entries. New addresses should be written to both.
CREATE TABLE shared.contact_addresses (
  address_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID        NOT NULL
                          REFERENCES shared.contacts (contact_id)
                          ON DELETE CASCADE,
  address_type          TEXT        NOT NULL DEFAULT 'delivery'
                        CHECK (address_type IN ('delivery','billing','office','home','other')),
  line1                 TEXT        NOT NULL,
  line2                 TEXT,
  area                  TEXT,                    -- e.g. Victoria Island, Lekki Phase 1
  city                  TEXT        NOT NULL DEFAULT 'Lagos',
  state                 TEXT        NOT NULL DEFAULT 'Lagos',
  country               TEXT        NOT NULL DEFAULT 'Nigeria',
  landmark              TEXT,                    -- e.g. "Opposite Zenith Bank"
  recipient_name        TEXT,                    -- if different from contact display_name
  recipient_phone       TEXT,
  google_maps_url       TEXT,
  is_default            BOOLEAN     NOT NULL DEFAULT false,
  is_verified           BOOLEAN     NOT NULL DEFAULT false,  -- confirmed by a delivery
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_contact_addresses_updated_at
  BEFORE UPDATE ON shared.contact_addresses
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- Only one default address per type per contact
CREATE UNIQUE INDEX idx_contact_addresses_default
  ON shared.contact_addresses (contact_id, address_type)
  WHERE is_default = true;

CREATE INDEX idx_contact_addresses_contact
  ON shared.contact_addresses (contact_id);

CREATE INDEX idx_contact_addresses_city
  ON shared.contact_addresses (city, state)
  WHERE is_default = true;


-- ── document_tags ─────────────────────────────────────────
-- Flexible tagging for documents in the archive.
-- Allows grouping: "Supplier Certificates", "Signed Contracts",
-- "Insurance", etc. across all document types.
CREATE TABLE shared.document_tags (
  tag_id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           UUID        NOT NULL
                          REFERENCES shared.documents (document_id)
                          ON DELETE CASCADE,
  tag_name              TEXT        NOT NULL,
  business              TEXT        NOT NULL,   -- which business applied the tag
  colour                TEXT        DEFAULT '#64748B',
  tagged_by             UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, tag_name, business)
);

CREATE INDEX idx_document_tags_document
  ON shared.document_tags (document_id);

CREATE INDEX idx_document_tags_name_business
  ON shared.document_tags (tag_name, business);

-- ============================================================
-- Verify
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'shared'
-- AND table_name IN ('contact_addresses', 'document_tags');
-- Expected: 2 rows
-- ============================================================
