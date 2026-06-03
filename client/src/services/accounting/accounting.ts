// ── services/accounting/accounting.ts ─────────────────────────────────────────
// API wrappers for the Accounting module. Endpoints follow the backend
// /accounting router (chart of accounts, journals, reports, fiscal periods,
// bank reconciliation, dashboard).

import { api } from "@services/api";
import type {
  Account,
  JournalEntry,
  LedgerLine,
  PLReport,
  BalanceSheetReport,
  TrialBalanceReport,
  CashFlowReport,
  FiscalPeriod,
  BankStatementLine,
  AccountingDashboard,
} from "@typedefs/accounting";
import type {
  CreateAccountValues,
  CreateJournalValues,
} from "@lib/schemas/accounting";

// ── Dashboard ─────────────────────────────────────────────────────────────────
export async function getDashboard(): Promise<AccountingDashboard | null> {
  try {
    const { data } = await api.get<AccountingDashboard>(
      "/accounting/dashboard",
    );
    return data;
  } catch {
    return null;
  }
}

// ── Chart of accounts ─────────────────────────────────────────────────────────
export async function listAccounts(
  params: { active?: string; type?: string } = {},
): Promise<Account[]> {
  try {
    const { data } = await api.get<{ data: Account[] }>(
      "/accounting/accounts",
      { params },
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function createAccount(
  values: CreateAccountValues,
): Promise<Account> {
  const { data } = await api.post<Account>("/accounting/accounts", values);
  return data;
}

export async function updateAccount(
  id: string,
  values: Partial<CreateAccountValues>,
): Promise<Account> {
  const { data } = await api.patch<Account>(
    `/accounting/accounts/${id}`,
    values,
  );
  return data;
}

export async function getAccountLedger(
  id: string,
  params: { start_date?: string; end_date?: string } = {},
): Promise<{ data: LedgerLine[] }> {
  try {
    const { data } = await api.get<{ data: LedgerLine[] }>(
      `/accounting/accounts/${id}/ledger`,
      { params },
    );
    return { data: data.data ?? [] };
  } catch {
    return { data: [] };
  }
}

// ── Journals ──────────────────────────────────────────────────────────────────
export async function listJournals(
  params: {
    reference_type?: string;
    start_date?: string;
    end_date?: string;
  } = {},
): Promise<{ data: JournalEntry[] }> {
  try {
    const { data } = await api.get<{ data: JournalEntry[] }>(
      "/accounting/journals",
      { params },
    );
    return { data: data.data ?? [] };
  } catch {
    return { data: [] };
  }
}

export async function getJournal(id: string): Promise<JournalEntry | null> {
  try {
    const { data } = await api.get<JournalEntry>(`/accounting/journals/${id}`);
    return data;
  } catch {
    return null;
  }
}

export async function createManualJournal(
  values: CreateJournalValues,
): Promise<JournalEntry> {
  const { data } = await api.post<JournalEntry>("/accounting/journals", values);
  return data;
}

export async function reverseJournal(id: string): Promise<JournalEntry> {
  const { data } = await api.post<JournalEntry>(
    `/accounting/journals/${id}/reverse`,
    {},
  );
  return data;
}

// ── Financial reports ─────────────────────────────────────────────────────────
export async function getProfitAndLoss(params: {
  start_date: string;
  end_date: string;
}): Promise<PLReport> {
  const { data } = await api.get<PLReport>(
    "/accounting/reports/profit-and-loss",
    { params },
  );
  return data;
}

export async function getBalanceSheet(params: {
  as_of_date: string;
}): Promise<BalanceSheetReport> {
  const { data } = await api.get<BalanceSheetReport>(
    "/accounting/reports/balance-sheet",
    { params },
  );
  return data;
}

export async function getTrialBalance(params: {
  start_date: string;
  end_date: string;
}): Promise<TrialBalanceReport> {
  const { data } = await api.get<TrialBalanceReport>(
    "/accounting/reports/trial-balance",
    { params },
  );
  return data;
}

export async function getCashFlow(params: {
  start_date: string;
  end_date: string;
}): Promise<CashFlowReport> {
  const { data } = await api.get<CashFlowReport>(
    "/accounting/reports/cash-flow",
    { params },
  );
  return data;
}

// ── Bank reconciliation ───────────────────────────────────────────────────────
export async function listBankStatements(
  params: { reconciled?: string; bank_account_id?: string } = {},
): Promise<BankStatementLine[]> {
  try {
    const { data } = await api.get<{ data: BankStatementLine[] }>(
      "/accounting/bank-statements",
      { params },
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function reconcileItem(payload: {
  statement_id: string;
  payment_id: string;
}): Promise<void> {
  await api.post("/accounting/bank-statements/reconcile", payload);
}

// ── Fiscal periods ────────────────────────────────────────────────────────────
export async function listFiscalPeriods(): Promise<FiscalPeriod[]> {
  try {
    const { data } = await api.get<{ data: FiscalPeriod[] }>(
      "/accounting/fiscal-periods",
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function closePeriod(periodId: string): Promise<FiscalPeriod> {
  const { data } = await api.post<FiscalPeriod>(
    `/accounting/fiscal-periods/${periodId}/close`,
    {},
  );
  return data;
}

export async function reopenPeriod(periodId: string): Promise<FiscalPeriod> {
  const { data } = await api.post<FiscalPeriod>(
    `/accounting/fiscal-periods/${periodId}/reopen`,
    {},
  );
  return data;
}
