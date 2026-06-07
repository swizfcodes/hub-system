-- ============================================================
-- MIGRATION 000008 — Per-business: Stock
-- stock_locations, stock_movements (ledger), stock_reservations,
-- stock_adjustments, stock_transfers, quality_checks
-- ============================================================

-- Helper macro: applied to both schemas
-- jewelry first, then diffusers (identical structure)

-- ┌── JEWELRY ──────────────────────────────────────────────┐

CREATE TABLE jewelry.stock_locations (
  location_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  location_type         TEXT        NOT NULL
                        CHECK (location_type IN ('warehouse','showroom','pos_terminal','retail_partner','transit')),
  partner_id            UUID,                           -- FK added in migration 000017 (retail)
  address               TEXT,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_stock_locations_updated_at BEFORE UPDATE ON jewelry.stock_locations FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- APPEND-ONLY ledger — no updates or deletes after insert
CREATE TABLE jewelry.stock_movements (
  movement_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID        NOT NULL REFERENCES jewelry.products (product_id),
  movement_type         TEXT        NOT NULL,
  -- Types: received | sold | returned_from_customer | returned_to_supplier
  --        transferred_out | transferred_in | consigned_out | consigned_returned
  --        reserved | reservation_released | written_off | pos_sale | adjustment
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  direction             SMALLINT    NOT NULL CHECK (direction IN (1, -1)),   -- 1=in, -1=out
  from_location_id      UUID        REFERENCES jewelry.stock_locations (location_id),
  to_location_id        UUID        REFERENCES jewelry.stock_locations (location_id),
  reference_type        TEXT,        -- 'purchase_order','sale_order','pos_transaction','transfer','adjustment'
  reference_id          UUID,
  unit_cost             NUMERIC(14,2),
  batch_number          TEXT,
  notes                 TEXT,
  performed_by          UUID        NOT NULL REFERENCES shared.users (user_id),
  performed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_stock_product_time ON jewelry.stock_movements (product_id, performed_at DESC);
CREATE INDEX idx_jewelry_stock_location_out ON jewelry.stock_movements (to_location_id, movement_type);
CREATE INDEX idx_jewelry_stock_reference    ON jewelry.stock_movements (reference_type, reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX idx_jewelry_stock_performed_at ON jewelry.stock_movements (performed_at DESC);

CREATE TABLE jewelry.stock_reservations (
  reservation_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID        NOT NULL REFERENCES jewelry.products (product_id),
  quantity              INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  reserved_for          UUID        REFERENCES shared.contacts (contact_id) ON DELETE SET NULL,
  crm_deal_id           UUID,                           -- FK added in migration 000009
  expires_at            TIMESTAMPTZ NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','released','converted_to_sale')),
  notes                 TEXT,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_stock_reservations_updated_at BEFORE UPDATE ON jewelry.stock_reservations FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_reservations_product ON jewelry.stock_reservations (product_id, status);
CREATE INDEX idx_jewelry_reservations_expires ON jewelry.stock_reservations (expires_at) WHERE status = 'active';

CREATE TABLE jewelry.stock_adjustments (
  adjustment_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID        NOT NULL REFERENCES jewelry.products (product_id),
  location_id           UUID        NOT NULL REFERENCES jewelry.stock_locations (location_id),
  adjustment_type       TEXT        NOT NULL CHECK (adjustment_type IN ('count','write_off','damage','found','correction')),
  quantity_before       INTEGER     NOT NULL,
  quantity_after        INTEGER     NOT NULL,
  reason                TEXT        NOT NULL,
  approved_by           UUID        REFERENCES shared.users (user_id),
  created_by            UUID        NOT NULL REFERENCES shared.users (user_id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jewelry.stock_transfers (
  transfer_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number       TEXT        NOT NULL UNIQUE,
  from_location_id      UUID        NOT NULL REFERENCES jewelry.stock_locations (location_id),
  to_location_id        UUID        NOT NULL REFERENCES jewelry.stock_locations (location_id),
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','in_transit','received','cancelled')),
  notes                 TEXT,
  initiated_by          UUID        NOT NULL REFERENCES shared.users (user_id),
  received_by           UUID        REFERENCES shared.users (user_id),
  initiated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at           TIMESTAMPTZ
);
CREATE INDEX idx_jewelry_transfers_status ON jewelry.stock_transfers (status);

CREATE TABLE jewelry.quality_checks (
  check_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID        NOT NULL REFERENCES jewelry.products (product_id),
  check_type            TEXT        NOT NULL CHECK (check_type IN ('incoming','periodic','return','pre_consignment')),
  result                TEXT        NOT NULL CHECK (result IN ('pass','fail','conditional')),
  notes                 TEXT,
  checked_by            UUID        NOT NULL REFERENCES shared.users (user_id),
  checked_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ┌── DIFFUSERS ────────────────────────────────────────────┐

CREATE TABLE diffusers.stock_locations (
  location_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  location_type         TEXT        NOT NULL CHECK (location_type IN ('warehouse','showroom','pos_terminal','retail_partner','transit')),
  partner_id            UUID,
  address               TEXT,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_stock_locations_updated_at BEFORE UPDATE ON diffusers.stock_locations FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE TABLE diffusers.stock_movements (
  movement_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID        NOT NULL REFERENCES diffusers.products (product_id),
  movement_type         TEXT        NOT NULL,
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  direction             SMALLINT    NOT NULL CHECK (direction IN (1, -1)),
  from_location_id      UUID        REFERENCES diffusers.stock_locations (location_id),
  to_location_id        UUID        REFERENCES diffusers.stock_locations (location_id),
  reference_type        TEXT,
  reference_id          UUID,
  unit_cost             NUMERIC(14,2),
  batch_number          TEXT,
  notes                 TEXT,
  performed_by          UUID        NOT NULL REFERENCES shared.users (user_id),
  performed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diffusers_stock_product_time ON diffusers.stock_movements (product_id, performed_at DESC);
CREATE INDEX idx_diffusers_stock_location_out ON diffusers.stock_movements (to_location_id, movement_type);
CREATE INDEX idx_diffusers_stock_reference    ON diffusers.stock_movements (reference_type, reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX idx_diffusers_stock_performed_at ON diffusers.stock_movements (performed_at DESC);

CREATE TABLE diffusers.stock_reservations (
  reservation_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID        NOT NULL REFERENCES diffusers.products (product_id),
  quantity              INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  reserved_for          UUID        REFERENCES shared.contacts (contact_id) ON DELETE SET NULL,
  crm_deal_id           UUID,
  expires_at            TIMESTAMPTZ NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','converted_to_sale')),
  notes                 TEXT,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_stock_reservations_updated_at BEFORE UPDATE ON diffusers.stock_reservations FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_diffusers_reservations_product ON diffusers.stock_reservations (product_id, status);
CREATE INDEX idx_diffusers_reservations_expires ON diffusers.stock_reservations (expires_at) WHERE status = 'active';

CREATE TABLE diffusers.stock_adjustments (
  adjustment_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID        NOT NULL REFERENCES diffusers.products (product_id),
  location_id           UUID        NOT NULL REFERENCES diffusers.stock_locations (location_id),
  adjustment_type       TEXT        NOT NULL CHECK (adjustment_type IN ('count','write_off','damage','found','correction')),
  quantity_before       INTEGER     NOT NULL,
  quantity_after        INTEGER     NOT NULL,
  reason                TEXT        NOT NULL,
  approved_by           UUID        REFERENCES shared.users (user_id),
  created_by            UUID        NOT NULL REFERENCES shared.users (user_id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diffusers.stock_transfers (
  transfer_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number       TEXT        NOT NULL UNIQUE,
  from_location_id      UUID        NOT NULL REFERENCES diffusers.stock_locations (location_id),
  to_location_id        UUID        NOT NULL REFERENCES diffusers.stock_locations (location_id),
  status                TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_transit','received','cancelled')),
  notes                 TEXT,
  initiated_by          UUID        NOT NULL REFERENCES shared.users (user_id),
  received_by           UUID        REFERENCES shared.users (user_id),
  initiated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at           TIMESTAMPTZ
);

CREATE TABLE diffusers.quality_checks (
  check_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID        NOT NULL REFERENCES diffusers.products (product_id),
  check_type            TEXT        NOT NULL CHECK (check_type IN ('incoming','periodic','return','pre_consignment')),
  result                TEXT        NOT NULL CHECK (result IN ('pass','fail','conditional')),
  notes                 TEXT,
  checked_by            UUID        NOT NULL REFERENCES shared.users (user_id),
  checked_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
