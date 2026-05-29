// ── services/expenses/expenses.ts ─────────────────────────────────────────────
// API wrappers for the Expenses module (expenses + cash advances).

import { api } from '@services/api';
import type {
  Expense,
  ExpenseListResponse,
  AdvanceListResponse,
  ExpenseKpis,
} from '@typedefs/expenses';
import type {
  CreateExpenseValues,
  RejectExpenseValues,
  CreateAdvanceValues,
  ApproveAdvanceValues,
} from '@lib/schemas/expenses';

// ── Expenses ──────────────────────────────────────────────────────────────────
export async function listExpenses(
  params: { status?: string; limit?: number; page?: number; category?: string } = {},
): Promise<ExpenseListResponse> {
  try {
    const { data } = await api.get<ExpenseListResponse>('/expenses', { params });
    return data;
  } catch {
    return { data: [] };
  }
}

export async function getExpense(id: string): Promise<Expense | null> {
  try {
    const { data } = await api.get<Expense>(`/expenses/${id}`);
    return data;
  } catch {
    return null;
  }
}

export async function createExpense(values: CreateExpenseValues): Promise<Expense> {
  const { data } = await api.post<Expense>('/expenses', values);
  return data;
}

export async function approveExpense(id: string): Promise<Expense> {
  const { data } = await api.post<Expense>(`/expenses/${id}/approve`, {});
  return data;
}

export async function rejectExpense(id: string, values: RejectExpenseValues): Promise<Expense> {
  const { data } = await api.post<Expense>(`/expenses/${id}/reject`, values);
  return data;
}

export async function markExpensePaid(id: string): Promise<Expense> {
  const { data } = await api.post<Expense>(`/expenses/${id}/mark-paid`, {});
  return data;
}

export async function getExpenseKpis(): Promise<ExpenseKpis | null> {
  try {
    const { data } = await api.get<ExpenseKpis>('/expenses/kpis');
    return data;
  } catch {
    return null;
  }
}

// ── Cash advances ─────────────────────────────────────────────────────────────
export async function listAdvances(
  params: { status?: string } = {},
): Promise<AdvanceListResponse> {
  try {
    const { data } = await api.get<AdvanceListResponse>('/expenses/advances', { params });
    return data;
  } catch {
    return { data: [] };
  }
}

export async function createAdvance(values: CreateAdvanceValues) {
  const { data } = await api.post('/expenses/advances', values);
  return data;
}

export async function approveAdvance(id: string, values: ApproveAdvanceValues) {
  const { data } = await api.post(`/expenses/advances/${id}/approve`, values);
  return data;
}
