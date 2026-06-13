// ── Enums ─────────────────────────────────────────────────────────────────────

export type PayrollRunStatus = "draft" | "approved" | "paid";
export type PayrollMode = "full_paye" | "simplified";
export type PaymentMethod = "bulk" | "individual";

// ── Payroll run ───────────────────────────────────────────────────────────────

export interface PayrollRun {
  run_id: string;
  run_number: string;
  period_month: number; // 1–12
  period_year: number;
  status: PayrollRunStatus;
  mode: PayrollMode;
  total_gross: number;
  total_net: number;
  total_paye: number;
  total_pension_employee: number;
  total_pension_employer: number;
  total_nhf: number;
  total_deductions: number;
  payslip_count?: number;
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  created_at: string;
}

// ── Payslip ───────────────────────────────────────────────────────────────────

export interface Payslip {
  payslip_id: string;
  run_id: string;
  profile_id: string;
  display_name: string;
  employee_number?: string | null;
  job_title?: string | null;
  email?: string | null;
  whatsapp_number?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  // Earnings
  basic_salary: number;
  housing_allowance: number;
  transport_allowance: number;
  commission_amount: number;
  gross_salary: number;
  // Deductions
  paye_deduction: number;
  pension_employee: number;
  pension_employer: number; // employer contribution — shown but not deducted
  nhf_deduction: number;
  advance_recovery: number;
  other_deductions: number;
  total_deductions: number;
  net_salary: number;
  // Meta
  days_absent: number;
  run_number?: string;
  period_month?: number;
  period_year?: number;
}

// ── Commission ────────────────────────────────────────────────────────────────

export type CommissionRuleType =
  | "percentage_of_sales"
  | "fixed_per_item"
  | "tiered";

export interface CommissionRule {
  rule_id: string;
  profile_id?: string | null;
  role_id?: string | null;
  staff_name?: string | null;
  role_name?: string | null;
  rule_type: CommissionRuleType;
  rate?: number | null;
  tiers?: { threshold: number; rate: number }[] | null;
  applicable_to: string;
  is_active: boolean;
  created_at: string;
}

// ── PAYE preview (client-side calculation) ────────────────────────────────────

export interface PAYEPreview {
  grossSalary: number;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  rentRelief: number; // Nigeria Tax Act 2025 — replaces the abolished CRA
  taxableIncome: number;
  monthlyPAYE: number;
  pensionEmployee: number;
  nhf: number;
  totalDeductions: number;
  netSalary: number;
}
