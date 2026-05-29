-- ============================================================
-- MIGRATION 000035 — Stock transfer lines + role UUID reseed
--
-- Two unrelated fixes bundled into one migration:
--
--  1. stock_transfer_lines — first-class child table for multi-product
--     transfers. The original schema captured transfer items implicitly
--     as movement rows referencing the transfer; that loses
--     line-level identity (per-line quantities, future per-line
--     statuses, reordering). With the pending → in_transit → received
--     state machine we now also need the lines BEFORE any movements
--     exist (a pending transfer has lines but no movements yet),
--     so the table is necessary, not just nice-to-have.
--
--  2. Roles reseed — the original seven system roles were inserted
--     with sentinel UUIDs like '00000001-0000-0000-0000-00000000000X',
--     whose version nibble is `0`. RFC 4122 reserves versions 1-5
--     only, so express-validator's `isUUID()` (and validator.js, and
--     any strict parser) rejects them. Real `gen_random_uuid()` v4
--     IDs are issued, permissions are remapped to the new IDs, and
--     legacy rows are deleted.
--
--     Caveat: anywhere in your DB or test fixtures that referenced
--     the literal sentinel IDs needs updating. Production user-role
--     assignments are migrated automatically by FK; standalone
--     fixtures aren't.
--
-- Re-runnable: lines table uses IF NOT EXISTS; reseed is guarded by
-- a check on role_id format so it skips if already migrated.
-- ============================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1.  stock_transfer_lines (per-business)
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jewelry.stock_transfer_lines (
  line_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id    UUID         NOT NULL
                 REFERENCES jewelry.stock_transfers (transfer_id) ON DELETE CASCADE,
  product_id     UUID         NOT NULL REFERENCES jewelry.products (product_id),
  quantity       INTEGER      NOT NULL CHECK (quantity > 0),
  display_order  INTEGER      NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jewelry_transfer_lines_transfer
  ON jewelry.stock_transfer_lines (transfer_id);
CREATE INDEX IF NOT EXISTS idx_jewelry_transfer_lines_product
  ON jewelry.stock_transfer_lines (product_id);

CREATE TABLE IF NOT EXISTS diffusers.stock_transfer_lines (
  line_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id    UUID         NOT NULL
                 REFERENCES diffusers.stock_transfers (transfer_id) ON DELETE CASCADE,
  product_id     UUID         NOT NULL REFERENCES diffusers.products (product_id),
  quantity       INTEGER      NOT NULL CHECK (quantity > 0),
  display_order  INTEGER      NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diffusers_transfer_lines_transfer
  ON diffusers.stock_transfer_lines (transfer_id);
CREATE INDEX IF NOT EXISTS idx_diffusers_transfer_lines_product
  ON diffusers.stock_transfer_lines (product_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 2.  Reseed system roles with valid v4 UUIDs
--
--     For each old role, mint a new UUID, redirect all references,
--     then drop the old row. We do the swap in a single DO block so
--     it either fully completes or rolls back. Idempotent: if no
--     rows match the sentinel pattern, the block is a no-op.
-- ──────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r           RECORD;
  v_new_id    UUID;
BEGIN
  -- Only run if at least one sentinel-shaped role still exists.
  IF NOT EXISTS (
    SELECT 1 FROM shared.roles
    WHERE role_id::TEXT LIKE '00000001-0000-0000-0000-%'
  ) THEN
    RAISE NOTICE 'Roles already reseeded — skipping.';
    RETURN;
  END IF;

  FOR r IN
    SELECT role_id, role_name
      FROM shared.roles
     WHERE role_id::TEXT LIKE '00000001-0000-0000-0000-%'
     ORDER BY role_name
  LOOP
    v_new_id := gen_random_uuid();

    -- Create replacement role FIRST
    INSERT INTO shared.roles (
      role_id,
      role_name,
      business,
      is_system,
      description
    )
    SELECT
      v_new_id,
      role_name,
      business,
      is_system,
      description
    FROM shared.roles
    WHERE role_id = r.role_id;

    -- Redirect permissions
    UPDATE shared.permissions
       SET role_id = v_new_id
     WHERE role_id = r.role_id;

    -- Redirect user_roles if table exists
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'shared'
        AND table_name = 'user_roles'
    ) THEN
      EXECUTE format(
        'UPDATE shared.user_roles
            SET role_id = %L
          WHERE role_id = %L',
        v_new_id,
        r.role_id
      );
    END IF;

    -- Delete old role LAST
    DELETE FROM shared.roles
     WHERE role_id = r.role_id;

    RAISE NOTICE 'Reseeded role %: % -> %',
      r.role_name,
      r.role_id,
      v_new_id;
  END LOOP;
END $$;
