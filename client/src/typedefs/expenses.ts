// ── typedefs/expenses.ts ──────────────────────────────────────────────────────
// Types for the Expenses module — expenses, cash advances and KPI rollups.

export type ExpenseStatus = "pending" | "approved" | "rejected" | "paid";

export type AdvanceStatus =
  | "pending"
  | "approved"
  | "disbursed"
  | "settled"
  | "rejected";

export type ExpenseType = "reimbursement" | "petty_cash" | "direct_payment";

export type ExpenseCategory =
  | "rent"
  | "transport"
  | "office_supplies"
  | "meals"
  | "client_entertainment"
  | "utilities"
  | "maintenance"
  | "marketing"
  | "insurance"
  | "professional_fees"
  | "other";

export interface ExpenseReceipt {
  receipt_id: string;
  file_url: string;
  file_name?: string;
  uploaded_at?: string;
}

export interface Expense {
  expense_id: string;
  expense_number: string;
  category: ExpenseCategory;
  expense_type: ExpenseType;
  amount: number;
  description: string;
  expense_date: string;
  status: ExpenseStatus;
  vendor_name?: string | null;
  vendor_contact_id?: string | null;
  staff_name?: string | null;
  submitted_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  rejection_reason?: string | null;
  auto_approved?: boolean;
  receipts?: ExpenseReceipt[];
  created_at?: string;
}

export interface CashAdvance {
  advance_id: string;
  staff_name?: string | null;
  staff_id?: string | null;
  purpose: string;
  amount_requested: number;
  amount_approved?: number | null;
  outstanding_balance?: number;
  status: AdvanceStatus;
  requested_at?: string;
  approved_at?: string | null;
}

export interface ExpenseCategorySpend {
  category: string;
  total: number;
}

export interface ExpenseKpis {
  paid_this_month: number;
  pending_amount: number;
  pending_count: number;
  reimbursements_outstanding: number;
  top_category_this_month: string | null;
  spend_by_category: ExpenseCategorySpend[];
}

export interface ExpenseListResponse {
  data: Expense[];
  pagination?: { total: number };
}

export interface AdvanceListResponse {
  data: CashAdvance[];
}
