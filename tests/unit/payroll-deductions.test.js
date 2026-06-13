"use strict";

/**
 * Payroll deductions & PAYE engine — pure-function unit tests.
 *
 * Pins the behaviours the UI promises and the Nigeria Tax Act 2025
 * (effective 1 Jan 2026) tax math:
 *   • Full PAYE mode applies PAYE + pension + NHF.
 *   • Simplified mode skips ALL statutory deductions but still recovers
 *     non-statutory amounts (advances, unpaid-leave absence).
 *   • PAYE uses the 2025 bands (no CRA, first ₦800k tax-free) and taxes
 *     one-off commission marginally rather than annualising it.
 */

const {
  calculateDeductions,
  RATES,
} = require("../../modules/payroll/deductions");
const { calculateAnnualPAYE, marginalTaxOn } = require("../../modules/payroll/paye");

describe("calculateAnnualPAYE — Nigeria Tax Act 2025 bands", () => {
  it("is zero up to the ₦800k tax-free threshold", () => {
    expect(calculateAnnualPAYE(0)).toBe(0);
    expect(calculateAnnualPAYE(800_000)).toBe(0);
  });

  it("taxes the 15% band above 800k", () => {
    // 1,000,000 → (1,000,000 − 800,000) × 15% = 30,000
    expect(calculateAnnualPAYE(1_000_000)).toBeCloseTo(30_000, 2);
  });

  it("matches the cumulative tax at each band cap", () => {
    expect(calculateAnnualPAYE(3_000_000)).toBeCloseTo(330_000, 2);
    expect(calculateAnnualPAYE(12_000_000)).toBeCloseTo(1_950_000, 2);
    expect(calculateAnnualPAYE(25_000_000)).toBeCloseTo(4_680_000, 2);
    expect(calculateAnnualPAYE(50_000_000)).toBeCloseTo(10_430_000, 2);
  });

  it("applies the top 25% band above ₦50m", () => {
    // 60,000,000 → 10,430,000 + (60m − 50m) × 25% = 12,930,000
    expect(calculateAnnualPAYE(60_000_000)).toBeCloseTo(12_930_000, 2);
  });
});

describe("marginalTaxOn — baseline method for one-off pay", () => {
  it("returns zero for a non-positive extra", () => {
    expect(marginalTaxOn(0, 5_000_000)).toBe(0);
  });

  it("taxes a bonus at the marginal rate of the band it lands in", () => {
    // Base adjusted income 5m sits in the 18% band (3m–12m).
    // A 1m bonus stays within that band → 1m × 18% = 180,000.
    expect(marginalTaxOn(1_000_000, 5_000_000)).toBeCloseTo(180_000, 2);
  });

  it("is far less than annualising the windfall (× 12) would be", () => {
    const base = 5_000_000;
    const bonus = 1_000_000;
    const marginal = marginalTaxOn(bonus, base);
    const naiveAnnualised =
      calculateAnnualPAYE(base + bonus * 12) - calculateAnnualPAYE(base);
    expect(marginal).toBeLessThan(naiveAnnualised);
  });
});

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

  it("computes PAYE on annual adjusted income (no CRA)", () => {
    const d = calculateDeductions({ basicSalary, grossSalary });
    // regular gross 520k → annual 6.24m; reliefs: pension 8%×520k×12 +
    // nhf 2.5%×400k×12 = 499,200 + 120,000 = 619,200 → adjusted 5,620,800.
    // PAYE: 0 (first 800k) + 2.2m×15% + (5,620,800−3m)×18%
    //     = 330,000 + 471,744 = 801,744 / 12 = 66,812.
    expect(d.paye).toBeCloseTo(66_812, 0);
  });

  it("net = gross − (paye + pension + nhf + advances + other)", () => {
    const d = calculateDeductions({
      basicSalary,
      grossSalary,
      advanceOutstanding: 10_000,
      otherDeductions: 5_000,
    });
    const expectedTotal = d.paye + d.pensionEmployee + d.nhf + 10_000 + 5_000;
    expect(d.totalDeductions).toBeCloseTo(expectedTotal, 2);
    expect(d.netSalary).toBeCloseTo(grossSalary - expectedTotal, 2);
  });

  it("taxes commission marginally, not annualised", () => {
    const base = { basicSalary, grossSalary: 520_000 };
    const withComm = calculateDeductions({
      basicSalary,
      grossSalary: 520_000 + 200_000,
      commissionAmount: 200_000,
    });
    const noComm = calculateDeductions(base);
    const extraPaye = withComm.paye - noComm.paye;
    // Commission PAYE ≈ marginal on (200k − 8% pension) at 18% band.
    expect(extraPaye).toBeGreaterThan(0);
    expect(extraPaye).toBeLessThan(200_000 * 0.18); // below naive top-line
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
    expect(d.nhis).toBe(0);
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

describe("calculateDeductions — rent relief & NHIS", () => {
  const basicSalary = 400_000;
  const grossSalary = 520_000;

  it("rent relief lowers PAYE and is capped at ₦500k of relief", () => {
    const noRent = calculateDeductions({ basicSalary, grossSalary });
    const withRent = calculateDeductions({
      basicSalary,
      grossSalary,
      annualRent: 3_000_000, // 20% = 600k, capped to 500k relief
    });
    expect(withRent.paye).toBeLessThan(noRent.paye);
    // Capped: relief is 500k. Adjusted income (~5.62m) sits in the 18%
    // band, so PAYE drops by 500k × 18% = 90,000/yr = 7,500/month.
    expect(noRent.paye - withRent.paye).toBeCloseTo(7_500, 0);
  });

  it("NHIS is withheld only when the employee is enrolled", () => {
    const off = calculateDeductions({ basicSalary, grossSalary });
    const on = calculateDeductions({ basicSalary, grossSalary, nhisEnrolled: true });
    expect(off.nhis).toBe(0);
    expect(on.nhis).toBeCloseTo(basicSalary * RATES.NHIS_EMPLOYEE, 2);
  });
});
