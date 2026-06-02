// ── services/tax/tax.ts ───────────────────────────────────────────────────────
// API wrappers for the Tax module (/tax router). Business context is applied
// server-side from the active business, same as the accounting service.

import { api } from "@services/api";

export type TaxType = "VAT" | "WHT" | "PAYE" | "CIT" | "DEV_LEVY";
export type FilingStatus = "draft" | "reviewed" | "filed" | "paid" | "exempt";

export interface TaxProfile {
  profile_id: string;
  legal_name?: string | null;
  tin?: string | null;
  tax_state: string;
  vat_registered: boolean;
  fiscal_year_end_month: number;
  is_small_company: boolean;
  small_co_turnover_cap: number;
  cit_rate: number;
  dev_levy_rate: number;
}

export interface TaxWorkpaper {
  tax_type: TaxType;
  period_label: string;
  period_start: string;
  period_end: string;
  computed_amount: number;
  currency: string;
  summary: Record<string, unknown>;
  meta?: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  warnings: string[];
}

export interface TaxFiling {
  filing_id: string;
  filing_number?: string | null;
  tax_type: TaxType;
  period_label: string;
  period_start: string;
  period_end: string;
  status: FilingStatus;
  computed_amount: number;
  adjustment_amount: number;
  final_amount: number;
  filing_reference?: string | null;
  filed_at?: string | null;
  paid_at?: string | null;
  workpaper?: TaxWorkpaper;
  adjustments?: Array<{
    adjustment_id: string;
    label: string;
    amount: number;
    reason?: string | null;
  }>;
  settlement_entry_number?: string;
}

export interface TaxDeadline {
  tax_type: TaxType;
  period_label: string;
  due: string;
  authority: string;
}
export interface TaxDashboard {
  profile: TaxProfile | null;
  filings: TaxFiling[];
  deadlines: TaxDeadline[];
}

export async function getTaxDashboard(): Promise<TaxDashboard> {
  const { data } = await api.get<TaxDashboard>("/tax/dashboard");
  return data;
}

export async function getTaxProfile(): Promise<TaxProfile | null> {
  try {
    const { data } = await api.get<TaxProfile>("/tax/profile");
    return data;
  } catch {
    return null;
  }
}

export async function updateTaxProfile(
  values: Partial<TaxProfile>,
): Promise<TaxProfile> {
  const { data } = await api.put<TaxProfile>("/tax/profile", values);
  return data;
}

export async function previewTax(
  type: TaxType,
  period: string,
): Promise<TaxWorkpaper> {
  const { data } = await api.get<TaxWorkpaper>("/tax/preview", {
    params: { type, period },
  });
  return data;
}

export async function listFilings(params?: {
  tax_type?: TaxType;
  year?: number;
}): Promise<{ data: TaxFiling[] }> {
  try {
    const { data } = await api.get("/tax/filings", { params });
    return data;
  } catch {
    return { data: [] };
  }
}

export async function saveFilingDraft(
  tax_type: TaxType,
  period_label: string,
): Promise<TaxFiling> {
  const { data } = await api.post<TaxFiling>("/tax/filings", {
    tax_type,
    period_label,
  });
  return data;
}

export async function getFiling(id: string): Promise<TaxFiling> {
  const { data } = await api.get<TaxFiling>(`/tax/filings/${id}`);
  return data;
}

export async function addAdjustment(
  id: string,
  payload: { label: string; amount: number; reason?: string },
): Promise<TaxFiling> {
  const { data } = await api.post<TaxFiling>(
    `/tax/filings/${id}/adjustments`,
    payload,
  );
  return data;
}

export async function confirmFiling(id: string): Promise<TaxFiling> {
  const { data } = await api.post<TaxFiling>(`/tax/filings/${id}/confirm`);
  return data;
}

export async function markFiled(
  id: string,
  filing_reference?: string,
): Promise<TaxFiling> {
  const { data } = await api.post<TaxFiling>(`/tax/filings/${id}/file`, {
    filing_reference,
  });
  return data;
}

export async function settleFiling(
  id: string,
  bank_account_code?: string,
): Promise<TaxFiling> {
  const { data } = await api.post<TaxFiling>(`/tax/filings/${id}/settle`, {
    bank_account_code,
  });
  return data;
}

// Download the CSV schedule for a filing.
export async function exportFiling(
  id: string,
  filename: string,
): Promise<void> {
  const res = await api.get(`/tax/filings/${id}/export`, {
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(
    new Blob([res.data], { type: "text/csv" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
