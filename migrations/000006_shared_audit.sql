-- ============================================================
-- MIGRATION 000006 — Shared audit & system protection
-- audit_log (append-only, protected by trigger 000021)
-- ============================================================

-- ── audit_log ─────────────────────────────────────────────
-- APPEND-ONLY. The hub_app role has INSERT only.
-- NEVER UPDATE or DELETE. Enforced by trigger trg_audit_protect (migration 000021).
-- Stores full before/after JSONB snapshots for complete record reconstruction.
CREATE TABLE shared.audit_log (
  log_id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Snapshot fields — NOT foreign keys, user records can be deleted
  user_id               UUID,
  user_name             TEXT        NOT NULL,
  user_email            TEXT,
  business              TEXT        NOT NULL,
  -- What happened
  module                TEXT        NOT NULL,
  action                TEXT        NOT NULL,
  -- Actions: create | update | delete | login | logout | password_change
  --          permission_change | export | approve | reject | print | email_sent
  table_name            TEXT,
  record_id             UUID,
  -- Full row snapshots
  before_state          JSONB,      -- NULL for creates
  after_state           JSONB,      -- NULL for deletes
  -- Request context
  ip_address            INET,
  user_agent            TEXT,
  session_id            TEXT,       -- JWT jti claim
  -- Additional metadata
  metadata              JSONB       DEFAULT '{}'
);

-- Performance indexes — this table grows fast
CREATE INDEX idx_audit_log_occurred    ON shared.audit_log (occurred_at DESC);
CREATE INDEX idx_audit_log_record      ON shared.audit_log (table_name, record_id) WHERE record_id IS NOT NULL;
CREATE INDEX idx_audit_log_user        ON shared.audit_log (user_id, occurred_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_log_module      ON shared.audit_log (business, module, occurred_at DESC);
CREATE INDEX idx_audit_log_action      ON shared.audit_log (action, occurred_at DESC);

-- Revoke UPDATE and DELETE from hub_app on audit_log
-- (hub_auditor has INSERT only, set in migration 000001)
REVOKE UPDATE, DELETE ON shared.audit_log FROM hub_app;

-- ============================================================
-- SHARED SCHEMA COMPLETE — 38 tables total:
--
-- System (000002):    business_config, custom_field_defs,
--                     pipeline_stage_defs, document_numbering,
--                     tax_rates, currency_rates, bank_accounts,
--                     webhook_log, migrations
--
-- People (000003):    contacts, contact_tags, roles, users,
--                     user_sessions, refresh_tokens, permissions,
--                     user_roles, staff_profiles, staff_contracts,
--                     staff_assets, leave_requests
--
-- Comms (000004):     documents, email_signatures,
--                     message_channels, channel_members, messages,
--                     message_reads, message_attachments,
--                     notifications, notification_preferences
--
-- Scheduling (000005): calendar_events, event_participants,
--                      event_resources, tasks, task_subtasks
--
-- Audit (000006):     audit_log
--
-- Verify count:
-- SELECT COUNT(*) FROM information_schema.tables
-- WHERE table_schema = 'shared';
-- Expected: 36 tables (some system tables auto-created by PG)
-- ============================================================
