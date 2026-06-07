-- ============================================================
-- MIGRATION 000050 — Defer the journal balance check
--
-- Problem: trg_<schema>_journal_balance was created as a plain
-- AFTER INSERT OR UPDATE ... FOR EACH ROW trigger. journal.service
-- .postEntry inserts journal_lines ONE ROW AT A TIME, so the trigger
-- fired after the very first line — when only the debit (or only the
-- credit) side exists — and raised "unbalanced", rejecting every
-- multi-line entry. The original comment ("fires after the last line")
-- did not match the row-level, non-deferred firing semantics.
--
-- Fix: recreate the balance check as a CONSTRAINT TRIGGER that is
-- DEFERRABLE INITIALLY DEFERRED. It now evaluates at COMMIT, by which
-- point all of an entry's lines are present, so SUM(debit)=SUM(credit)
-- is checked once per entry against the complete set of lines.
--
-- The trigger FUNCTIONS (jewelry/diffusers.fn_check_journal_balance)
-- are unchanged — only the trigger timing changes.
--
-- Apply to BOTH business schemas: jewelry and diffusers.
-- ============================================================

-- ── JEWELRY ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_jewelry_journal_balance ON jewelry.journal_lines;

CREATE CONSTRAINT TRIGGER trg_jewelry_journal_balance
  AFTER INSERT OR UPDATE ON jewelry.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION jewelry.fn_check_journal_balance();

-- ── DIFFUSERS ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_diffusers_journal_balance ON diffusers.journal_lines;

CREATE CONSTRAINT TRIGGER trg_diffusers_journal_balance
  AFTER INSERT OR UPDATE ON diffusers.journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION diffusers.fn_check_journal_balance();
