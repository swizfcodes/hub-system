-- ============================================================
-- MIGRATION 000003 — Shared people tables
-- contacts, contact_tags, users, user_sessions, refresh_tokens,
-- roles, permissions, user_roles,
-- staff_profiles, staff_contracts, staff_assets, leave_requests
-- ============================================================

-- ── contacts ─────────────────────────────────────────────
-- Master record for every person/org the platform interacts with.
-- One row regardless of how many business lines they engage with.
CREATE TABLE shared.contacts (
  contact_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Array: any combo of 'customer','supplier','staff','retail_partner'
  contact_type          TEXT[]      NOT NULL DEFAULT '{}',
  display_name          TEXT        NOT NULL,
  first_name            TEXT,
  last_name             TEXT,
  company_name          TEXT,
  gender                TEXT        CHECK (gender IN ('M','F','other','prefer_not')),
  date_of_birth         DATE,
  tin                   TEXT        UNIQUE,           -- Nigerian Tax ID
  cac_number            TEXT,
  primary_phone         TEXT        NOT NULL,
  whatsapp_number       TEXT,
  email                 TEXT,
  -- Array of address objects: [{type,line1,area,city,state,landmark,is_default}]
  addresses             JSONB       NOT NULL DEFAULT '[]',
  priority_level        TEXT        NOT NULL DEFAULT 'regular'
                        CHECK (priority_level IN ('vip','regular','new')),
  assigned_to           UUID,                         -- FK added after users table
  visible_to            TEXT[]      NOT NULL DEFAULT ARRAY['jewelry','diffusers'],
  source                TEXT,                         -- 'walk_in','social_media','referral','website','event'
  notes                 TEXT,
  is_deleted            BOOLEAN     NOT NULL DEFAULT false,
  created_by            UUID,                         -- FK added after users table
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON shared.contacts
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE INDEX idx_contacts_phone      ON shared.contacts (primary_phone);
CREATE INDEX idx_contacts_email      ON shared.contacts (email);
CREATE INDEX idx_contacts_type       ON shared.contacts USING GIN (contact_type);
CREATE INDEX idx_contacts_priority   ON shared.contacts (priority_level) WHERE is_deleted = false;
CREATE INDEX idx_contacts_assigned   ON shared.contacts (assigned_to)    WHERE assigned_to IS NOT NULL;

-- ── contact_tags ──────────────────────────────────────────
CREATE TABLE shared.contact_tags (
  tag_id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id) ON DELETE CASCADE,
  tag_name              TEXT        NOT NULL,
  business              TEXT        NOT NULL,
  colour                TEXT        DEFAULT '#64748B',
  created_by            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, tag_name, business)
);

CREATE INDEX idx_contact_tags_contact ON shared.contact_tags (contact_id);

-- ── roles ─────────────────────────────────────────────────
-- Created before users so user_roles can reference both
CREATE TABLE shared.roles (
  role_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name             TEXT        NOT NULL,
  business              TEXT,                         -- NULL = all businesses
  is_system             BOOLEAN     NOT NULL DEFAULT false,
  description           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role_name, business)
);

-- ── users ────────────────────────────────────────────────
CREATE TABLE shared.users (
  user_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_profile_id      UUID,                         -- FK added after staff_profiles
  email                 TEXT        NOT NULL UNIQUE,
  password_hash         TEXT        NOT NULL,          -- bcrypt min cost 12
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  force_password_reset  BOOLEAN     NOT NULL DEFAULT true,
  last_login_at         TIMESTAMPTZ,
  last_login_ip         INET,
  failed_login_attempts SMALLINT    NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  default_business      TEXT        NOT NULL DEFAULT 'jewelry',
  permitted_businesses  TEXT[]      NOT NULL DEFAULT ARRAY['jewelry'],
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON shared.users
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE INDEX idx_users_email ON shared.users (email);

-- ── Now add deferred FKs on contacts ─────────────────────
ALTER TABLE shared.contacts
  ADD CONSTRAINT fk_contacts_assigned_to
    FOREIGN KEY (assigned_to) REFERENCES shared.users (user_id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_contacts_created_by
    FOREIGN KEY (created_by)  REFERENCES shared.users (user_id) ON DELETE SET NULL;

ALTER TABLE shared.contact_tags
  ADD CONSTRAINT fk_contact_tags_created_by
    FOREIGN KEY (created_by) REFERENCES shared.users (user_id) ON DELETE SET NULL;

-- ── user_sessions ─────────────────────────────────────────
CREATE TABLE shared.user_sessions (
  session_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES shared.users (user_id) ON DELETE CASCADE,
  session_token         TEXT        NOT NULL UNIQUE,
  ip_address            INET,
  user_agent            TEXT,
  current_business      TEXT        NOT NULL DEFAULT 'jewelry',
  expires_at            TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_sessions_token   ON shared.user_sessions (session_token);
CREATE INDEX idx_user_sessions_user_id ON shared.user_sessions (user_id);

-- ── refresh_tokens ────────────────────────────────────────
CREATE TABLE shared.refresh_tokens (
  token_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES shared.users (user_id) ON DELETE CASCADE,
  token_hash            TEXT        NOT NULL UNIQUE,   -- SHA-256 of raw token
  expires_at            TIMESTAMPTZ NOT NULL,
  revoked_at            TIMESTAMPTZ,                   -- NULL = active
  issued_ip             INET,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_hash    ON shared.refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_user    ON shared.refresh_tokens (user_id);

-- ── permissions ───────────────────────────────────────────
CREATE TABLE shared.permissions (
  permission_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id               UUID        NOT NULL REFERENCES shared.roles (role_id) ON DELETE CASCADE,
  module                TEXT        NOT NULL,
  -- Modules: crm | sales | pos | invoicing | accounting | stock | purchasing
  --          expenses | payroll | logistics | retail_partners | messaging
  --          campaigns | calendar | tasks | dashboards | documents | staff | settings
  action                TEXT        NOT NULL,
  -- Actions: view | create | edit | delete | approve | export
  record_scope          TEXT        NOT NULL DEFAULT 'all'
                        CHECK (record_scope IN ('all','own','team')),
  hidden_fields         TEXT[]      NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role_id, module, action)
);

CREATE INDEX idx_permissions_role_module ON shared.permissions (role_id, module);

-- ── user_roles ────────────────────────────────────────────
CREATE TABLE shared.user_roles (
  user_id               UUID        NOT NULL REFERENCES shared.users (user_id) ON DELETE CASCADE,
  role_id               UUID        NOT NULL REFERENCES shared.roles (role_id) ON DELETE CASCADE,
  business              TEXT        NOT NULL,   -- '*' for all businesses
  granted_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  granted_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at            TIMESTAMPTZ,            -- NULL = permanent
  PRIMARY KEY (user_id, role_id, business)
);

CREATE INDEX idx_user_roles_user ON shared.user_roles (user_id);

-- ── staff_profiles ────────────────────────────────────────
CREATE TABLE shared.staff_profiles (
  profile_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID        NOT NULL UNIQUE REFERENCES shared.contacts (contact_id),
  employee_number       TEXT        NOT NULL UNIQUE,   -- e.g. HUB-EMP-0001
  business              TEXT        NOT NULL,
  department            TEXT,                          -- 'sales','operations','finance','logistics','management'
  job_title             TEXT        NOT NULL,
  employment_type       TEXT        NOT NULL
                        CHECK (employment_type IN ('full_time','part_time','contract')),
  start_date            DATE        NOT NULL,
  end_date              DATE,                          -- NULL = currently employed
  reports_to            UUID        REFERENCES shared.staff_profiles (profile_id) ON DELETE SET NULL,
  -- Financial details — encrypted at application layer before storage
  bank_name             TEXT,
  bank_account_number   TEXT,        -- AES-256 encrypted
  bank_sort_code        TEXT,
  nin                   TEXT,        -- National ID — encrypted
  bvn                   TEXT,        -- Bank Verification Number — encrypted
  base_salary           NUMERIC(12,2) NOT NULL DEFAULT 0,
  pension_pin           TEXT,
  nhf_number            TEXT,
  tax_id                TEXT,
  is_deleted            BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

CREATE TRIGGER trg_staff_profiles_updated_at
  BEFORE UPDATE ON shared.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE INDEX idx_staff_profiles_business ON shared.staff_profiles (business);
CREATE INDEX idx_staff_profiles_reports  ON shared.staff_profiles (reports_to) WHERE reports_to IS NOT NULL;

-- ── Add deferred FK on users → staff_profiles ────────────
ALTER TABLE shared.users
  ADD CONSTRAINT fk_users_staff_profile
    FOREIGN KEY (staff_profile_id) REFERENCES shared.staff_profiles (profile_id) ON DELETE SET NULL;

-- ── staff_contracts ───────────────────────────────────────
-- Append-only. New row on every contract change. Never edit previous rows.
CREATE TABLE shared.staff_contracts (
  contract_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id) ON DELETE CASCADE,
  contract_type         TEXT        NOT NULL
                        CHECK (contract_type IN ('full_time','part_time','contract','amendment')),
  effective_from        DATE        NOT NULL,
  effective_to          DATE,                         -- NULL = currently active
  gross_salary          NUMERIC(12,2) NOT NULL,
  document_id           UUID,                         -- FK added after documents table in migration 004
  notes                 TEXT,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_contracts_profile ON shared.staff_contracts (profile_id);

-- ── staff_assets ──────────────────────────────────────────
CREATE TABLE shared.staff_assets (
  asset_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id) ON DELETE CASCADE,
  asset_type            TEXT        NOT NULL,          -- 'tablet','laptop','keys','uniform'
  description           TEXT        NOT NULL,
  serial_number         TEXT,
  issued_date           DATE        NOT NULL,
  returned_date         DATE,                          -- NULL = still with staff
  condition_on_issue    TEXT,
  condition_on_return   TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_assets_profile ON shared.staff_assets (profile_id);

-- ── leave_requests ────────────────────────────────────────
CREATE TABLE shared.leave_requests (
  leave_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id) ON DELETE CASCADE,
  leave_type            TEXT        NOT NULL
                        CHECK (leave_type IN ('annual','sick','maternity','paternity','compassionate','unpaid')),
  start_date            DATE        NOT NULL,
  end_date              DATE        NOT NULL,
  days_requested        SMALLINT    NOT NULL CHECK (days_requested > 0),
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  reason                TEXT,
  rejection_reason      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leave_dates_valid CHECK (end_date >= start_date)
);

CREATE TRIGGER trg_leave_requests_updated_at
  BEFORE UPDATE ON shared.leave_requests
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE INDEX idx_leave_requests_profile ON shared.leave_requests (profile_id);
CREATE INDEX idx_leave_requests_status  ON shared.leave_requests (status, start_date);

-- ============================================================
-- Verify
-- SELECT COUNT(*) FROM information_schema.tables
-- WHERE table_schema = 'shared';
-- After migrations 002 + 003: expected ~21 tables
-- ============================================================
