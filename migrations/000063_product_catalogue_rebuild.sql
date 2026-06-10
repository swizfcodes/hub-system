-- ============================================================
-- MIGRATION 000064 — Product catalogue rebuild (Orika Living)
-- Hub Platform · JBS Praxis
--
-- Aligns the diffusers catalogue with the official RRP document:
--   • 6 scents × 3 formats (Signature 500ml, Grand 1000ml,
--     Car Diffuser 8ml) + 1 Curated Gift Set = 19 products
--   • Corrected names: "Soleil" (not "Solei"), "Oud Amour" (not "Oud Armour")
--   • Prices aligned to the RRP: 500ml ₦99,500 · 1000ml ₦125,000
--     · Car ₦6,500 · Gift Set ₦110,000
--   • Format-based categories: Orika Living → Grand / Signature /
--     Curated Gift Sets / Car Diffusers / Accessories
--   • Every product published to the storefront (store.products)
--   • store.scents populated with fragrance notes from the PDF
--
-- DESIGN — why this never throws an FK error:
--   We do NOT delete products. diffusers.products sits at the bottom
--   of a deep FK tree (po_lines → goods_received_lines, campaign_products
--   → campaign_order_items, stock_movements, etc.). Deleting it means
--   chasing — and destroying — that whole transactional history.
--   Instead we SOFT-RETIRE legacy products (is_deleted = true). The
--   rows stay, so every downstream FK remains valid and the ledger is
--   intact, but they disappear from the catalogue, POS and storefront.
--   The only hard deletes are on store.products (nothing references it)
--   and content tables.
--
-- IDEMPOTENT: safe to re-run. Products upsert by SKU; the retire step
-- excludes the 19 new SKUs; store/scents/signatures all upsert.
--
-- NOTE: do NOT add BEGIN;/COMMIT; here. scripts/migrate.js already
-- wraps every migration file in its own transaction. A COMMIT inside
-- the file closes that transaction early and breaks the migrator's
-- post-run bookkeeping (SAVEPOINT … ROLLBACK TO SAVEPOINT).
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. SOFT-RETIRE legacy products  (no DELETE → no FK violation)
--    Everything that isn't one of the 19 canonical SKUs is hidden.
-- ════════════════════════════════════════════════════════════════
UPDATE diffusers.products
   SET is_active  = false,
       is_deleted = true,
       deleted_at = now(),
       updated_at = now()
 WHERE is_deleted = false
   AND sku NOT IN (
     'ORIKA-SE-OCEAN-500','ORIKA-SE-LEMON-500','ORIKA-SE-MIDOUD-500',
     'ORIKA-SE-SOLEIL-500','ORIKA-SE-ROUGE-500','ORIKA-SE-AMOUR-500',
     'ORIKA-GE-OCEAN-1000','ORIKA-GE-LEMON-1000','ORIKA-GE-MIDOUD-1000',
     'ORIKA-GE-SOLEIL-1000','ORIKA-GE-ROUGE-1000','ORIKA-GE-AMOUR-1000',
     'ORIKA-CD-OCEAN-8','ORIKA-CD-LEMON-8','ORIKA-CD-MIDOUD-8',
     'ORIKA-CD-SOLEIL-8','ORIKA-CD-ROUGE-8','ORIKA-CD-AMOUR-8',
     'ORIKA-GS-TRIO-250'
   );


-- ════════════════════════════════════════════════════════════════
-- 2. CATEGORIES — format-based (Option A). Upsert by unique name.
--    Old categories are deactivated, not deleted (harmless either way).
-- ════════════════════════════════════════════════════════════════

-- Ensure a UNIQUE constraint on category name so ON CONFLICT works.
-- (The original schema didn't include one.)
DO $$ BEGIN
  ALTER TABLE diffusers.product_categories
    ADD CONSTRAINT product_categories_name_key UNIQUE (name);
EXCEPTION WHEN duplicate_table THEN NULL;   -- constraint already exists
         WHEN unique_violation THEN NULL;   -- duplicate names exist (shouldn't happen)
END $$;

-- Root first (children reference it by name below)
INSERT INTO diffusers.product_categories (name, parent_category_id, description, display_order, is_active)
VALUES ('Orika Living', NULL,
        'Orika is a luxury home fragrance brand dedicated to creating scent experiences that elevate everyday living. Rooted in craftsmanship and intentional design.',
        1, true)
ON CONFLICT (name) DO UPDATE
   SET parent_category_id = NULL,
       description        = EXCLUDED.description,
       display_order      = EXCLUDED.display_order,
       is_active          = true;

-- Children
INSERT INTO diffusers.product_categories (name, parent_category_id, description, display_order, is_active)
VALUES
  ('Grand Edition',
   (SELECT category_id FROM diffusers.product_categories WHERE name = 'Orika Living'),
   'Our flagship 1000ml vessel — a statement piece for entryways, living rooms and open spaces.', 1, true),
  ('Signature Edition',
   (SELECT category_id FROM diffusers.product_categories WHERE name = 'Orika Living'),
   'The everyday luxury 500ml diffuser — balanced for bedrooms, studies and quieter corners.', 2, true),
  ('Curated Gift Sets',
   (SELECT category_id FROM diffusers.product_categories WHERE name = 'Orika Living'),
   'A trio of scents in 250ml format, gift-ready in signature Orika packaging.', 3, true),
  ('Car Diffusers',
   (SELECT category_id FROM diffusers.product_categories WHERE name = 'Orika Living'),
   'Scent beyond the home — compact 8ml companions for the drive.', 4, true),
  ('Accessories',
   (SELECT category_id FROM diffusers.product_categories WHERE name = 'Orika Living'),
   'Replacement aroma sticks and diffuser care items.', 5, true)
ON CONFLICT (name) DO UPDATE
   SET parent_category_id = EXCLUDED.parent_category_id,
       description        = EXCLUDED.description,
       display_order      = EXCLUDED.display_order,
       is_active          = true;

-- Deactivate the old format-agnostic categories (kept for history)
UPDATE diffusers.product_categories
   SET is_active = false
 WHERE name IN ('Home Fragrance', 'Reed Diffusers', 'Gift Sets', 'Luxury Car Fragrances');


-- ════════════════════════════════════════════════════════════════
-- 3. PRODUCTS — upsert by SKU. On conflict we KEEP the existing
--    product_id and barcode (so any FK references survive) and just
--    refresh the brand-facing fields.
--    category_id resolved by name subselect (set in step 2).
-- ════════════════════════════════════════════════════════════════

INSERT INTO diffusers.products
  (sku, name, description, category_id,
   cost_price, selling_price, min_selling_price, currency,
   weight_grams, barcode, reorder_level, reorder_quantity,
   custom_fields, is_active, is_deleted)
VALUES
  -- ── Signature Edition (500ml) — RRP ₦99,500 ──────────────
  ('ORIKA-SE-OCEAN-500','Ocean Mist — Signature Edition (500ml)',
   'Bring the calming essence of the sea indoors with Ocean Mist. Presented in a striking blue-tinted glass bottle, this luxury reed diffuser provides a fresh, aquatic, and grounding aroma. Includes premium aroma sticks.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Signature Edition'),
   25000.00, 99500.00, 79600.00, 'NGN', 1534, 'DIF-'||upper(substr(md5(random()::text),1,12)), 5, 50,
   '{"volume_ml":500,"format":"Signature Edition","scent":"Ocean Mist"}'::jsonb, true, false),
  ('ORIKA-SE-LEMON-500','Lemon Verbena — Signature Edition (500ml)',
   'Refresh your space with the crisp, citrus notes of Lemon Verbena. Encased in a deep green-tinted glass bottle, this luxury reed diffuser offers a revitalising and clean fragrance experience. Includes premium aroma sticks.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Signature Edition'),
   25000.00, 99500.00, 79600.00, 'NGN', 1534, 'DIF-'||upper(substr(md5(random()::text),1,12)), 5, 50,
   '{"volume_ml":500,"format":"Signature Edition","scent":"Lemon Verbena"}'::jsonb, true, false),
  ('ORIKA-SE-MIDOUD-500','Midnight Oud — Signature Edition (500ml)',
   'Experience deep, woody elegance with Midnight Oud. This rich, luxurious fragrance is contained in a sophisticated brown-tinted glass bottle, bringing warmth and depth to your home. Includes premium aroma sticks.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Signature Edition'),
   28000.00, 99500.00, 79600.00, 'NGN', 1534, 'DIF-'||upper(substr(md5(random()::text),1,12)), 5, 50,
   '{"volume_ml":500,"format":"Signature Edition","scent":"Midnight Oud"}'::jsonb, true, false),
  ('ORIKA-SE-SOLEIL-500','Soleil — Signature Edition (500ml)',
   'Brighten your environment with Soleil. Housed in a warm, orange-tinted glass bottle, this luxury reed diffuser radiates a vibrant, sun-inspired natural aroma. Includes premium aroma sticks.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Signature Edition'),
   25000.00, 99500.00, 79600.00, 'NGN', 1534, 'DIF-'||upper(substr(md5(random()::text),1,12)), 5, 50,
   '{"volume_ml":500,"format":"Signature Edition","scent":"Soleil"}'::jsonb, true, false),
  ('ORIKA-SE-ROUGE-500','Orika Rouge — Signature Edition (500ml)',
   'A refined luxury reed diffuser presented in an elegant pink-tinted glass bottle. Orika Rouge delivers a captivating and sophisticated fragrance, rooted in nature, designed to elevate any interior space. Includes premium aroma sticks.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Signature Edition'),
   25000.00, 99500.00, 79600.00, 'NGN', 1534, 'DIF-'||upper(substr(md5(random()::text),1,12)), 5, 50,
   '{"volume_ml":500,"format":"Signature Edition","scent":"Orika Rouge"}'::jsonb, true, false),
  ('ORIKA-SE-AMOUR-500','Oud Amour — Signature Edition (500ml)',
   'Envelop your senses with the tender, floral depth of Oud Amour. Displayed in a sleek, grey-tinted glass bottle, this luxury reed diffuser offers a complex, grounding fragrance rooted in refined luxury. Includes premium aroma sticks.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Signature Edition'),
   28000.00, 99500.00, 79600.00, 'NGN', 1534, 'DIF-'||upper(substr(md5(random()::text),1,12)), 5, 50,
   '{"volume_ml":500,"format":"Signature Edition","scent":"Oud Amour"}'::jsonb, true, false),

  -- ── Grand Edition (1000ml) — RRP ₦125,000 ────────────────
  ('ORIKA-GE-OCEAN-1000','Ocean Mist — Grand Edition (1000ml)',
   'A grand statement of refined luxury. The 1000ml Ocean Mist diffuser provides long-lasting, continuous fragrance in our signature fresh aquatic scent, housed in a magnificent blue glass vessel. Includes premium aroma sticks.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Grand Edition'),
   45000.00, 125000.00, 100000.00, 'NGN', 2400, 'DIF-'||upper(substr(md5(random()::text),1,12)), 3, 25,
   '{"volume_ml":1000,"format":"Grand Edition","scent":"Ocean Mist"}'::jsonb, true, false),
  ('ORIKA-GE-LEMON-1000','Lemon Verbena — Grand Edition (1000ml)',
   'A grand statement of refined luxury. The 1000ml Lemon Verbena diffuser provides long-lasting, continuous fragrance in our signature citrus scent, housed in a magnificent deep green glass vessel. Includes premium aroma sticks.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Grand Edition'),
   45000.00, 125000.00, 100000.00, 'NGN', 2400, 'DIF-'||upper(substr(md5(random()::text),1,12)), 3, 25,
   '{"volume_ml":1000,"format":"Grand Edition","scent":"Lemon Verbena"}'::jsonb, true, false),
  ('ORIKA-GE-MIDOUD-1000','Midnight Oud — Grand Edition (1000ml)',
   'A grand statement of refined luxury. The 1000ml Midnight Oud diffuser provides long-lasting, continuous fragrance in our signature woody oud scent, housed in a magnificent brown glass vessel. Includes premium aroma sticks.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Grand Edition'),
   50000.00, 125000.00, 100000.00, 'NGN', 2400, 'DIF-'||upper(substr(md5(random()::text),1,12)), 3, 25,
   '{"volume_ml":1000,"format":"Grand Edition","scent":"Midnight Oud"}'::jsonb, true, false),
  ('ORIKA-GE-SOLEIL-1000','Soleil — Grand Edition (1000ml)',
   'A grand statement of refined luxury. The 1000ml Soleil diffuser provides long-lasting, continuous fragrance in our signature sun-inspired scent, housed in a magnificent orange glass vessel. Includes premium aroma sticks.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Grand Edition'),
   45000.00, 125000.00, 100000.00, 'NGN', 2400, 'DIF-'||upper(substr(md5(random()::text),1,12)), 3, 25,
   '{"volume_ml":1000,"format":"Grand Edition","scent":"Soleil"}'::jsonb, true, false),
  ('ORIKA-GE-ROUGE-1000','Orika Rouge — Grand Edition (1000ml)',
   'A grand statement of refined luxury. The 1000ml Orika Rouge diffuser provides long-lasting, continuous fragrance in our signature captivating scent, housed in a magnificent pink glass vessel. Includes premium aroma sticks.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Grand Edition'),
   45000.00, 125000.00, 100000.00, 'NGN', 2400, 'DIF-'||upper(substr(md5(random()::text),1,12)), 3, 25,
   '{"volume_ml":1000,"format":"Grand Edition","scent":"Orika Rouge"}'::jsonb, true, false),
  ('ORIKA-GE-AMOUR-1000','Oud Amour — Grand Edition (1000ml)',
   'A grand statement of refined luxury. The 1000ml Oud Amour diffuser provides long-lasting, continuous fragrance in our signature floral oud scent, housed in a magnificent grey glass vessel. Includes premium aroma sticks.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Grand Edition'),
   50000.00, 125000.00, 100000.00, 'NGN', 2400, 'DIF-'||upper(substr(md5(random()::text),1,12)), 3, 25,
   '{"volume_ml":1000,"format":"Grand Edition","scent":"Oud Amour"}'::jsonb, true, false),

  -- ── Car Diffusers (8ml) — RRP ₦6,500 ─────────────────────
  ('ORIKA-CD-OCEAN-8','Ocean Mist — Car Diffuser (8ml)',
   'Extend the Ocean Mist experience beyond the home. This premium car diffuser combines luxury fragrance craftsmanship with sleek modern aesthetics. Elegant hanging design with adjustable wooden cap.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Car Diffusers'),
   2000.00, 6500.00, 5200.00, 'NGN', 69, 'DIF-'||upper(substr(md5(random()::text),1,12)), 10, 50,
   '{"volume_ml":8,"format":"Car Diffuser","scent":"Ocean Mist"}'::jsonb, true, false),
  ('ORIKA-CD-LEMON-8','Lemon Verbena — Car Diffuser (8ml)',
   'Extend the Lemon Verbena experience beyond the home. This premium car diffuser combines luxury fragrance craftsmanship with sleek modern aesthetics. Elegant hanging design with adjustable wooden cap.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Car Diffusers'),
   2000.00, 6500.00, 5200.00, 'NGN', 69, 'DIF-'||upper(substr(md5(random()::text),1,12)), 10, 50,
   '{"volume_ml":8,"format":"Car Diffuser","scent":"Lemon Verbena"}'::jsonb, true, false),
  ('ORIKA-CD-MIDOUD-8','Midnight Oud — Car Diffuser (8ml)',
   'Extend the Midnight Oud experience beyond the home. This premium car diffuser combines luxury fragrance craftsmanship with sleek modern aesthetics. Elegant hanging design with adjustable wooden cap.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Car Diffusers'),
   2000.00, 6500.00, 5200.00, 'NGN', 69, 'DIF-'||upper(substr(md5(random()::text),1,12)), 10, 50,
   '{"volume_ml":8,"format":"Car Diffuser","scent":"Midnight Oud"}'::jsonb, true, false),
  ('ORIKA-CD-SOLEIL-8','Soleil — Car Diffuser (8ml)',
   'Extend the Soleil experience beyond the home. This premium car diffuser combines luxury fragrance craftsmanship with sleek modern aesthetics. Elegant hanging design with adjustable wooden cap.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Car Diffusers'),
   2000.00, 6500.00, 5200.00, 'NGN', 69, 'DIF-'||upper(substr(md5(random()::text),1,12)), 10, 50,
   '{"volume_ml":8,"format":"Car Diffuser","scent":"Soleil"}'::jsonb, true, false),
  ('ORIKA-CD-ROUGE-8','Orika Rouge — Car Diffuser (8ml)',
   'Extend the Orika Rouge experience beyond the home. This premium car diffuser combines luxury fragrance craftsmanship with sleek modern aesthetics. Elegant hanging design with adjustable wooden cap.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Car Diffusers'),
   2000.00, 6500.00, 5200.00, 'NGN', 69, 'DIF-'||upper(substr(md5(random()::text),1,12)), 10, 50,
   '{"volume_ml":8,"format":"Car Diffuser","scent":"Orika Rouge"}'::jsonb, true, false),
  ('ORIKA-CD-AMOUR-8','Oud Amour — Car Diffuser (8ml)',
   'Extend the Oud Amour experience beyond the home. This premium car diffuser combines luxury fragrance craftsmanship with sleek modern aesthetics. Elegant hanging design with adjustable wooden cap.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Car Diffusers'),
   2000.00, 6500.00, 5200.00, 'NGN', 69, 'DIF-'||upper(substr(md5(random()::text),1,12)), 10, 50,
   '{"volume_ml":8,"format":"Car Diffuser","scent":"Oud Amour"}'::jsonb, true, false),

  -- ── Curated Gift Set (3 × 250ml) — RRP ₦110,000 ──────────
  ('ORIKA-GS-TRIO-250','Orika Curated Gift Set (3 × 250ml)',
   'The ultimate luxury gifting experience. A premium presentation box featuring three curated 250ml reed diffusers from the Orika collection, accompanied by a dedicated box of high-quality aroma sticks.',
   (SELECT category_id FROM diffusers.product_categories WHERE name='Curated Gift Sets'),
   45000.00, 110000.00, 88000.00, 'NGN', 1689, 'DIF-'||upper(substr(md5(random()::text),1,12)), 2, 15,
   '{"volume_ml":250,"quantity":3,"format":"Curated Gift Set","box_type":"Premium Presentation"}'::jsonb, true, false)
ON CONFLICT (sku) DO UPDATE
   SET name              = EXCLUDED.name,
       description       = EXCLUDED.description,
       category_id       = EXCLUDED.category_id,
       cost_price        = EXCLUDED.cost_price,
       selling_price     = EXCLUDED.selling_price,
       min_selling_price = EXCLUDED.min_selling_price,
       currency          = EXCLUDED.currency,
       weight_grams      = EXCLUDED.weight_grams,
       reorder_level     = EXCLUDED.reorder_level,
       reorder_quantity  = EXCLUDED.reorder_quantity,
       custom_fields     = EXCLUDED.custom_fields,
       is_active         = true,
       is_deleted        = false,
       deleted_at        = NULL,
       updated_at        = now();
       -- barcode intentionally NOT updated → existing barcode preserved


-- ════════════════════════════════════════════════════════════════
-- 4. PRODUCT IMAGES — reuse existing document_ids.
--    500ml scent image is reused for the 1000ml of the same scent;
--    one shared image for all car diffusers; one for the gift set.
--    The JOIN to shared.documents is a GUARD: if a document_id no
--    longer exists, that image row is simply skipped (no FK crash).
-- ════════════════════════════════════════════════════════════════

-- Clear any existing images for just these 19 products, then re-link.
DELETE FROM diffusers.product_images
 WHERE product_id IN (
   SELECT product_id FROM diffusers.products
    WHERE sku IN (
      'ORIKA-SE-OCEAN-500','ORIKA-SE-LEMON-500','ORIKA-SE-MIDOUD-500',
      'ORIKA-SE-SOLEIL-500','ORIKA-SE-ROUGE-500','ORIKA-SE-AMOUR-500',
      'ORIKA-GE-OCEAN-1000','ORIKA-GE-LEMON-1000','ORIKA-GE-MIDOUD-1000',
      'ORIKA-GE-SOLEIL-1000','ORIKA-GE-ROUGE-1000','ORIKA-GE-AMOUR-1000',
      'ORIKA-CD-OCEAN-8','ORIKA-CD-LEMON-8','ORIKA-CD-MIDOUD-8',
      'ORIKA-CD-SOLEIL-8','ORIKA-CD-ROUGE-8','ORIKA-CD-AMOUR-8',
      'ORIKA-GS-TRIO-250'
    )
 );

INSERT INTO diffusers.product_images (product_id, document_id, is_primary, display_order, alt_text)
SELECT p.product_id, d.document_id, true, 0, p.name
FROM diffusers.products p
JOIN (
  VALUES
    ('ORIKA-SE-OCEAN-500',  '11b6ca13-0157-47b1-9995-a31d19f865fd'),
    ('ORIKA-SE-LEMON-500',  '50a327f0-cb9c-4ad6-b8fc-27822924878b'),
    ('ORIKA-SE-MIDOUD-500', 'd1988fd0-749c-4acb-80bb-51c961613709'),
    ('ORIKA-SE-SOLEIL-500', '7b7ff91c-5683-4e5c-aeb7-6afb8429f489'),
    ('ORIKA-SE-ROUGE-500',  'd4defb6d-73a0-4313-8aaa-3114934bf2be'),
    ('ORIKA-SE-AMOUR-500',  '4f1211ad-ae44-49bd-addf-8029fff59ba0'),
    ('ORIKA-GE-OCEAN-1000', '11b6ca13-0157-47b1-9995-a31d19f865fd'),
    ('ORIKA-GE-LEMON-1000', '50a327f0-cb9c-4ad6-b8fc-27822924878b'),
    ('ORIKA-GE-MIDOUD-1000','d1988fd0-749c-4acb-80bb-51c961613709'),
    ('ORIKA-GE-SOLEIL-1000','7b7ff91c-5683-4e5c-aeb7-6afb8429f489'),
    ('ORIKA-GE-ROUGE-1000', 'd4defb6d-73a0-4313-8aaa-3114934bf2be'),
    ('ORIKA-GE-AMOUR-1000', '4f1211ad-ae44-49bd-addf-8029fff59ba0'),
    ('ORIKA-CD-OCEAN-8',    '8664166a-3eba-454a-b571-15063d4c7c09'),
    ('ORIKA-CD-LEMON-8',    '8664166a-3eba-454a-b571-15063d4c7c09'),
    ('ORIKA-CD-MIDOUD-8',   '8664166a-3eba-454a-b571-15063d4c7c09'),
    ('ORIKA-CD-SOLEIL-8',   '8664166a-3eba-454a-b571-15063d4c7c09'),
    ('ORIKA-CD-ROUGE-8',    '8664166a-3eba-454a-b571-15063d4c7c09'),
    ('ORIKA-CD-AMOUR-8',    '8664166a-3eba-454a-b571-15063d4c7c09'),
    ('ORIKA-GS-TRIO-250',   'e493f2ff-d8c9-495e-811b-8f2f4c80912d')
) AS m(sku, doc) ON m.sku = p.sku
JOIN shared.documents d ON d.document_id = m.doc::uuid;   -- guard against stale doc ids


-- ════════════════════════════════════════════════════════════════
-- 5. STORE PRODUCTS — publish every product to the storefront.
--    No price/stock columns here: the store reads them LIVE from
--    diffusers.products + stock_movements. Nothing references
--    store.products, so a full delete + insert is safe.
-- ════════════════════════════════════════════════════════════════

DELETE FROM store.products;

INSERT INTO store.products
  (product_id, slug, scent_family, format, size_ml,
   images, web_description, top_notes, heart_notes, base_notes, is_published)
SELECT p.product_id, m.slug,
       m.fam::store.scent_family, m.fmt::store.product_format, m.size,
       ARRAY['/api/documents/' || m.doc || '/image'],
       m.webdesc, m.top, m.heart, m.base, true
FROM diffusers.products p
JOIN (
  VALUES
    -- sku, slug, scent_family, format, size_ml, doc, web_description, top[], heart[], base[]
    ('ORIKA-SE-OCEAN-500','ocean-mist-signature-500','Fresh & Marine','Signature Edition',500,'11b6ca13-0157-47b1-9995-a31d19f865fd','Bring the calming essence of the sea indoors with Ocean Mist.',                ARRAY['Sea Salt','Grapefruit'],ARRAY['Sage','Rosemary'],ARRAY['Driftwood','Musk']),
    ('ORIKA-SE-LEMON-500','lemon-verbena-signature-500','Citrus & Green','Signature Edition',500,'50a327f0-cb9c-4ad6-b8fc-27822924878b','Refresh your space with the crisp, citrus notes of Lemon Verbena.',             ARRAY['Lemon','Lime','Lemongrass'],ARRAY['Verbena','Green Tea','Jasmine'],ARRAY['Musk','Cedarwood']),
    ('ORIKA-SE-MIDOUD-500','midnight-oud-signature-500','Oud & Floral','Signature Edition',500,'d1988fd0-749c-4acb-80bb-51c961613709','Experience deep, woody elegance with Midnight Oud.',                            ARRAY['Bergamot','Lemon'],ARRAY['Oud','Rose'],ARRAY['Patchouli','Sandalwood']),
    ('ORIKA-SE-SOLEIL-500','soleil-signature-500','Spice & Amber','Signature Edition',500,'7b7ff91c-5683-4e5c-aeb7-6afb8429f489','Brighten your environment with the vibrant, sun-inspired aroma of Soleil.',     ARRAY['Citrus','Green'],ARRAY['Spices','Floral'],ARRAY['Wood','Amber']),
    ('ORIKA-SE-ROUGE-500','orika-rouge-signature-500','Woody & Deep','Signature Edition',500,'d4defb6d-73a0-4313-8aaa-3114934bf2be','A captivating and sophisticated fragrance, rooted in nature.',                  ARRAY['Spices','Citrus'],ARRAY['Teak Wood','Cedar'],ARRAY['Amber','Oud']),
    ('ORIKA-SE-AMOUR-500','oud-amour-signature-500','Floral & Musk','Signature Edition',500,'4f1211ad-ae44-49bd-addf-8029fff59ba0','Envelop your senses with the tender, floral depth of Oud Amour.',               ARRAY['Bergamot','Green Tea'],ARRAY['Jasmine','Orchid'],ARRAY['Sandalwood','Musk']),

    ('ORIKA-GE-OCEAN-1000','ocean-mist-grand-1000','Fresh & Marine','Grand Edition',1000,'11b6ca13-0157-47b1-9995-a31d19f865fd','A grand statement of refined luxury in our signature fresh aquatic scent.',     ARRAY['Sea Salt','Grapefruit'],ARRAY['Sage','Rosemary'],ARRAY['Driftwood','Musk']),
    ('ORIKA-GE-LEMON-1000','lemon-verbena-grand-1000','Citrus & Green','Grand Edition',1000,'50a327f0-cb9c-4ad6-b8fc-27822924878b','A grand statement of refined luxury in our signature citrus scent.',            ARRAY['Lemon','Lime','Lemongrass'],ARRAY['Verbena','Green Tea','Jasmine'],ARRAY['Musk','Cedarwood']),
    ('ORIKA-GE-MIDOUD-1000','midnight-oud-grand-1000','Oud & Floral','Grand Edition',1000,'d1988fd0-749c-4acb-80bb-51c961613709','A grand statement of refined luxury in our signature woody oud scent.',         ARRAY['Bergamot','Lemon'],ARRAY['Oud','Rose'],ARRAY['Patchouli','Sandalwood']),
    ('ORIKA-GE-SOLEIL-1000','soleil-grand-1000','Spice & Amber','Grand Edition',1000,'7b7ff91c-5683-4e5c-aeb7-6afb8429f489','A grand statement of refined luxury in our signature sun-inspired scent.',      ARRAY['Citrus','Green'],ARRAY['Spices','Floral'],ARRAY['Wood','Amber']),
    ('ORIKA-GE-ROUGE-1000','orika-rouge-grand-1000','Woody & Deep','Grand Edition',1000,'d4defb6d-73a0-4313-8aaa-3114934bf2be','A grand statement of refined luxury in our signature captivating scent.',       ARRAY['Spices','Citrus'],ARRAY['Teak Wood','Cedar'],ARRAY['Amber','Oud']),
    ('ORIKA-GE-AMOUR-1000','oud-amour-grand-1000','Floral & Musk','Grand Edition',1000,'4f1211ad-ae44-49bd-addf-8029fff59ba0','A grand statement of refined luxury in our signature floral oud scent.',        ARRAY['Bergamot','Green Tea'],ARRAY['Jasmine','Orchid'],ARRAY['Sandalwood','Musk']),

    ('ORIKA-CD-OCEAN-8','ocean-mist-car-8','Fresh & Marine','Car Diffuser',8,'8664166a-3eba-454a-b571-15063d4c7c09','The Ocean Mist scent experience, extended to your drive.',      ARRAY['Sea Salt','Grapefruit'],ARRAY['Sage','Rosemary'],ARRAY['Driftwood','Musk']),
    ('ORIKA-CD-LEMON-8','lemon-verbena-car-8','Citrus & Green','Car Diffuser',8,'8664166a-3eba-454a-b571-15063d4c7c09','The Lemon Verbena scent experience, extended to your drive.',   ARRAY['Lemon','Lime','Lemongrass'],ARRAY['Verbena','Green Tea','Jasmine'],ARRAY['Musk','Cedarwood']),
    ('ORIKA-CD-MIDOUD-8','midnight-oud-car-8','Oud & Floral','Car Diffuser',8,'8664166a-3eba-454a-b571-15063d4c7c09','The Midnight Oud scent experience, extended to your drive.',    ARRAY['Bergamot','Lemon'],ARRAY['Oud','Rose'],ARRAY['Patchouli','Sandalwood']),
    ('ORIKA-CD-SOLEIL-8','soleil-car-8','Spice & Amber','Car Diffuser',8,'8664166a-3eba-454a-b571-15063d4c7c09','The Soleil scent experience, extended to your drive.',          ARRAY['Citrus','Green'],ARRAY['Spices','Floral'],ARRAY['Wood','Amber']),
    ('ORIKA-CD-ROUGE-8','orika-rouge-car-8','Woody & Deep','Car Diffuser',8,'8664166a-3eba-454a-b571-15063d4c7c09','The Orika Rouge scent experience, extended to your drive.',     ARRAY['Spices','Citrus'],ARRAY['Teak Wood','Cedar'],ARRAY['Amber','Oud']),
    ('ORIKA-CD-AMOUR-8','oud-amour-car-8','Floral & Musk','Car Diffuser',8,'8664166a-3eba-454a-b571-15063d4c7c09','The Oud Amour scent experience, extended to your drive.',       ARRAY['Bergamot','Green Tea'],ARRAY['Jasmine','Orchid'],ARRAY['Sandalwood','Musk']),

    ('ORIKA-GS-TRIO-250','curated-gift-set-trio','Spice & Amber','Curated Gift Set',250,'e493f2ff-d8c9-495e-811b-8f2f4c80912d','A trio of scents, gift-ready in signature Orika packaging.',    ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[])
) AS m(sku, slug, fam, fmt, size, doc, webdesc, top, heart, base) ON m.sku = p.sku;


-- ════════════════════════════════════════════════════════════════
-- 6. STORE SCENTS — content for the 6 scent detail pages.
--    Notes taken directly from the brand RRP document.
-- ════════════════════════════════════════════════════════════════

INSERT INTO store.scents
  (family, name, slug, tagline, description, top_notes, heart_notes, base_notes, swatch, ink, display_order)
VALUES
  ('Fresh & Marine','Ocean Mist','ocean-mist','The calming essence of the sea',
   'A fresh, aquatic, and grounding aroma. Ocean Mist opens with invigorating sea salt and grapefruit, mellows through herbal sage and rosemary, and settles into a warm base of driftwood and musk.',
   ARRAY['Sea Salt','Grapefruit'],ARRAY['Sage','Rosemary'],ARRAY['Driftwood','Musk'],'#4A90D9','#FFFFFF',1),
  ('Citrus & Green','Lemon Verbena','lemon-verbena','Crisp citrus, clean energy',
   'A revitalising, clean fragrance. Lemon Verbena opens with bright lemon, lime and lemongrass, develops through verbena, green tea and jasmine, and rests on a base of musk and cedarwood.',
   ARRAY['Lemon','Lime','Lemongrass'],ARRAY['Verbena','Green Tea','Jasmine'],ARRAY['Musk','Cedarwood'],'#6B8E23','#FFFFFF',2),
  ('Oud & Floral','Midnight Oud','midnight-oud','Deep, woody elegance',
   'A rich, luxurious fragrance bringing warmth and depth. Midnight Oud opens with bergamot and lemon, unfolds through oud and rose, and settles into patchouli and sandalwood.',
   ARRAY['Bergamot','Lemon'],ARRAY['Oud','Rose'],ARRAY['Patchouli','Sandalwood'],'#5C3A21','#FFFFFF',3),
  ('Spice & Amber','Soleil','soleil','Vibrant, sun-inspired warmth',
   'A vibrant, sun-inspired aroma. Soleil opens with citrus and green notes, develops through warm spices and florals, and rests on a foundation of wood and amber.',
   ARRAY['Citrus','Green'],ARRAY['Spices','Floral'],ARRAY['Wood','Amber'],'#E8A317','#000000',4),
  ('Woody & Deep','Orika Rouge','orika-rouge','Captivating sophistication',
   'A captivating, sophisticated fragrance rooted in nature. Orika Rouge opens with spices and citrus, deepens through teak wood and cedar, and settles into amber and oud.',
   ARRAY['Spices','Citrus'],ARRAY['Teak Wood','Cedar'],ARRAY['Amber','Oud'],'#C41E3A','#FFFFFF',5),
  ('Floral & Musk','Oud Amour','oud-amour','Tender, floral depth',
   'A complex, grounding fragrance. Oud Amour opens with bergamot and green tea, blooms through jasmine and orchid, and settles into sandalwood and musk.',
   ARRAY['Bergamot','Green Tea'],ARRAY['Jasmine','Orchid'],ARRAY['Sandalwood','Musk'],'#808080','#FFFFFF',6)
ON CONFLICT (family) DO UPDATE SET
  name=EXCLUDED.name, slug=EXCLUDED.slug, tagline=EXCLUDED.tagline,
  description=EXCLUDED.description, top_notes=EXCLUDED.top_notes,
  heart_notes=EXCLUDED.heart_notes, base_notes=EXCLUDED.base_notes,
  swatch=EXCLUDED.swatch, ink=EXCLUDED.ink, display_order=EXCLUDED.display_order,
  updated_at=now();


-- ════════════════════════════════════════════════════════════════
-- 7. STORE SIGNATURES — the four format cards, correct pricing.
-- ════════════════════════════════════════════════════════════════

INSERT INTO store.signatures (slug, name, size_label, price_label, blurb, display_order) VALUES
  ('grand-edition','Grand Edition','1000ml','₦125,000',
   'Our flagship vessel — a statement piece for entryways, living rooms and open spaces.',0),
  ('signature-edition','Signature Edition','500ml','₦99,500',
   'The everyday luxury — balanced for bedrooms, studies and quieter corners.',1),
  ('curated-gift-set','Curated Gift Set','3 × 250ml','₦110,000',
   'A trio of scents, gift-ready in signature Orika packaging.',2),
  ('car-diffuser','Car Diffuser','8ml','₦6,500',
   'Scent beyond the home — a compact companion for the drive.',3)
ON CONFLICT (slug) DO UPDATE SET
  name=EXCLUDED.name, size_label=EXCLUDED.size_label, price_label=EXCLUDED.price_label,
  blurb=EXCLUDED.blurb, display_order=EXCLUDED.display_order, updated_at=now();


-- ════════════════════════════════════════════════════════════════
-- 8. VERIFY — raises a NOTICE so the migration log confirms counts.
--    (Does not fail the migration; just reports.)
-- ════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_products INT;
  v_images   INT;
  v_store    INT;
  v_scents   INT;
BEGIN
  SELECT count(*) INTO v_products FROM diffusers.products
   WHERE is_deleted=false AND sku LIKE 'ORIKA-%';
  SELECT count(*) INTO v_images FROM diffusers.product_images pi
    JOIN diffusers.products p ON p.product_id=pi.product_id
   WHERE p.is_deleted=false AND p.sku LIKE 'ORIKA-%';
  SELECT count(*) INTO v_store FROM store.products;
  SELECT count(*) INTO v_scents FROM store.scents;
  RAISE NOTICE 'Catalogue rebuild: % active products, % images linked, % store listings, % scent pages',
    v_products, v_images, v_store, v_scents;
  IF v_images < v_products THEN
    RAISE WARNING 'Only % of % products got an image — check that the document_ids still exist in shared.documents.',
      v_images, v_products;
  END IF;
END $$;