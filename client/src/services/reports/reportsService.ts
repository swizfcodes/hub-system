// ── services/reports.ts ──────────────────────────────────────────────────────
import { api } from "@services/api";
import type { ReportData, ReportFilters, SavedReport } from "@typedefs/reports";

export interface GenerateParams extends Partial<ReportFilters> {
  family: string;
  reportType: string;
  format?: string;
  archive?: boolean;
  payrollId?: string;
  asOfDate?: string;
}

export async function generateReport(
  params: GenerateParams,
): Promise<ReportData> {
  const { family, reportType, format = "json", archive, ...rest } = params;
  const { data } = await api.get<ReportData>(
    `/reports/${family}/${reportType}`,
    {
      params: {
        start_date: rest.startDate,
        end_date: rest.endDate,
        as_of_date: rest.asOfDate,
        group_by: rest.groupBy,
        limit: rest.limit,
        payroll_id: rest.payrollId,
        format,
        archive: archive ? "true" : undefined,
      },
    },
  );
  return data;
}

export async function downloadReport(params: GenerateParams): Promise<Blob> {
  const { family, reportType, format = "pdf", ...rest } = params;
  const response = await api.get(`/reports/${family}/${reportType}`, {
    params: {
      start_date: rest.startDate,
      end_date: rest.endDate,
      as_of_date: rest.asOfDate,
      group_by: rest.groupBy,
      format,
      archive: "true",
    },
    responseType: "blob",
  });
  return response.data as Blob;
}

export async function generateConsolidated(
  family: string,
  reportType: string,
  startDate: string,
  endDate: string,
): Promise<ReportData> {
  const { data } = await api.get<ReportData>(
    `/reports/consolidated/${family}/${reportType}`,
    {
      params: { start_date: startDate, end_date: endDate },
    },
  );
  return data;
}

// Saved reports
export async function listSavedReports(): Promise<{ data: SavedReport[] }> {
  try {
    const { data } = await api.get<{ data: SavedReport[] }>("/reports/saved");
    return data;
  } catch {
    return { data: [] };
  }
}

export async function createSavedReport(values: {
  report_name: string;
  report_type: string;
  filters?: Record<string, unknown>;
  is_shared?: boolean;
  schedule?: Record<string, unknown>;
}): Promise<SavedReport> {
  const { data } = await api.post<SavedReport>("/reports/saved", values);
  return data;
}

export async function updateSavedReport(
  id: string,
  values: Partial<{
    report_name: string;
    filters: Record<string, unknown>;
    is_shared: boolean;
    schedule: Record<string, unknown>;
  }>,
): Promise<SavedReport> {
  const { data } = await api.patch<SavedReport>(`/reports/saved/${id}`, values);
  return data;
}

export async function deleteSavedReport(id: string): Promise<void> {
  await api.delete(`/reports/saved/${id}`);
}

// ── services/dashboards.ts ────────────────────────────────────────────────────

export async function getSalesDashboard(params?: {
  start_date?: string;
  end_date?: string;
}) {
  try {
    const { data } = await api.get("/dashboards/sales", { params });
    return data;
  } catch {
    return null;
  }
}

export async function getFinanceDashboard(params?: {
  start_date?: string;
  end_date?: string;
}) {
  try {
    const { data } = await api.get("/dashboards/finance", { params });
    return data;
  } catch {
    return null;
  }
}

export async function getStockDashboard() {
  try {
    const { data } = await api.get("/dashboards/stock");
    return data;
  } catch {
    return null;
  }
}

export async function getCustomerDashboard(params?: {
  start_date?: string;
  end_date?: string;
}) {
  try {
    const { data } = await api.get("/dashboards/customers", { params });
    return data;
  } catch {
    return null;
  }
}

export async function getLogisticsDashboard(params?: {
  start_date?: string;
  end_date?: string;
}) {
  try {
    const { data } = await api.get("/dashboards/logistics", { params });
    return data;
  } catch {
    return null;
  }
}

export async function getOverview(params?: {
  start_date?: string;
  end_date?: string;
}) {
  try {
    const { data } = await api.get("/dashboards/overview", { params });
    return data;
  } catch {
    return null;
  }
}
