// ── services/payroll/payroll.ts ───────────────────────────────────────────────
// API wrappers for the Payroll module — runs, payslips, compliance outputs.

import { api } from "@services/api";
import type { PayrollRun, Payslip, PayrollMode } from "@typedefs/payroll";


export interface PayrollRunListResponse {
  data: PayrollRun[];
}

// ── Runs ──────────────────────────────────────────────────────────────────────
export async function listRuns(): Promise<PayrollRunListResponse> {
  try {
    const { data } = await api.get<PayrollRunListResponse>("/payroll/runs");
    return data;
  } catch {
    return { data: [] };
  }
}

export async function getRun(id: string): Promise<PayrollRun | null> {
  try {
    const { data } = await api.get<PayrollRun>(`/payroll/runs/${id}`);
    return data;
  } catch {
    return null;
  }
}

export async function initiateRun(payload: {
  period_month: number;
  period_year: number;
  mode: PayrollMode;
}): Promise<PayrollRun> {
  const { data } = await api.post<PayrollRun>("/payroll/runs", payload);
  return data;
}

export async function approveRun(id: string): Promise<PayrollRun> {
  const { data } = await api.post<PayrollRun>(
    `/payroll/runs/${id}/approve`,
    {},
  );
  return data;
}

export async function markRunPaid(id: string): Promise<PayrollRun> {
  const { data } = await api.post<PayrollRun>(
    `/payroll/runs/${id}/mark-paid`,
    {},
  );
  return data;
}

// ── Payslips ──────────────────────────────────────────────────────────────────
export async function getPayslips(runId: string): Promise<{ data: Payslip[] }> {
  try {
    const { data } = await api.get<{ data: Payslip[] }>(
      `/payroll/runs/${runId}/payslips`,
    );
    return { data: data.data ?? [] };
  } catch {
    return { data: [] };
  }
}

export async function getPayslip(id: string): Promise<Payslip | null> {
  try {
    const { data } = await api.get<Payslip>(`/payroll/payslips/${id}`);
    return data;
  } catch {
    return null;
  }
}

export async function sendPayslip(
  payslipId: string,
  channel: "email" | "whatsapp" = "email",
): Promise<void> {
  await api.post(`/payroll/payslips/${payslipId}/send`, { channel });
}

export async function openPayslipPdf(payslipId: string): Promise<void> {
  const { openPdf } = await import("@lib/openPdf");
  return openPdf(`/payroll/payslips/${payslipId}/pdf`, `payslip-${payslipId}.pdf`);
}

export async function openCompliancePdf(runId: string, outputKey: string): Promise<void> {
  const { openPdf } = await import("@lib/openPdf");
  return openPdf(`/payroll/runs/${runId}/compliance/${outputKey}`, `${outputKey}.pdf`);
}
