"use strict";

// ─────────────────────────────────────────────────────────────
// Nigerian PAYE — Nigeria Tax Act 2025 (effective 1 January 2026)
//
// Replaces the legacy Consolidated Relief Allowance (CRA) regime that
// applied through 2025. The CRA and the 1% minimum tax are abolished.
// Instead, the first ₦800,000 of annual *taxable* income is tax-free
// and progressive bands apply above it.
//
// "Taxable income" (T) here is ANNUAL ADJUSTED INCOME — gross emolument
// less the allowable statutory deductions (pension, NHF, NHIS and the
// new rent relief). The caller (deductions.js) computes those reliefs;
// this module only turns an annual taxable figure into tax owed.
//
// Bands (annual taxable income), per the 2025 Act:
//   0 –        800,000   @  0%
//   800,000 –  3,000,000 @ 15%
//   3,000,000 – 12,000,000 @ 18%
//   12,000,000 – 25,000,000 @ 21%
//   25,000,000 – 50,000,000 @ 23%
//   above      50,000,000   @ 25%
//
// Cumulative tax at each band cap (used by the tests as fixtures):
//   3m → 330,000 · 12m → 1,950,000 · 25m → 4,680,000 · 50m → 10,430,000
// ─────────────────────────────────────────────────────────────

const BANDS = [
  { width: 800_000, rate: 0.0 }, // first 800k tax-free
  { width: 2_200_000, rate: 0.15 }, // 800k → 3m
  { width: 9_000_000, rate: 0.18 }, // 3m → 12m
  { width: 13_000_000, rate: 0.21 }, // 12m → 25m
  { width: 25_000_000, rate: 0.23 }, // 25m → 50m
  { width: Infinity, rate: 0.25 }, // above 50m
];

/**
 * Annual PAYE on an annual *adjusted* (taxable) income.
 * @param {number} annualTaxableIncome  Gross less allowable deductions.
 * @returns {number} Annual PAYE (NGN), rounded to kobo.
 */
function calculateAnnualPAYE(annualTaxableIncome) {
  let tax = 0;
  let remaining = Math.max(0, annualTaxableIncome);

  for (const band of BANDS) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, band.width);
    tax += slice * band.rate;
    remaining -= slice;
  }

  return parseFloat(tax.toFixed(2));
}

/**
 * Marginal ("baseline method") tax on a one-off amount — a bonus or a
 * commission spike — stacked on top of the employee's regular adjusted
 * income. This is the correct way to tax irregular pay: the windfall is
 * taxed at the employee's marginal rate for the period it is paid,
 * rather than being annualised (× 12) as if it recurred every month.
 *
 *   tax(base + extra) − tax(base)
 *
 * @param {number} extraTaxable        The one-off amount, net of its own
 *                                     allowable relief (e.g. pension on it).
 * @param {number} baseAdjustedIncome  Annual adjusted income from regular pay.
 * @returns {number} Tax attributable to the one-off amount (NGN).
 */
function marginalTaxOn(extraTaxable, baseAdjustedIncome) {
  if (extraTaxable <= 0) return 0;
  const withExtra = calculateAnnualPAYE(baseAdjustedIncome + extraTaxable);
  const baseline = calculateAnnualPAYE(baseAdjustedIncome);
  return parseFloat((withExtra - baseline).toFixed(2));
}

module.exports = { calculateAnnualPAYE, marginalTaxOn, BANDS };
