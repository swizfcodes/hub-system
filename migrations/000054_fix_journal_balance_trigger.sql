-- MIGRATION 000054 — Fix journal balance triggers
--
-- PROBLEM:
--   trg_jewelry_journal_balance and trg_diffusers_journal_balance fire
--   AFTER INSERT FOR EACH ROW. When postEntry inserts the debit line first,
--   the trigger immediately queries the running total, sees DR≠CR (the credit
--   line hasn't been inserted yet), and raises an exception. The credit line
--   never lands, making every GRN / payroll / invoice receipt fail.
--
-- FIX:
--   Recreate both triggers as CONSTRAINT TRIGGERs with
--   DEFERRABLE INITIALLY DEFERRED. This defers the balance check to
--   commit-time, when all lines for the entry are present.
--
-- Also fix shared.fn_check_journal_balance which mistakenly referenced
-- jewelry.journal_lines instead of its own schema.

-- ── jewelry ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_jewelry_journal_balance ON jewelry.journal_lines;

CREATE CONSTRAINT TRIGGER trg_jewelry_journal_balance
  AFTER INSERT OR UPDATE ON jewelry.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION jewelry.fn_check_journal_balance();

-- ── diffusers ──────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_diffusers_journal_balance ON diffusers.journal_lines;

CREATE CONSTRAINT TRIGGER trg_diffusers_journal_balance
  AFTER INSERT OR UPDATE ON diffusers.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION diffusers.fn_check_journal_balance();

-- ── shared — fix wrong table reference in the balance function ─────────────
-- The shared function queried jewelry.journal_lines instead of
-- shared.journal_lines. Corrected here; no trigger is attached to it yet.

CREATE OR REPLACE FUNCTION shared.fn_check_journal_balance()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_total_debit  NUMERIC(15,2);
  v_total_credit NUMERIC(15,2);
BEGIN
  SELECT
    COALESCE(SUM(debit),  0),
    COALESCE(SUM(credit), 0)
  INTO v_total_debit, v_total_credit
  FROM shared.journal_lines
  WHERE entry_id = NEW.entry_id;

  IF v_total_debit != v_total_credit THEN
    RAISE EXCEPTION
      'Journal entry % is unbalanced: DR=% CR=%. Fix before commit.',
      NEW.entry_id, v_total_debit, v_total_credit;
  END IF;

  RETURN NEW;
END;
$$;
