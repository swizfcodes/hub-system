import { api } from "../api";
import type { StockBatch } from "@typedefs/stock";
import type { BatchCreateValues } from "@lib/schemas/stock";

/**
 * Backend pending: full batch/lot table + endpoints — see STOCK_PATCH_NOTES.md §batches.
 * Until the backend lands, these endpoints fail soft (404 → empty) so the UI loads.
 */

export async function listBatches(
  params: { product_id?: string; expiring_within_days?: number } = {},
): Promise<StockBatch[]> {
  try {
    const { data } = await api.get<{ data: StockBatch[] } | StockBatch[]>(
      "/stock/batches",
      { params },
    );
    return Array.isArray(data) ? data : data.data;
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404)
      return [];
    throw e;
  }
}

export async function createBatch(
  payload: BatchCreateValues,
): Promise<StockBatch> {
  const { data } = await api.post<StockBatch>("/stock/batches", {
    ...payload,
    manufactured_date: payload.manufactured_date || undefined,
    expiry_date: payload.expiry_date || undefined,
    location_id: payload.location_id || undefined,
    notes: payload.notes || undefined,
  });
  return data;
}

export function batchExpiryStatus(
  expiryISO?: string | null,
): "fresh" | "soon" | "critical" | "expired" | null {
  if (!expiryISO) return null;
  const days = Math.round(
    (new Date(expiryISO).getTime() - Date.now()) / 86400000,
  );
  if (days < 0) return "expired";
  if (days < 30) return "critical";
  if (days < 90) return "soon";
  return "fresh";
}
