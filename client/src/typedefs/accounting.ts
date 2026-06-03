// ── typedefs/accounting.ts ────────────────────────────────────────────────────
// Types for the Accounting module — chart of accounts, journals, financial
// reports, fiscal periods and bank reconciliation. Derived from the page/
// component consumers and the backend accounting service contract.

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "income"
  | "expense";

export type AgingBucket = "current" | "31_60" | "61_90" | "90_plus";

// ── Chart of accounts ─────────────────────────────────────────────────────────
export interface Account {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_subtype?: string | null;
  parent_account_id?: string | null;
  description?: string | null;
  is_system: boolean;
  is_active: boolean;
  balance?: number;
  created_at?: string;
  updated_at?: string;
}

// ── Journals ──────────────────────────────────────────────────────────────────
export interface JournalLine {
  line_id?: string;
  entry_id?: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  debit: number;
  credit: number;
  description?: string | null;
  fx_rate?: number | null;
  original_currency?: string | null;
  original_amount?: number | null;
}

export interface JournalEntry {
  entry_id: string;
  entry_number: string;
  entry_date: string;
  description?: string | null;
  reference_type: string;
  reference_id?: string | null;
  posted_by?: string | null;
  is_reversed: boolean;
  reversed_by_entry_id?: string | null;
  total_debit?: number;
  total_credit?: number;
  lines?: JournalLine[];
  created_at?: string;
}

// ── General ledger ────────────────────────────────────────────────────────────
export interface LedgerLine {
  entry_id: string;
  entry_number: string;
  entry_date: string;
  account_code?: string;
  account_name?: string;
  description?: string | null;
  debit: number;
  credit: number;
  running_balance: number;
}

// ── Report row primitives ─────────────────────────────────────────────────────
export interface ReportAccountRow {
  account_code: string;
  account_name: string;
  balance: number;
}

export interface CashFlowItem {
  label: string;
  amount: number;
}

// ── Profit & Loss ─────────────────────────────────────────────────────────────
export interface PLReport {
  period_start?: string;
  period_end?: string;
  income: ReportAccountRow[];
  expenses: ReportAccountRow[];
  total_income: number;
  total_expenses: number;
  net_profit: number;
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────
export interface BalanceSheetReport {
  as_of?: string;
  assets: ReportAccountRow[];
  liabilities: ReportAccountRow[];
  equity: ReportAccountRow[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
}

// ── Trial Balance ─────────────────────────────────────────────────────────────
export interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  account_type?: AccountType;
  total_debit: number;
  total_credit: number;
  balance: number;
}

export interface TrialBalanceReport {
  as_of?: string;
  data: TrialBalanceRow[];
  total_debit?: number;
  total_credit?: number;
}

// ── Cash Flow ─────────────────────────────────────────────────────────────────
export interface CashFlowReport {
  period_start?: string;
  period_end?: string;
  operating_activities: CashFlowItem[];
  investing_activities: CashFlowItem[];
  financing_activities: CashFlowItem[];
  net_operating: number;
  net_investing: number;
  net_financing: number;
  net_cash_movement: number;
  opening_cash?: number;
  closing_cash?: number;
}

// ── Fiscal periods ────────────────────────────────────────────────────────────
export interface FiscalPeriod {
  period_id: string;
  name: string;
  period_type: "monthly" | "quarterly" | "annual" | string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  closed_by?: string | null;
  closed_at?: string | null;
}

// ── Bank reconciliation ───────────────────────────────────────────────────────
export interface BankStatementLine {
  statement_id: string;
  statement_line_id?: string;
  account_name?: string | null;
  bank_account_id?: string;
  transaction_date: string;
  description: string;
  debit?: number;
  credit?: number;
  amount: number;
  balance?: number;
  is_reconciled: boolean;
  matched_entry_id?: string | null;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export interface AccountingDashboard {
  revenue_mtd: number;
  expenses_mtd: number;
  net_profit_mtd: number;
  cash_position: number;
  unreconciled_count: number;
  open_period: {
    period_id?: string;
    name: string;
    start_date: string;
    end_date: string;
  } | null;
}

// ── AP aging ──────────────────────────────────────────────────────────────────
export interface APAgingRow {
  contact_id: string;
  contact_name: string;
  current: number;
  "31_60": number;
  "61_90": number;
  "90_plus": number;
  total: number;
}
