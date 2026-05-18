import { api } from '../api';
import type { RFQ, SupplierQuote, RFQStatus } from '@typedefs/purchasing';

export async function listRFQs(params: { status?: RFQStatus; page?: number; limit?: number } = {}): Promise<{ data: RFQ[] }> {
  const { data } = await api.get<{ data: RFQ[] }>('/purchasing/rfqs', { params });
  return data;
}

export interface CreateRFQPayload {
  title: string;
  response_deadline?: string;
  notes?: string;
  lines: Array<{ product_id?: string; description: string; quantity_needed: number; target_price?: number }>;
  invited_supplier_ids?: string[];
}

export async function createRFQ(payload: CreateRFQPayload): Promise<RFQ> {
  const { data } = await api.post<RFQ>('/purchasing/rfqs', payload);
  return data;
}

/**
 * Backend gap: list supplier quotes for an RFQ — endpoint not exposed yet.
 * Returns an empty array gracefully so the UI can render the empty state.
 */
export async function listQuotesForRFQ(rfqId: string): Promise<SupplierQuote[]> {
  try {
    const { data } = await api.get<{ data: SupplierQuote[] } | SupplierQuote[]>(`/purchasing/rfqs/${rfqId}/quotes`);
    return Array.isArray(data) ? data : data.data ?? [];
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404) return [];
    throw e;
  }
}

/**
 * Backend gap: send an RFQ (transition draft → sent + dispatch tokens).
 * Frontend stub for now.
 */
export async function sendRFQ(rfqId: string): Promise<RFQ> {
  const { data } = await api.post<RFQ>(`/purchasing/rfqs/${rfqId}/send`);
  return data;
}

/**
 * Backend gap: public quote-submission endpoint (called by the supplier portal).
 */
export async function submitQuote(payload: import('@lib/schemas/purchasing').QuoteSubmissionValues): Promise<{ ok: boolean }> {
  const { data } = await api.post<{ ok: boolean }>(`/purchasing/rfqs/public/submit`, payload);
  return data;
}
