-- ─────────────────────────────────────────────────────────────
-- 000066 — Procurement hardening
--
--   1. po_lines.description        — free-text spec/note per line
--   2. supplier_invoice_lines      — persist the per-line bill detail
--                                    (what the supplier billed + variance),
--                                    so 3-way matches stay auditable
--   3. supplier_invoices.has_variance — flag bills accepted with a price
--                                    variance against the PO
--
-- Applied to both business schemas. The migration template
-- (000014_business_purchasing) is updated in parallel so newly
-- provisioned businesses get these from the start.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  biz TEXT;
BEGIN
  FOREACH biz IN ARRAY ARRAY['jewelry', 'diffusers'] LOOP
    -- Skip a schema that doesn't exist in this environment.
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = biz) THEN
      CONTINUE;
    END IF;

    -- 1. po_lines.description
    EXECUTE format(
      'ALTER TABLE %I.po_lines ADD COLUMN IF NOT EXISTS description TEXT',
      biz
    );

    -- 3. supplier_invoices.has_variance
    EXECUTE format(
      'ALTER TABLE %I.supplier_invoices ADD COLUMN IF NOT EXISTS has_variance BOOLEAN NOT NULL DEFAULT false',
      biz
    );

    -- 2. supplier_invoice_lines
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.supplier_invoice_lines (
        bill_line_id    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        sup_invoice_id  UUID          NOT NULL REFERENCES %I.supplier_invoices (sup_invoice_id) ON DELETE CASCADE,
        po_line_id      UUID          REFERENCES %I.po_lines (line_id) ON DELETE SET NULL,
        product_id      UUID          REFERENCES %I.products (product_id),
        description     TEXT,
        quantity        NUMERIC(14,2) NOT NULL,
        unit_price      NUMERIC(14,2) NOT NULL,
        line_total      NUMERIC(14,2) NOT NULL,
        variance_note   TEXT
      )
    $f$, biz, biz, biz, biz);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_bill_lines_invoice ON %I.supplier_invoice_lines (sup_invoice_id)',
      biz, biz
    );
  END LOOP;
END $$;
