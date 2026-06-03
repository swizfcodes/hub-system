-- ============================================================
-- MIGRATION 000049 — Storefront settings + signatures seed
-- Hub Platform · JBS Praxis
--
-- Two things:
--   1. store.settings — a SINGLETON content row driving the
--      homepage hero ("Rooted in Nature" + note + background) and
--      the "Range" section header copy. Typed columns (per the
--      agreed design) so the admin form and validation stay simple;
--      new blocks become new columns as more of the page moves to
--      the backend.
--   2. Seed store.signatures with the four formats the storefront
--      currently falls back to, so the Signatures (Formats) admin
--      opens PRE-FILLED rather than blank. Images are left null —
--      staff upload them from the ERP.
--
-- Idempotent throughout. Safe to re-run: the singleton insert and
-- the signature seeds both use ON CONFLICT DO NOTHING, so re-running
-- never clobbers values edited in the ERP.
-- ============================================================

BEGIN;

-- ── store.settings — singleton storefront content ───────────
CREATE TABLE IF NOT EXISTS store.settings (
  id                   integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Hero
  hero_eyebrow         text,
  hero_headline        text,
  hero_headline_accent text,   -- the italic word ("Nature")
  hero_note            text,
  hero_image           text,   -- /api/documents/{id}/image ref or absolute URL
  -- "Range" / formats section header
  range_eyebrow        text,
  range_title          text,
  range_subtitle       text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Seed the singleton with the storefront's current hardcoded copy so
-- the Content editor opens pre-filled. Inserts once; never overwrites.
INSERT INTO store.settings (
  id,
  hero_eyebrow, hero_headline, hero_headline_accent, hero_note,
  range_eyebrow, range_title, range_subtitle
) VALUES (
  1,
  'Orika Living · Lagos, Nigeria',
  'Rooted in',
  'Nature',
  'Premium reed diffusers crafted to transform a room into an experience. Six signature scents. One quiet ritual.',
  'The Range',
  'Four formats. Every occasion.',
  'From flagship statement pieces to the compact car diffuser — Orika scales with the space and the moment.'
)
ON CONFLICT (id) DO NOTHING;

-- ── Seed store.signatures (the four formats) ────────────────
-- Mirrors lib/signatures/index.ts on the storefront. Images null —
-- uploaded from the ERP. ON CONFLICT keeps any existing edits.
INSERT INTO store.signatures (slug, name, size_label, price_label, blurb, display_order) VALUES
  ('grand-edition',     'Grand Edition',     '1000ml',    '₦125,000',
   'Our flagship vessel — a statement piece for entryways, living rooms and open spaces.', 0),
  ('signature-edition', 'Signature Edition', '500ml',     '₦99,500',
   'The everyday luxury — balanced for bedrooms, studies and quieter corners.', 1),
  ('curated-gift-set',  'Curated Gift Set',  '3 × 250ml', '₦110,000',
   'A trio of scents, gift-ready in signature Orika packaging. For the people you choose deliberately.', 2),
  ('car-diffuser',      'Car Diffuser',      '8ml',       '₦6,500',
   'Scent beyond the home — a compact companion for the drive.', 3)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
