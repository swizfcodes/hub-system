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
 * @returns {Object} Full deduction breakdown
 */
function calculateDeductions({
  basicSalary,
  grossSalary,
  advanceOutstanding = 0,
  otherDeductions = 0,
}) {
  const pensionEmployee = parseFloat(
    (grossSalary * RATES.PENSION_EMPLOYEE).toFixed(2),
  );
  const pensionEmployer = parseFloat(
    (grossSalary * RATES.PENSION_EMPLOYER).toFixed(2),
  );
  const nhf = parseFloat((basicSalary * RATES.NHF).toFixed(2));

  // PAYE is calculated after pension and NHF relief
  const { calculateMonthlyPAYE } = require("./paye");
  // Relief: pension employee + NHF reduce taxable income
  const taxableGross = Math.max(0, grossSalary - pensionEmployee - nhf);
  const paye = calculateMonthlyPAYE(taxableGross);

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
