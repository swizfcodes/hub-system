import type { BadgeProps } from "@components/ui/Badge";
import type { PayrollRunStatus } from "@typedefs/payroll";

// ── Status badges ─────────────────────────────────────────────────────────────

export const PAYROLL_STATUS_META: Record<
  PayrollRunStatus,
  { label: string; tone: BadgeProps["tone"]; dot?: boolean }
> = {
  draft: { label: "Draft", tone: "warn", dot: true },
  approved: { label: "Approved", tone: "info", dot: false },
  paid: { label: "Paid", tone: "sage", dot: false },
};

// ── Month names ───────────────────────────────────────────────────────────────

export const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatPeriod(month: number, year: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

// ── Compliance output definitions ─────────────────────────────────────────────

export const COMPLIANCE_OUTPUTS = [
  {
    key: "paye-schedule",
    label: "FIRS PAYE Schedule",
    desc: "Monthly PAYE remittance schedule for FIRS",
    authority: "FIRS",
    deadline: "10th of following month",
    color: "#C9A86C",
  },
  {
    key: "pencom",
    label: "PENCOM Remittance",
    desc: "Pension contribution file per PFA (employee + employer)",
    authority: "PENCOM",
    deadline: "7th of following month",
    color: "#4E9AF1",
  },
  {
    key: "nhf",
    label: "NHF Schedule",
    desc: "National Housing Fund deduction schedule",
    authority: "FMBN",
    deadline: "10th of following month",
    color: "#2D6A4F",
  },
  {
    key: "payment-schedule",
    label: "Payment Schedule",
    desc: "Bulk bank transfer list — name, account, net salary",
    authority: null,
    deadline: null,
    color: "#9E9891",
  },
] as const;

// ── Nigerian PAYE client-side preview ─────────────────────────────────────────
// Mirrors modules/payroll/paye.js and deductions.js exactly — Nigeria Tax
// Act 2025 (effective 1 Jan 2026). No CRA: the first ₦800k of annual
// adjusted income is tax-free. Used in the payslip preview before a run.

const PAYE_BANDS = [
  { width: 800_000, rate: 0.0 }, // first 800k tax-free
  { width: 2_200_000, rate: 0.15 }, // 800k → 3m
  { width: 9_000_000, rate: 0.18 }, // 3m → 12m
  { width: 13_000_000, rate: 0.21 }, // 12m → 25m
  { width: 25_000_000, rate: 0.23 }, // 25m → 50m
  { width: Infinity, rate: 0.25 }, // above 50m
];

const RENT_RELIEF_RATE = 0.2;
const RENT_RELIEF_CAP = 500_000;

// Annual PAYE on an annual adjusted (taxable) income.
function calcAnnualPAYE(annualTaxableIncome: number): number {
  let tax = 0;
  let rem = Math.max(0, annualTaxableIncome);
  for (const band of PAYE_BANDS) {
    if (rem <= 0) break;
    const slice = Math.min(rem, band.width);
    tax += slice * band.rate;
    rem -= slice;
  }
  return tax;
}

export function previewPayslip(params: {
  basicSalary: number;
  housingRatio?: number; // default 0.20
  transportRatio?: number; // default 0.10
  commissionAmount?: number;
  annualRent?: number; // documented annual rent for rent relief
}) {
  const {
    basicSalary,
    housingRatio = 0.2,
    transportRatio = 0.1,
    commissionAmount = 0,
    annualRent = 0,
  } = params;

  const housingAllowance = +(basicSalary * housingRatio).toFixed(2);
  const transportAllowance = +(basicSalary * transportRatio).toFixed(2);
  const grossSalary = +(
    basicSalary +
    housingAllowance +
    transportAllowance +
    commissionAmount
  ).toFixed(2);

  const pensionEmployee = +(grossSalary * 0.08).toFixed(2);
  const nhf = +(basicSalary * 0.025).toFixed(2);

  // Adjusted annual income from recurring pay, less allowable reliefs.
  const regularGross = Math.max(0, grossSalary - commissionAmount);
  const recurringPension = +(regularGross * 0.08).toFixed(2);
  const rentRelief = Math.min(annualRent * RENT_RELIEF_RATE, RENT_RELIEF_CAP);
  const annualRegularReliefs = (recurringPension + nhf) * 12 + rentRelief;
  const adjustedRegular = Math.max(0, regularGross * 12 - annualRegularReliefs);
  const annualRegularPAYE = calcAnnualPAYE(adjustedRegular);

  // Commission taxed marginally (baseline method), not annualised.
  let payeOnCommission = 0;
  if (commissionAmount > 0) {
    const commissionPension = +(commissionAmount * 0.08).toFixed(2);
    const commissionTaxable = Math.max(0, commissionAmount - commissionPension);
    payeOnCommission =
      calcAnnualPAYE(adjustedRegular + commissionTaxable) - annualRegularPAYE;
  }

  const monthlyPAYE = +(annualRegularPAYE / 12 + payeOnCommission).toFixed(2);

  const totalDeductions = +(monthlyPAYE + pensionEmployee + nhf).toFixed(2);
  const netSalary = +(grossSalary - totalDeductions).toFixed(2);

  return {
    basicSalary,
    housingAllowance,
    transportAllowance,
    grossSalary,
    rentRelief: +rentRelief.toFixed(2),
    taxableIncome: +(adjustedRegular / 12).toFixed(2),
    monthlyPAYE,
    pensionEmployee,
    nhf,
    totalDeductions,
    netSalary,
  };
}
