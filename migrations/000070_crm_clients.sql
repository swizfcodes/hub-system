-- ============================================================
-- MIGRATION 000070 — CRM client workspace settings
--
-- The CRM is being reoriented from a B2B pipeline tool to a
-- clients-first relationship workspace. Customer segments (new /
-- active / lapsed / big spender) are computed on the fly from
-- invoice history; this table holds the per-business thresholds
-- that drive those computations so each brand can tune them from
-- the UI without code changes.
--
-- Singleton row per business schema (id always true).
-- ============================================================

CREATE TABLE jewelry.crm_settings (
  id                     BOOLEAN     PRIMARY KEY DEFAULT true CHECK (id),
  lapsed_days            INTEGER     NOT NULL DEFAULT 90,   -- no purchase in N days → lapsed
  new_customer_days      INTEGER     NOT NULL DEFAULT 30,   -- joined/first bought within N days → new
  big_spender_threshold  NUMERIC(14,2) NOT NULL DEFAULT 1000000, -- lifetime spend ≥ this → big spender
  birthday_window_days   INTEGER     NOT NULL DEFAULT 7,    -- birthdays within N days surface in Today
  stale_deal_days        INTEGER     NOT NULL DEFAULT 14,   -- open B2B deal silent for N days → follow up
  updated_by             UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO jewelry.crm_settings (id) VALUES (true);

CREATE TABLE diffusers.crm_settings (
  id                     BOOLEAN     PRIMARY KEY DEFAULT true CHECK (id),
  lapsed_days            INTEGER     NOT NULL DEFAULT 90,
  new_customer_days      INTEGER     NOT NULL DEFAULT 30,
  big_spender_threshold  NUMERIC(14,2) NOT NULL DEFAULT 500000,
  birthday_window_days   INTEGER     NOT NULL DEFAULT 7,
  stale_deal_days        INTEGER     NOT NULL DEFAULT 14,
  updated_by             UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO diffusers.crm_settings (id) VALUES (true);

-- Next occurrence of a month/day anniversary (birthday, wedding…),
-- clamped to month length so Feb-29 birthdays resolve to Feb-28 in
-- non-leap years. NULL-safe for contacts without birthday data.
CREATE OR REPLACE FUNCTION shared.fn_next_birthday(m INT, d INT)
RETURNS DATE LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN m IS NULL OR d IS NULL OR m < 1 OR m > 12 OR d < 1 OR d > 31 THEN NULL
    ELSE (
      SELECT MIN(bd) FROM (
        SELECT make_date(
                 EXTRACT(YEAR FROM CURRENT_DATE)::int + s,
                 m,
                 LEAST(d, EXTRACT(DAY FROM (
                   make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int + s, m, 1)
                   + interval '1 month - 1 day'))::int)
               ) AS bd
        FROM generate_series(0, 1) s
      ) t
      WHERE bd >= CURRENT_DATE
    )
  END
$$;

-- Spend aggregation filters on paid invoices per contact — partial
-- indexes keep the client-list query fast as invoice volume grows.
CREATE INDEX IF NOT EXISTS idx_jewelry_invoices_contact_paid
  ON jewelry.invoices (contact_id, issue_date DESC)
  WHERE is_deleted = false AND amount_paid > 0;
CREATE INDEX IF NOT EXISTS idx_diffusers_invoices_contact_paid
  ON diffusers.invoices (contact_id, issue_date DESC)
  WHERE is_deleted = false AND amount_paid > 0;

-- Contact-level notes (deal_id IS NULL) power the client profile.
CREATE INDEX IF NOT EXISTS idx_jewelry_crm_notes_contact
  ON jewelry.crm_notes (contact_id, created_at DESC) WHERE deal_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_diffusers_crm_notes_contact
  ON diffusers.crm_notes (contact_id, created_at DESC) WHERE deal_id IS NULL;
