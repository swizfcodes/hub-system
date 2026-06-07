"use strict";

// ─────────────────────────────────────────────────────────────
// PAYROLL CONFIGURATION
//
// Centralised payroll constants — Nigerian statutory rates and the
// standard allowance ratios used when a business hasn't explicitly
// configured otherwise.
//
// These were previously inline in calculator.service.js. Pulling them
// out makes them:
//   - discoverable in one place
//   - overridable per-business later by reading from business_config
//     (a payroll_config JSONB column can be added with no code changes
//     to the calculator — see resolveConfig below)
//   - testable without re-running the full payroll math
//
// All ratios are expressed as decimals (0.20 = 20%) for consistency
// with the deductions.js RATES object.
// ─────────────────────────────────────────────────────────────

const DEFAULTS = Object.freeze({
  // Standard allowance ratios, applied to basic salary
  // These match the common Nigerian PAYE-friendly compensation pattern.
  HOUSING_ALLOWANCE_RATIO: 0.2, // 20% of basic
  TRANSPORT_ALLOWANCE_RATIO: 0.1, // 10% of basic

  // Working days per month — used to compute daily rate for absence
  // deductions. Nigerian default is 22 (Mon-Fri across ~4.4 weeks).
  // 6-day-week businesses should override to 26.
  WORKING_DAYS_PER_MONTH: 22,

  // Cash advance recovery cap — never deduct more than this fraction
  // of gross from a single payslip. Protects staff from net-zero or
  // negative payslips when they have large outstanding advances.
  ADVANCE_RECOVERY_CAP_RATIO: 0.5, // max 50% of gross per month
});

/**
 * Resolve the effective payroll configuration for a business.
 *
 * Today this returns DEFAULTS unchanged for every business. The hook
 * is here so a future migration can add a payroll_config JSONB column
 * to shared.business_config (or a dedicated shared.payroll_settings
 * table) and have the calculator pick up the override without further
 * code changes — just extend this function to query the override and
 * merge it on top of DEFAULTS.
 *
 * Per-employee overrides (e.g. an expatriate with a different
 * allowance structure) belong on staff_contracts.allowances JSONB.
 * That's a separate hook in calculator.service and isn't this function's
 * job.
 *
 * @param {Object}   _client     pg client (unused today, kept for future DB lookup)
 * @param {string}   _business   business key (unused today)
 * @returns {Object} the same shape as DEFAULTS
 */
async function resolveConfig(_client, _business) {
  // FUTURE: query shared.business_config.payroll_config and merge
  // any provided keys on top of DEFAULTS. Today: defaults only.
  return { ...DEFAULTS };
}

module.exports = { DEFAULTS, resolveConfig };
