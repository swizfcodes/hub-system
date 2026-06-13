"use strict";

/**
 * Nigerian statutory deductions calculator
 * All rates sourced from current Nigerian law
 */

const RATES = {
  PENSION_EMPLOYEE: 0.08, // 8%  of gross
  PENSION_EMPLOYER: 0.1, // 10% of gross (employer contribution)
  NHF: 0.025, // 2.5% of basic salary only
};

/**
 * Calculate all statutory deductions for a payslip
 * @param {Object} params
 * @param {number} params.basicSalary        - Monthly basic salary
 * @param {number} params.grossSalary        - Monthly gross (basic + allowances + commission)
 * @param {number} params.advanceOutstanding - Unpaid cash advance balance
 * @param {number} params.otherDeductions    - Any custom deductions
 * @param {("full_paye"|"simplified")} params.mode
 *        full_paye  → compute PAYE, pension (employee + employer) and NHF.
 *        simplified → skip ALL statutory deductions (PAYE/pension/NHF = 0).
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
  advanceOutstanding = 0,
  otherDeductions = 0,
  mode = "full_paye",
}) {
  const simplified = mode === "simplified";

  const pensionEmployee = simplified
    ? 0
    : parseFloat((grossSalary * RATES.PENSION_EMPLOYEE).toFixed(2));
  const pensionEmployer = simplified
    ? 0
    : parseFloat((grossSalary * RATES.PENSION_EMPLOYER).toFixed(2));
  const nhf = simplified
    ? 0
    : parseFloat((basicSalary * RATES.NHF).toFixed(2));

  // PAYE is calculated after pension and NHF relief — and skipped
  // entirely in simplified mode.
  let paye = 0;
  if (!simplified) {
    const { calculateMonthlyPAYE } = require("./paye");
    // Relief: pension employee + NHF reduce taxable income
    const taxableGross = Math.max(0, grossSalary - pensionEmployee - nhf);
    paye = calculateMonthlyPAYE(taxableGross);
  }

  const totalDeductions = parseFloat(
    (
      paye +
      pensionEmployee +
      nhf +
      advanceOutstanding +
      otherDeductions
    ).toFixed(2),
  );

  const netSalary = parseFloat((grossSalary - totalDeductions).toFixed(2));

  return {
    pensionEmployee,
    pensionEmployer, // Employer pays this — not deducted from staff
    nhf,
    paye,
    advanceRecovery: parseFloat(advanceOutstanding.toFixed(2)),
    otherDeductions: parseFloat(otherDeductions.toFixed(2)),
    totalDeductions,
    netSalary,
  };
}

module.exports = { calculateDeductions, RATES };
