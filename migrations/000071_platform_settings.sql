-- ============================================================
-- MIGRATION 000071 — Platform settings (white-label foundation)
--
-- Layer-1 branding: the identity of the APP itself — product
-- name, wordmark, fonts and the full colour theme. One row per
-- deployment (singleton, like crm_settings). Re-branding for a
-- new client = edit this row; no rebuild, no code fork.
--
-- Layer-2 branding (per business: accent, logo, display name)
-- already lives on shared.business_config and is consumed
-- alongside this by GET /api/branding.
--
-- theme: JSONB map of design tokens → "R G B" triplets (space-
-- separated, so the frontend can compose rgb(var(--x) / alpha)).
-- Seeded with the current Orika Hub palette so this deployment
-- renders identically before and after the switch.
-- ============================================================

CREATE TABLE shared.platform_settings (
  id              BOOLEAN     PRIMARY KEY DEFAULT true CHECK (id),
  product_name    TEXT        NOT NULL DEFAULT 'Orika Hub',
  tagline         TEXT,
  company_name    TEXT,
  logo_light_url  TEXT,   -- wordmark for dark surfaces
  logo_dark_url   TEXT,   -- wordmark for light surfaces
  favicon_url     TEXT,
  font_display    TEXT    NOT NULL DEFAULT 'Cormorant Garamond',
  font_body       TEXT    NOT NULL DEFAULT 'Montserrat',
  font_mono       TEXT    NOT NULL DEFAULT 'JetBrains Mono',
  -- Optional full CSS URL override (self-hosted / licensed fonts).
  -- When NULL the frontend builds a Google Fonts URL from the names.
  font_css_url    TEXT,
  theme           JSONB   NOT NULL DEFAULT '{}',
  updated_by      UUID    REFERENCES shared.users (user_id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO shared.platform_settings
  (product_name, tagline, company_name, logo_light_url, logo_dark_url, theme)
VALUES (
  'Orika Hub',
  'Where luxury meets intelligence',
  'Orika Living',
  '/assets/images/logos/orika-logo-white.png',
  '/assets/images/logos/orika-logo-black.png',
  '{
    "brand-black":       "10 9 8",
    "brand-charcoal":    "26 24 20",
    "brand-graphite":    "42 37 32",
    "brand-ink":         "58 52 46",
    "brand-cream":       "240 234 224",
    "brand-cloud":       "200 194 184",
    "brand-smoke":       "106 101 96",
    "brand-stone":       "158 152 145",
    "brand-accent":      "201 168 108",
    "brand-accent-dim":  "138 106 48",
    "brand-accent-glow": "217 188 135",
    "accent2":           "139 157 119",
    "accent2-dim":       "111 126 94",
    "accent2-glow":      "168 184 148",
    "accent3":           "183 110 121",
    "accent3-dim":       "149 88 98",
    "accent3-glow":      "208 142 151",
    "surface-light":      "240 234 224",
    "surface-light-soft": "230 223 211",
    "surface-light-deep": "217 208 194",
    "state-success":     "139 157 119",
    "state-warn":        "217 167 65",
    "state-danger":      "199 91 91",
    "state-info":        "122 143 168"
  }'::jsonb
);
