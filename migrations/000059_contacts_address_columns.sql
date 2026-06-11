-- ============================================================
-- MIGRATION 000059 — address_city / address_state on shared.contacts
--
-- The walk-in QR registration form collects city + state.
-- These need to exist as flat columns on shared.contacts so
-- contacts.public.routes.js (POST /register/:business) can
-- INSERT and UPDATE them.
--
-- Uses DO $$ blocks so the migration is safely re-runnable.
-- ============================================================

ALTER TABLE shared.contacts ADD COLUMN IF NOT EXISTS address_city  TEXT;
ALTER TABLE shared.contacts ADD COLUMN IF NOT EXISTS address_state TEXT;

COMMENT ON COLUMN shared.contacts.address_city IS
  'City of residence — collected via walk-in QR registration or manual CRM entry.';
COMMENT ON COLUMN shared.contacts.address_state IS
  'State / region — collected via walk-in QR registration or manual CRM entry.';
