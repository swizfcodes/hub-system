-- ─────────────────────────────────────────────────────────────
-- 000069 — Dynamic navigation priority ("top 10" grid)
--
-- The Command Centre grid and sidebar were showing all ~29 modules
-- to everyone. Navigation now resolves a per-user "top 10":
--   1. user's own pinned list  (shared.user_nav_prefs.pinned)
--   2. their role's default    (shared.roles.default_nav)
--   3. global default order    (frontend HUB_MODULES.defaultPriority)
-- Each level is permission-filtered; missing slots top up from the
-- next level. Everything else lives behind a "More" section.
-- ─────────────────────────────────────────────────────────────

-- Role-level default navigation (set in the Role Editor).
-- NULL = no role default; fall through to the global order.
ALTER TABLE shared.roles
  ADD COLUMN IF NOT EXISTS default_nav TEXT[] DEFAULT NULL;

-- Per-user pinned navigation. One row per user; NULL row = not customised.
CREATE TABLE IF NOT EXISTS shared.user_nav_prefs (
  user_id    UUID PRIMARY KEY REFERENCES shared.users (user_id) ON DELETE CASCADE,
  pinned     TEXT[] NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Seed sensible defaults for the system roles ──────────────
-- Owner/manager get the business-wide daily-driver set; the sales
-- role gets a cashier-centric set; accountant gets finance-first;
-- stock_manager and logistics get ops-first. Custom roles start
-- NULL (global default) until an admin sets one.

UPDATE shared.roles SET default_nav =
  ARRAY['dashboard','pos','sales','crm','catalogue','stock','logistics','invoicing','expenses','reports']
WHERE role_name IN ('owner','manager') AND business IS NULL AND default_nav IS NULL;

UPDATE shared.roles SET default_nav =
  ARRAY['dashboard','pos','sales','crm','catalogue','stock','logistics','messaging','tasks','calendar']
WHERE role_name = 'sales' AND business IS NULL AND default_nav IS NULL;

UPDATE shared.roles SET default_nav =
  ARRAY['dashboard','invoicing','accounting','expenses','tax','reports','payroll','purchasing','sales','stock']
WHERE role_name = 'accountant' AND business IS NULL AND default_nav IS NULL;

UPDATE shared.roles SET default_nav =
  ARRAY['dashboard','stock','catalogue','purchasing','logistics','sales','pos','reports','tasks','documents']
WHERE role_name = 'stock_manager' AND business IS NULL AND default_nav IS NULL;

UPDATE shared.roles SET default_nav =
  ARRAY['dashboard','logistics','sales','stock','crm','reports','tasks','calendar','messaging','documents']
WHERE role_name = 'logistics' AND business IS NULL AND default_nav IS NULL;

UPDATE shared.roles SET default_nav =
  ARRAY['dashboard','workspace','expenses','messaging','tasks','calendar','help']
WHERE role_name = 'staff' AND business IS NULL AND default_nav IS NULL;
