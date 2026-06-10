import { api } from "@services/api";
import { getToken } from "@services/auth";
import { useBusinessStore } from "@stores/useBusinessStore";
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
  const token = getToken();
  const biz = useBusinessStore.getState().active;
  const params = [token ? `token=${token}` : "", biz ? `business=${biz}` : ""]
    .filter(Boolean)
    .join("&");
  return `${api.defaults.baseURL}/sales/quotations/${id}/pdf${params ? `?${params}` : ""}`;
}

// L3 fix: propagate errors so callers (React Query) can show error states
// instead of silently displaying zeros that look like real data
export async function getSalesKpis(): Promise<SalesKpis> {
  const { data } = await api.get<SalesKpis>("/sales/kpis");
  return data;
}
