-- ============================================================
-- 000064 — Expand invoice_type CHECK to include pos_sale
--
-- The POS Generate Invoice flow creates invoices with
-- invoice_type = 'pos_sale', which the original CHECK
-- constraint didn't include.
-- ============================================================

-- ── JEWELRY ─────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'jewelry.invoices'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%invoice_type%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE jewelry.invoices DROP CONSTRAINT ' || conname
      FROM pg_constraint
      WHERE conrelid = 'jewelry.invoices'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%invoice_type%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE jewelry.invoices
  ADD CONSTRAINT invoices_invoice_type_check
  CHECK (invoice_type IN ('standard','proforma','retail_partner_settlement','pos_sale','direct_sale'));

-- ── DIFFUSERS ───────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'diffusers.invoices'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%invoice_type%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE diffusers.invoices DROP CONSTRAINT ' || conname
      FROM pg_constraint
      WHERE conrelid = 'diffusers.invoices'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%invoice_type%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE diffusers.invoices
  ADD CONSTRAINT invoices_invoice_type_check
  CHECK (invoice_type IN ('standard','proforma','retail_partner_settlement','pos_sale','direct_sale'));
