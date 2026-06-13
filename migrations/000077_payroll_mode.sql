-- ============================================================
-- 000077 — Payroll run mode (full PAYE vs simplified)
--
-- The Payroll UI has always offered a "Simplified Salary" mode
-- ("gross to net — no statutory deductions") alongside "Full PAYE",
-- but the choice never left the browser: initiateRun only sent
-- period_month/period_year, so EVERY run computed PAYE, pension and
-- NHF regardless of the toggle. Simplified mode therefore never
-- actually worked.
--
-- This column makes the mode a first-class, persisted property of a
-- run. The calculator reads it to decide whether to apply statutory
-- deductions, and the UI reads it back so each historical run shows
-- its own mode instead of whatever the global toggle happens to be.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) and backfills existing runs
-- to 'full_paye', which is exactly how they were computed.
-- ============================================================

ALTER TABLE jewelry.payroll_runs
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'full_paye'
    CHECK (mode IN ('full_paye', 'simplified'));

ALTER TABLE diffusers.payroll_runs
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'full_paye'
    CHECK (mode IN ('full_paye', 'simplified'));
