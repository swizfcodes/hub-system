"use strict";

/**
 * Nigerian statutory deductions calculator.
 *
 * Statutory contribution rates are sourced from the Pension Reform Act
 * 2014 and the National Housing Fund / NHIS Acts. PAYE itself follows
 * the Nigeria Tax Act 2025 (see paye.js) — the legacy CRA regime is gone.
 */

const RATES = {
  PENSION_EMPLOYEE: 0.08, // 8%  of pensionable earnings
  PENSION_EMPLOYER: 0.1, // 10% of pensionable earnings (employer-borne)
  NHF: 0.025, // 2.5% of basic salary only
  NHIS_EMPLOYEE: 0.05, // 5% of basic — only when the employee is enrolled
};

// Rent relief (Nigeria Tax Act 2025): 20% of documented annual rent,
// capped at ₦500,000 of relief. Replaces part of the abolished CRA.
const RENT_RELIEF_RATE = 0.2;
const RENT_RELIEF_CAP = 500_000;

/**
 * Calculate all statutory deductions for a payslip.
 *
 * @param {Object} params
 * @param {number} params.basicSalary        - Monthly basic salary
 * @param {number} params.grossSalary        - Monthly gross (basic + allowances + commission)
 * @param {number} params.commissionAmount   - One-off commission included in grossSalary
 *        this period. Taxed at the marginal rate for the month rather than
 *        annualised, so a single windfall is not over-taxed (× 12).
 * @param {number} params.advanceOutstanding - Unpaid cash advance balance
 * @param {number} params.otherDeductions    - Any custom deductions (e.g. unpaid leave)
 * @param {number} params.annualRent         - Documented annual rent paid, for rent
 *        relief. Defaults to 0 (no relief) until the figure is captured per employee.
 * @param {boolean} params.nhisEnrolled      - Whether the employee contributes to NHIS.
 * @param {("full_paye"|"simplified")} params.mode
 *        full_paye  → compute PAYE, pension (employee + employer), NHF (+ NHIS).
 *        simplified → skip ALL statutory deductions (PAYE/pension/NHF/NHIS = 0).
 *                     Non-statutory amounts the business is still owed —
 *                     outstanding cash advances and unpaid-leave absence
 *                     (otherDeductions) — are still recovered, because
 *                     those are money owed/not-earned, not tax. This is
 *                     why a simplified payslip is "no statutory deductions"
 *                     rather than literally "net == gross" for everyone.
 * @returns {Object} Full deduction breakdown
 */
function calculateDeductions({
  basicSalary,
  grossSalary,
  commissionAmount = 0,
  advanceOutstanding = 0,
  otherDeductions = 0,
  annualRent = 0,
  nhisEnrolled = false,
  mode = "full_paye",
}) {
  const simplified = mode === "simplified";

  // ── Statutory contributions actually withheld ──────────────────────
  const pensionEmployee = simplified
    ? 0
    : parseFloat((grossSalary * RATES.PENSION_EMPLOYEE).toFixed(2));
  const pensionEmployer = simplified
    ? 0
    : parseFloat((grossSalary * RATES.PENSION_EMPLOYER).toFixed(2));
  const nhf = simplified
    ? 0
    : parseFloat((basicSalary * RATES.NHF).toFixed(2));
  const nhis =
    simplified || !nhisEnrolled
      ? 0
      : parseFloat((basicSalary * RATES.NHIS_EMPLOYEE).toFixed(2));

  // ── PAYE — Nigeria Tax Act 2025 ─────────────────────────────────────
  // Compute on an ANNUAL adjusted-income basis, treating the recurring
  // salary and any one-off commission separately so the commission is
  // taxed marginally (the "baseline method") instead of being annualised.
  let paye = 0;
  if (!simplified) {
    const { calculateAnnualPAYE, marginalTaxOn } = require("./paye");

    // Recurring (every-month) gross excludes this period's commission.
    const regularGross = Math.max(0, grossSalary - commissionAmount);

    // Allowable deductions reduce taxable income. Pension relief tracks
    // the recurring portion; NHF/NHIS are on basic (already recurring).
    // Rent relief is annual and capped.
    const recurringPension = parseFloat(
      (regularGross * RATES.PENSION_EMPLOYEE).toFixed(2),
    );
    const rentRelief = Math.min(annualRent * RENT_RELIEF_RATE, RENT_RELIEF_CAP);
    const annualRegularReliefs =
      (recurringPension + nhf + nhis) * 12 + rentRelief;

    const annualRegularGross = regularGross * 12;
    const adjustedRegular = Math.max(
      0,
      annualRegularGross - annualRegularReliefs,
    );
    const annualRegularPAYE = calculateAnnualPAYE(adjustedRegular);

    // Commission carries its own pension relief; the rest is taxed at the
    // marginal rate on top of the regular adjusted income.
    let payeOnCommission = 0;
    if (commissionAmount > 0) {
      const commissionPension = parseFloat(
        (commissionAmount * RATES.PENSION_EMPLOYEE).toFixed(2),
      );
      const commissionTaxable = Math.max(0, commissionAmount - commissionPension);
      payeOnCommission = marginalTaxOn(commissionTaxable, adjustedRegular);
    }

    paye = parseFloat((annualRegularPAYE / 12 + payeOnCommission).toFixed(2));
  }

  const totalDeductions = parseFloat(
    (
      paye +
      pensionEmployee +
      nhf +
      nhis +
      advanceOutstanding +
      otherDeductions
    ).toFixed(2),
  );

  const netSalary = parseFloat((grossSalary - totalDeductions).toFixed(2));

  return {
    pensionEmployee,
    pensionEmployer, // Employer pays this — not deducted from staff
    nhf,
    nhis,
    paye,
    advanceRecovery: parseFloat(advanceOutstanding.toFixed(2)),
    otherDeductions: parseFloat(otherDeductions.toFixed(2)),
    totalDeductions,
    netSalary,
  };
}

module.exports = {
  calculateDeductions,
  RATES,
  RENT_RELIEF_RATE,
  RENT_RELIEF_CAP,
};
