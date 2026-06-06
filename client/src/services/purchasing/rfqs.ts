import { api } from "../api";
import type { RFQ, SupplierQuote, RFQStatus } from "@typedefs/purchasing";

export async function getRFQ(id: string): Promise<RFQ> {
  const { data } = await api.get<RFQ>(`/purchasing/rfqs/${id}`);
  return data;
}

export async function listRFQs(
  params: { status?: RFQStatus; page?: number; limit?: number } = {},
): Promise<{ data: RFQ[] }> {
  const { data } = await api.get<{ data: RFQ[] }>("/purchasing/rfqs", {
    params,
  });
  return data;
}

export interface CreateRFQPayload {
  title: string;
  response_deadline?: string;
  notes?: string;
  lines: Array<{
    product_id?: string;
    description: string;
    quantity_needed: number;
    target_price?: number;
  }>;
  invited_supplier_ids?: string[];
}

export async function createRFQ(payload: CreateRFQPayload): Promise<RFQ> {
  const { data } = await api.post<RFQ>("/purchasing/rfqs", payload);
  return data;
}

export async function listQuotesForRFQ(
  rfqId: string,
): Promise<SupplierQuote[]> {
  try {
    const { data } = await api.get<{ data: SupplierQuote[] } | SupplierQuote[]>(
      `/purchasing/rfqs/${rfqId}/quotes`,
    );
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404)
      return [];
    throw e;
  }
}

export async function sendRFQ(rfqId: string): Promise<RFQ> {
  const { data } = await api.post<RFQ>(`/purchasing/rfqs/${rfqId}/send`);
  return data;
}

export async function generatePOFromQuote(
  quoteId: string,
): Promise<import("@typedefs/purchasing").PurchaseOrder> {
  const { data } = await api.post<import("@typedefs/purchasing").PurchaseOrder>(
    `/purchasing/quotes/${quoteId}/generate-po`,
  );
  return data;
}

/**
 * Backend gap: public quote-submission endpoint (called by the supplier portal).
 */
export async function submitQuote(
  payload: import("@lib/schemas/purchasing").QuoteSubmissionValues,
): Promise<{ ok: boolean }> {
  const { data } = await api.post<{ ok: boolean }>(
    `/purchasing/rfqs/public/submit`,
    payload,
  );
  return data;
}
