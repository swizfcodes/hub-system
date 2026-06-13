"use strict";

/**
 * Payroll deductions & PAYE engine — pure-function unit tests.
 *
 * These exercise the real calculators (modules/payroll/deductions.js and
 * paye.js), not fixtures, so they pin the two behaviours the UI promises:
 *   • Full PAYE mode applies PAYE + pension + NHF.
 *   • Simplified mode skips ALL statutory deductions but still recovers
 *     non-statutory amounts (advances, unpaid-leave absence).
 */

const { calculateDeductions, RATES } = require("../../modules/payroll/deductions");
const { calculateAnnualPAYE } = require("../../modules/payroll/paye");

describe("calculateDeductions — full PAYE mode", () => {
  const basicSalary = 400_000;
  const grossSalary = 520_000; // basic + 20% housing + 10% transport

  it("applies pension (8%), NHF (2.5% of basic) and PAYE", () => {
    const d = calculateDeductions({ basicSalary, grossSalary });
    expect(d.pensionEmployee).toBeCloseTo(grossSalary * RATES.PENSION_EMPLOYEE, 2);
    expect(d.pensionEmployer).toBeCloseTo(grossSalary * RATES.PENSION_EMPLOYER, 2);
    expect(d.nhf).toBeCloseTo(basicSalary * RATES.NHF, 2);
    expect(d.paye).toBeGreaterThan(0);
  });

  it("net = gross − (paye + pension + nhf + advances + other)", () => {
    const d = calculateDeductions({
      basicSalary,
      grossSalary,
      advanceOutstanding: 10_000,
      otherDeductions: 5_000,
    });
    const expectedTotal =
      d.paye + d.pensionEmployee + d.nhf + 10_000 + 5_000;
    expect(d.totalDeductions).toBeCloseTo(expectedTotal, 2);
    expect(d.netSalary).toBeCloseTo(grossSalary - expectedTotal, 2);
  });
});

describe("calculateDeductions — simplified mode", () => {
  const basicSalary = 400_000;
  const grossSalary = 520_000;

  it("zeroes every statutory deduction", () => {
    const d = calculateDeductions({ basicSalary, grossSalary, mode: "simplified" });
    expect(d.paye).toBe(0);
    expect(d.pensionEmployee).toBe(0);
    expect(d.pensionEmployer).toBe(0);
    expect(d.nhf).toBe(0);
  });

  it("net == gross when there are no advances or absences", () => {
    const d = calculateDeductions({ basicSalary, grossSalary, mode: "simplified" });
    expect(d.totalDeductions).toBe(0);
    expect(d.netSalary).toBeCloseTo(grossSalary, 2);
  });

  it("still recovers advances and unpaid-leave absence (non-statutory)", () => {
    const d = calculateDeductions({
      basicSalary,
      grossSalary,
      advanceOutstanding: 30_000,
      otherDeductions: 18_000,
      mode: "simplified",
    });
    expect(d.totalDeductions).toBeCloseTo(48_000, 2);
    expect(d.netSalary).toBeCloseTo(grossSalary - 48_000, 2);
  });
});

describe("calculateAnnualPAYE — band & relief structure", () => {
  it("is zero when CRA wipes out taxable income (low earner)", () => {
    // ₦1.2m/yr: CRA = max(200k, 12k) + 240k = 440k → taxable 760k still > 0,
    // so use a smaller figure where CRA fully covers income.
    const r = calculateAnnualPAYE(240_000);
    expect(r.annualPAYE).toBe(0);
  });

  it("applies the 7% first band correctly above CRA", () => {
    // annualGross 1,000,000 → CRA = max(200k,10k)+200k = 400k → taxable 600k.
    // 600k taxed: first 300k @7% = 21,000; next 300k @11% = 33,000 → 54,000.
    const r = calculateAnnualPAYE(1_000_000);
    expect(r.taxableIncome).toBeCloseTo(600_000, 2);
    expect(r.annualPAYE).toBeCloseTo(54_000, 2);
  });

  it("reaches the top 24% band only above ₦3.2m taxable", () => {
    const r = calculateAnnualPAYE(20_000_000);
    // taxable = 20m − (200k? no: max(200k,200k)=200k + 4m) = 20m − 4.2m = 15.8m
    expect(r.taxableIncome).toBeCloseTo(15_800_000, 2);
    // Bands: 300k@7 + 300k@11 + 500k@15 + 500k@19 + 1.6m@21 + remainder@24
    const expected =
      300_000 * 0.07 +
      300_000 * 0.11 +
      500_000 * 0.15 +
      500_000 * 0.19 +
      1_600_000 * 0.21 +
      (15_800_000 - 3_200_000) * 0.24;
    expect(r.annualPAYE).toBeCloseTo(expected, 2);
  });
});
