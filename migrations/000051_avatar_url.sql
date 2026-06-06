-- ─────────────────────────────────────────────────────────────
-- 000051 — Add avatar_url to contacts
-- ─────────────────────────────────────────────────────────────

ALTER TABLE shared.contacts
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN shared.contacts.avatar_url IS
  'URL to the contact profile photo. Uploaded via /api/uploads/avatar.';
