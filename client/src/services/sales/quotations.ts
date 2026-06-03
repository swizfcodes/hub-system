import { api } from "@services/api";
import type { Quotation, SalesKpis, SalesListResponse } from "@typedefs/sales";
import type {
  CreateQuotationValues,
  UpdateQuotationValues,
  SendQuotationValues,
  ConfirmQuotationValues,
} from "@lib/schemas/sales";

const BASE = "/sales/quotations";

export interface ListQuotationsParams {
  page?: number;
  limit?: number;
  status?: string;
  contactId?: string;
  deal_id?: string;
}

export async function listQuotations(
  params: ListQuotationsParams = {},
): Promise<SalesListResponse<Quotation>> {
  try {
    const { data } = await api.get<SalesListResponse<Quotation>>(BASE, {
      params,
    });
    return data;
  } catch (err: unknown) {
    const e = err as { response?: { status?: number } };
    if (e?.response?.status === 404) return { data: [] };
    throw err;
  }
}

export async function getQuotation(id: string): Promise<Quotation> {
  const { data } = await api.get<Quotation>(`${BASE}/${id}`);
  return data;
}

export async function createQuotation(
  values: CreateQuotationValues,
): Promise<Quotation> {
  const { data } = await api.post<Quotation>(BASE, values);
  return data;
}

export async function updateQuotation(
  id: string,
  values: UpdateQuotationValues,
): Promise<Quotation> {
  const { data } = await api.patch<Quotation>(`${BASE}/${id}`, values);
  return data;
}

export async function sendQuotation(
  id: string,
  values: SendQuotationValues,
): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(
    `${BASE}/${id}/send`,
    values,
  );
  return data;
}

export async function confirmQuotation(
  id: string,
  values: ConfirmQuotationValues,
): Promise<{ order_id: string; order_number: string }> {
  const { data } = await api.post<{ order_id: string; order_number: string }>(
    `${BASE}/${id}/confirm`,
    values,
  );
  return data;
}

export async function cancelQuotation(
  id: string,
): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(`${BASE}/${id}/cancel`);
  return data;
}

/** Returns a URL pointing to the PDF stream endpoint — used in the preview pane */
export function quotationPdfUrl(id: string): string {
  return `${api.defaults.baseURL}/sales/quotations/${id}/pdf`;
}

export async function getSalesKpis(): Promise<SalesKpis> {
  try {
    const { data } = await api.get<SalesKpis>("/sales/kpis");
    return data;
  } catch {
    // Failsoft — return zeros so the KPI strip renders rather than breaking
    return {
      pipeline_value: 0,
      open_quotes: 0,
      confirmed_this_month: 0,
      overdue_invoices: 0,
      revenue_this_month: 0,
      avg_order_value: 0,
    };
  }
}
