-- ============================================================
-- MIGRATION 000047 — Audit module permissions
-- Hub Platform · JBS Praxis
--
-- The audit API (shared/audit/audit.routes) gates every endpoint on
-- can("audit", "view") / can("audit", "export"). No permission rows
-- for the "audit" module were ever seeded, so the permission
-- middleware denies EVERY request — including the owner's — and the
-- per-record Audit tab always returns 403 → renders empty.
--
-- This back-fills audit view/export for owner + manager.
--
-- NOTE: roles are matched by role_name, NOT by hardcoded UUID. The
-- original sentinel role IDs ('00000001-0000-0000-0000-00000000000X')
-- were reseeded with fresh v4 UUIDs in migration 000035, so any
-- hardcoded ID would violate permissions_role_id_fkey.
--
-- Idempotent: ON CONFLICT DO NOTHING. Safe to re-run / fresh installs.
-- ============================================================


INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
SELECT r.role_id, 'audit', a.action, 'all', '{}'
FROM shared.roles r
CROSS JOIN (VALUES ('view'), ('export')) AS a(action)
WHERE r.role_name IN ('owner', 'manager')
ON CONFLICT (role_id, module, action) DO NOTHING;

-- ── Cache invalidation note ───────────────────────────────────
-- The permission middleware caches per role_id in Redis. After
-- applying this migration, restart the API server (or flush the
-- Redis permission cache) so the new rows take effect immediately.

