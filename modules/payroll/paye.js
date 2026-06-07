"use strict";

// Nigerian PAYE Tax Calculation — 2024 Rates
// Consolidated Relief Allowance (CRA): higher of ₦200,000 or 1% of gross
// + 20% of gross income
// Then progressive bands applied on taxable income

const BANDS = [
  { limit: 300_000, rate: 0.07 },
  { limit: 300_000, rate: 0.11 },
  { limit: 500_000, rate: 0.15 },
  { limit: 500_000, rate: 0.19 },
  { limit: 1_600_000, rate: 0.21 },
  { limit: Infinity, rate: 0.24 },
];

/**
 * Calculate annual PAYE tax for a given annual gross income (NGN)
 * Returns: { taxableIncome, annualPAYE, monthlyPAYE }
 */
function calculateAnnualPAYE(annualGross) {
  // CRA = higher of ₦200,000 or 1% of gross
  const craFixed = 200_000;
  const craPercent = annualGross * 0.01;
  const craBase = Math.max(craFixed, craPercent);
  const craAdditional = annualGross * 0.2;
  const totalCRA = craBase + craAdditional;

  const taxableIncome = Math.max(0, annualGross - totalCRA);

  let tax = 0;
  let remaining = taxableIncome;

  for (const band of BANDS) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, band.limit);
    tax += taxable * band.rate;
    remaining -= taxable;
  }

  return {
    annualGross,
    totalCRA: parseFloat(totalCRA.toFixed(2)),
    taxableIncome: parseFloat(taxableIncome.toFixed(2)),
    annualPAYE: parseFloat(tax.toFixed(2)),
    monthlyPAYE: parseFloat((tax / 12).toFixed(2)),
  };
}

/**
 * Calculate monthly PAYE from monthly gross
 */
function calculateMonthlyPAYE(monthlyGross) {
  const annualGross = monthlyGross * 12;
  const result = calculateAnnualPAYE(annualGross);
  return result.monthlyPAYE;
}

module.exports = { calculateAnnualPAYE, calculateMonthlyPAYE };
