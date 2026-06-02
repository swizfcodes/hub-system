import type { AccountType, AgingBucket } from "@typedefs/accounting";
import type { SelectOption } from "@components/ui/Select";
import type { BadgeProps } from "@components/ui/Badge";

// ── Account type meta ─────────────────────────────────────────────────────────

export const ACCOUNT_TYPE_META: Record<
  AccountType,
  {
    label: string;
    tone: BadgeProps["tone"];
    color: string;
    normalBalance: "DR" | "CR";
  }
> = {
  asset: {
    label: "Asset",
    tone: "info",
    color: "#4E9AF1",
    normalBalance: "DR",
  },
  liability: {
    label: "Liability",
    tone: "danger",
    color: "#E74C3C",
    normalBalance: "CR",
  },
  equity: {
    label: "Equity",
    tone: "plum",
    color: "#9B59B6",
    normalBalance: "CR",
  },
  income: {
    label: "Income",
    tone: "sage",
    color: "#2ECC71",
    normalBalance: "CR",
  },
  expense: {
    label: "Expense",
    tone: "warn",
    color: "#E67E22",
    normalBalance: "DR",
  },
};

export const ACCOUNT_TYPE_OPTIONS: SelectOption[] = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
];

export const ACCOUNT_SUBTYPE_OPTIONS: Record<AccountType, SelectOption[]> = {
  asset: [
    { value: "current_asset", label: "Current Asset" },
    { value: "fixed_asset", label: "Fixed Asset" },
    { value: "other_asset", label: "Other Asset" },
  ],
  liability: [
    { value: "current_liability", label: "Current Liability" },
    { value: "long_term_liability", label: "Long-term Liability" },
  ],
  equity: [{ value: "equity", label: "Equity" }],
  income: [
    { value: "operating_income", label: "Operating Income" },
    { value: "other_income", label: "Other Income" },
  ],
  expense: [
    { value: "operating_expense", label: "Operating Expense" },
    { value: "payroll_expense", label: "Payroll Expense" },
    { value: "cogs", label: "Cost of Goods Sold" },
    { value: "other_expense", label: "Other Expense" },
  ],
};

// ── Reference type labels ─────────────────────────────────────────────────────

export const REFERENCE_TYPE_LABEL: Record<string, string> = {
  manual: "Manual Entry",
  invoice: "Invoice",
  sales_order: "Sales Order",
  pos_transaction: "POS Sale",
  purchase_order: "Purchase Order",
  expense: "Expense",
  payroll_run: "Payroll",
  delivery_return: "Delivery Return",
  credit_note: "Credit Note",
  settlement: "Settlement",
};

// ── Report tabs ───────────────────────────────────────────────────────────────

export const REPORT_TABS = [
  { key: "pl", label: "P&L" },
  { key: "balance-sheet", label: "Balance Sheet" },
  { key: "trial-balance", label: "Trial Balance" },
  { key: "cash-flow", label: "Cash Flow" },
] as const;

// ── Aging bucket labels ───────────────────────────────────────────────────────

export const AGING_BUCKET_META: Record<
  AgingBucket,
  { label: string; tone: BadgeProps["tone"] }
> = {
  current: { label: "Current", tone: "sage" },
  "31_60": { label: "31–60 days", tone: "warn" },
  "61_90": { label: "61–90 days", tone: "danger" },
  "90_plus": { label: "90+ days", tone: "danger" },
};

// ── Default date range helpers ────────────────────────────────────────────────

export function currentMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    start: `${y}-${m}-01`,
    end: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function currentYearRange() {
  const y = new Date().getFullYear();
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}
