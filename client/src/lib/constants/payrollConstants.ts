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
// Mirrors paye.js and deductions.js logic exactly.
// Used in the payslip preview before the run is initiated.

const PAYE_BANDS = [
  { limit: 300_000, rate: 0.07 },
  { limit: 300_000, rate: 0.11 },
  { limit: 500_000, rate: 0.15 },
  { limit: 500_000, rate: 0.19 },
  { limit: 1_600_000, rate: 0.21 },
  { limit: Infinity, rate: 0.24 },
];

function calcAnnualPAYE(annualGross: number) {
  const craBase = Math.max(200_000, annualGross * 0.01);
  const craAdditional = annualGross * 0.2;
  const totalCRA = craBase + craAdditional;
  const taxableIncome = Math.max(0, annualGross - totalCRA);

  let tax = 0;
  let rem = taxableIncome;
  for (const band of PAYE_BANDS) {
    if (rem <= 0) break;
    const taxable = Math.min(rem, band.limit);
    tax += taxable * band.rate;
    rem -= taxable;
  }

  return { totalCRA, taxableIncome, annualPAYE: tax };
}

export function previewPayslip(params: {
  basicSalary: number;
  housingRatio?: number; // default 0.20
  transportRatio?: number; // default 0.10
  commissionAmount?: number;
}) {
  const {
    basicSalary,
    housingRatio = 0.2,
    transportRatio = 0.1,
    commissionAmount = 0,
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

  const taxableGross = Math.max(0, grossSalary - pensionEmployee - nhf);
  const { totalCRA, taxableIncome, annualPAYE } = calcAnnualPAYE(
    taxableGross * 12,
  );
  const monthlyPAYE = +(annualPAYE / 12).toFixed(2);

  const totalDeductions = +(monthlyPAYE + pensionEmployee + nhf).toFixed(2);
  const netSalary = +(grossSalary - totalDeductions).toFixed(2);

  return {
    basicSalary,
    housingAllowance,
    transportAllowance,
    grossSalary,
    totalCRA: +(totalCRA / 12).toFixed(2),
    taxableIncome: +(taxableIncome / 12).toFixed(2),
    monthlyPAYE,
    pensionEmployee,
    nhf,
    totalDeductions,
    netSalary,
  };
}
