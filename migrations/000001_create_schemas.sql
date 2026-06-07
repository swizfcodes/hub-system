-- ============================================================
-- MIGRATION 000001 — Create schemas, roles, extensions
-- Hub Platform · JBS Praxis
-- Run this FIRST — everything else depends on it
-- ============================================================

-- Enable UUID generation (built into PG 13+, uses gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Schemas ──────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS shared;
CREATE SCHEMA IF NOT EXISTS jewelry;
CREATE SCHEMA IF NOT EXISTS diffusers;

-- ── Application role ─────────────────────────────────────
-- hub_app is the role the Node.js server connects as.
-- Never connect as superuser from the application.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hub_app') THEN
    CREATE ROLE hub_app LOGIN PASSWORD 'CHANGE_THIS_IN_ENV';
  END IF;
END $$;

-- hub_auditor can only INSERT into audit_log — never UPDATE/DELETE
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hub_auditor') THEN
    CREATE ROLE hub_auditor LOGIN PASSWORD 'CHANGE_THIS_IN_ENV_2';
  END IF;
END $$;

-- hub_reporter is read-only across all schemas
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hub_reporter') THEN
    CREATE ROLE hub_reporter LOGIN PASSWORD 'CHANGE_THIS_IN_ENV_3';
  END IF;
END $$;

-- ── Schema usage grants ───────────────────────────────────
GRANT USAGE ON SCHEMA shared    TO hub_app, hub_auditor, hub_reporter;
GRANT USAGE ON SCHEMA jewelry   TO hub_app, hub_reporter;
GRANT USAGE ON SCHEMA diffusers TO hub_app, hub_reporter;

-- ── Default privileges (applied to future tables) ─────────
-- hub_app gets full DML on all three schemas
ALTER DEFAULT PRIVILEGES IN SCHEMA shared
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hub_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA jewelry
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hub_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA diffusers
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hub_app;

-- hub_auditor gets INSERT only on shared (audit_log)
ALTER DEFAULT PRIVILEGES IN SCHEMA shared
  GRANT INSERT ON TABLES TO hub_auditor;

-- hub_reporter gets SELECT only
ALTER DEFAULT PRIVILEGES IN SCHEMA shared
  GRANT SELECT ON TABLES TO hub_reporter;
ALTER DEFAULT PRIVILEGES IN SCHEMA jewelry
  GRANT SELECT ON TABLES TO hub_reporter;
ALTER DEFAULT PRIVILEGES IN SCHEMA diffusers
  GRANT SELECT ON TABLES TO hub_reporter;

-- ── Sequence grants ───────────────────────────────────────
ALTER DEFAULT PRIVILEGES IN SCHEMA shared
  GRANT USAGE, SELECT ON SEQUENCES TO hub_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA jewelry
  GRANT USAGE, SELECT ON SEQUENCES TO hub_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA diffusers
  GRANT USAGE, SELECT ON SEQUENCES TO hub_app;

-- ── Reusable trigger function for updated_at ─────────────
-- Created here so it is available to all schemas.
CREATE OR REPLACE FUNCTION shared.fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- Verify
-- SELECT schema_name FROM information_schema.schemata
-- WHERE schema_name IN ('shared', 'jewelry', 'diffusers');
-- Expected: 3 rows
-- ============================================================
