-- =====================================================================
--  STRATEGIC DATA WIPE — Hub Platform (JBS Praxis)
-- ---------------------------------------------------------------------
--  KEEPS data in:  Contacts (+CRM), Business Setup, Stock, Catalogue
--  WIPES data in:  everything else — sales, quotations, POS, invoicing,
--                  accounting postings (journals), purchasing, expenses,
--                  payroll, consignment, deliveries, campaigns/marketing,
--                  loyalty, social, messaging/comms, scheduling/tasks,
--                  audit log, help center, store orders/enquiries, tax
--                  filings, etc.
--
--  METHOD : TRUNCATE ... RESTART IDENTITY  (rows removed, tables + schema
--           preserved; identity/sequences reset to 1). NOT a DROP.
--  SCOPE  : schemas  shared, jewelry, diffusers, store
--
--  ⚠  SAFETY
--    • Confirm you are connected to the CORRECT database first.
--    • Take a backup:  pg_dump -Fc yourdb > pre_wipe.dump
--    • This runs inside ONE transaction. Read the NOTICE output, then
--      COMMIT (bottom of file) or change it to ROLLBACK to abort.
--
--  The keep-list below was derived from the migrations. It intentionally
--  keeps the config/master rows other kept tables depend on:
--    - chart_of_accounts + fiscal_periods (products FK to accounts)
--    - work_locations (staff_profiles FK to it)
--    - shared.documents / document_tags (product_images & contact_addresses
--      have NOT NULL FKs to documents)
--    - suppliers (catalogue/stock supplier links)
--    - auth: roles/users/permissions/sessions (so you can still log in)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- STEP 1 — Neutralise the ONLY foreign key that points FROM a kept table
--          INTO a wiped table:
--              stock_locations.partner_id -> retail_partners  (SET NULL)
--          Drop the FK and null the column so retail_partners can be
--          truncated without CASCADE dragging in the kept stock_locations.
-- ---------------------------------------------------------------------
ALTER TABLE jewelry.stock_locations   DROP CONSTRAINT IF EXISTS fk_jewelry_stock_locations_partner;
ALTER TABLE diffusers.stock_locations DROP CONSTRAINT IF EXISTS fk_diffusers_stock_locations_partner;

UPDATE jewelry.stock_locations   SET partner_id = NULL WHERE partner_id IS NOT NULL;
UPDATE diffusers.stock_locations SET partner_id = NULL WHERE partner_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- STEP 2 — Truncate every base table in the target schemas EXCEPT the
--          keep-list. CASCADE resolves FK ordering among the wiped set.
--          (After Step 1, CASCADE can no longer reach any kept table.)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  keep text[] := ARRAY[
    ----------------------------------------------------------------- CONTACTS
    'shared.contacts','shared.contact_tags','shared.contact_addresses','shared.contact_segments',
    ----------------------------------------------------------- CONTACTS / CRM (biz)
    'jewelry.crm_deals','jewelry.crm_activities','jewelry.crm_notes',
    'jewelry.customer_preferences','jewelry.customer_milestones','jewelry.crm_settings',
    'diffusers.crm_deals','diffusers.crm_activities','diffusers.crm_notes',
    'diffusers.customer_preferences','diffusers.customer_milestones','diffusers.crm_settings',
    ------------------------------------------------------------ BUSINESS SETUP / CONFIG
    'shared.business_config','shared.custom_field_defs','shared.pipeline_stage_defs',
    'shared.document_numbering','shared.tax_rates','shared.currency_rates','shared.bank_accounts',
    'shared.platform_settings','shared.user_nav_prefs','shared.migrations',
    'shared.documents','shared.document_tags','shared.work_locations',
    ------------------------------------------------------------ AUTH / USERS (login)
    'shared.roles','shared.users','shared.user_sessions','shared.refresh_tokens',
    'shared.permissions','shared.user_roles','shared.staff_profiles','shared.staff_contracts',
    'shared.staff_assets','shared.invite_tokens','shared.password_reset_otps','shared.push_subscriptions',
    ----------------------------------------------------- SETUP referenced by catalogue/stock
    'jewelry.suppliers','jewelry.chart_of_accounts','jewelry.fiscal_periods',
    'diffusers.suppliers','diffusers.chart_of_accounts','diffusers.fiscal_periods',
    'jewelry.delivery_zones','jewelry.delivery_settings','jewelry.tax_profile',
    'diffusers.delivery_zones','diffusers.delivery_settings','diffusers.tax_profile',
    ----------------------------------------------------------------- CATALOGUE
    'jewelry.product_categories','jewelry.products','jewelry.product_images',
    'jewelry.product_suppliers','jewelry.barcodes',
    'diffusers.product_categories','diffusers.products','diffusers.product_images',
    'diffusers.product_suppliers','diffusers.barcodes',
    ----------------------------------------------------------------- STOCK
    'jewelry.stock_locations','jewelry.stock_movements','jewelry.stock_reservations',
    'jewelry.stock_adjustments','jewelry.stock_transfers','jewelry.stock_transfer_lines',
    'jewelry.quality_checks','jewelry.stock_batches',
    'diffusers.stock_locations','diffusers.stock_movements','diffusers.stock_reservations',
    'diffusers.stock_adjustments','diffusers.stock_transfers','diffusers.stock_transfer_lines',
    'diffusers.quality_checks','diffusers.stock_batches',
    ------------------------------------------------------- STORE front master data
    'store.products','store.scents','store.signatures','store.settings'
  ];
  r   record;
  tbl text;
  n   int := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname IN ('shared','jewelry','diffusers','store')
      AND (schemaname || '.' || tablename) <> ALL (keep)
    ORDER BY schemaname, tablename
  LOOP
    tbl := format('%I.%I', r.schemaname, r.tablename);
    RAISE NOTICE 'TRUNCATE %', tbl;
    EXECUTE 'TRUNCATE TABLE ' || tbl || ' RESTART IDENTITY CASCADE';
    n := n + 1;
  END LOOP;
  RAISE NOTICE '--- Wiped % tables. % kept. ---', n, array_length(keep, 1);
END $$;

-- ---------------------------------------------------------------------
-- STEP 3 — Restore the stock_locations -> retail_partners FK (optional,
--          keeps schema identical to before). Safe now: partner_id is NULL.
-- ---------------------------------------------------------------------
ALTER TABLE jewelry.stock_locations
  ADD CONSTRAINT fk_jewelry_stock_locations_partner
  FOREIGN KEY (partner_id) REFERENCES jewelry.retail_partners (partner_id) ON DELETE SET NULL;
ALTER TABLE diffusers.stock_locations
  ADD CONSTRAINT fk_diffusers_stock_locations_partner
  FOREIGN KEY (partner_id) REFERENCES diffusers.retail_partners (partner_id) ON DELETE SET NULL;

-- =====================================================================
--  Review the NOTICE output above.
--    Correct?  ->  COMMIT;   (default below)
--    Abort?    ->  replace COMMIT with  ROLLBACK;
-- =====================================================================
COMMIT;
