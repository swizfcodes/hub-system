-- ============================================================
-- MIGRATION 000023 — Close Sprint 1–3 schema gaps
-- Hub Platform · JBS Praxis
--
-- Pre-Sprint 4 cleanup. Addresses items found during the cross-
-- check of Sprints 1–3 deliverables against the ERP product
-- description.
--
-- This migration is idempotent — every statement uses IF (NOT)
-- EXISTS, so re-running it is safe.
--
-- Sections:
--   1. Drop redundant JSONB columns on business_config
--   2. Add Module 18 (Business Setup) missing columns
--   3. Add Module 13 (Campaigns) schema additions
--   4. Add stock_movements performance index
--   5. Backfill old 'pos_sale' movement_type rows to 'sold'
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. business_config — drop JSONB columns that duplicate
--    normalised tables. The normalised tables (pipeline_stage_defs,
--    custom_field_defs, document_numbering) are the source of truth
--    going forward.
--
--    `payment_methods` is KEPT — it's a genuine config blob with
--    no normalised equivalent (toggles like paystack_enabled,
--    primary method, cash limits).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE shared.business_config
    DROP COLUMN IF EXISTS pipeline_stages,
    DROP COLUMN IF EXISTS custom_field_defs,
    DROP COLUMN IF EXISTS document_prefixes;

-- ─────────────────────────────────────────────────────────────
-- 2. business_config — add Module 18 promised fields
--    The ERP product description Section 6.18 promises:
--      - Mission & Values (visible on staff portal)
--      - Brand fonts (alongside logo, colours)
--      - Cash handling rules and limits
-- ─────────────────────────────────────────────────────────────

ALTER TABLE shared.business_config
    ADD COLUMN IF NOT EXISTS mission_statement text,
    ADD COLUMN IF NOT EXISTS brand_fonts jsonb DEFAULT '{}'::jsonb NOT NULL,
    ADD COLUMN IF NOT EXISTS cash_handling_rules jsonb DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN shared.business_config.mission_statement IS
    'Module 18: visible on staff portal and optionally on documents';
COMMENT ON COLUMN shared.business_config.brand_fonts IS
    'Module 18: {"heading": "Inter", "body": "Inter"} or similar';
COMMENT ON COLUMN shared.business_config.cash_handling_rules IS
    'Module 18: {"max_cash_per_tx": 500000, "require_manager_approval_above": 1000000}';

-- ─────────────────────────────────────────────────────────────
-- 3. Campaigns — add the two items needed for full Module 13
--    coverage: A/B variant linking and saved segments.
-- ─────────────────────────────────────────────────────────────

-- 3a. parent_campaign_id — enables proper A/B test variant linking.
--     Variants link to their parent; getAbTestResults() aggregates
--     across `WHERE campaign_id = $1 OR parent_campaign_id = $1`.

ALTER TABLE jewelry.campaigns
    ADD COLUMN IF NOT EXISTS parent_campaign_id uuid REFERENCES jewelry.campaigns(campaign_id) ON DELETE SET NULL;

ALTER TABLE diffusers.campaigns
    ADD COLUMN IF NOT EXISTS parent_campaign_id uuid REFERENCES diffusers.campaigns(campaign_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jewelry_campaigns_parent
    ON jewelry.campaigns(parent_campaign_id)
    WHERE parent_campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diffusers_campaigns_parent
    ON diffusers.campaigns(parent_campaign_id)
    WHERE parent_campaign_id IS NOT NULL;

-- 3b. contact_segments — reusable named audience filters.
--     A campaign can be created from a named segment instead of
--     redefining the filter inline every time.

CREATE TABLE IF NOT EXISTS shared.contact_segments (
    segment_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text NOT NULL,
    description  text,
    filter       jsonb NOT NULL DEFAULT '{}'::jsonb,
    business     text NOT NULL,
    created_by   uuid,
    created_at   timestamp with time zone NOT NULL DEFAULT now(),
    updated_at   timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT contact_segments_name_business_key UNIQUE (business, name)
);

CREATE INDEX IF NOT EXISTS idx_contact_segments_business
    ON shared.contact_segments(business);

COMMENT ON TABLE shared.contact_segments IS
    'Reusable named audience filters. Module 13 — Email Campaigns.';

-- ─────────────────────────────────────────────────────────────
-- 4. stock_movements — performance index for the movement-history
--    page. Without it, opening the movements tab on a product with
--    a long history takes seconds.
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_jewelry_stock_movements_product_time
    ON jewelry.stock_movements(product_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_diffusers_stock_movements_product_time
    ON diffusers.stock_movements(product_id, performed_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 5. Backfill: rename legacy 'pos_sale' movements to 'sold'.
--    Sprint 3 normalised the POS module to use the canonical
--    movement type. Old data is harmless but inconsistent;
--    backfill is fast (single UPDATE per schema) and keeps
--    movement-type queries simple going forward.
-- ─────────────────────────────────────────────────────────────

UPDATE jewelry.stock_movements
    SET movement_type = 'sold'
    WHERE movement_type = 'pos_sale';

UPDATE diffusers.stock_movements
    SET movement_type = 'sold'
    WHERE movement_type = 'pos_sale';


-- ============================================================
-- POST-MIGRATION NOTES
--
-- After this migration, modules/dashboards/dashboards.repository
-- still queries `movement_type IN ('sold','pos_sale')` on line 147.
-- That's now redundant — all rows are 'sold'. The IN clause can be
-- simplified to a plain equality in a future polish pass, but
-- leaving it as-is causes no harm.
-- ============================================================