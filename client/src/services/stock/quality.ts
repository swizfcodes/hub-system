import { api } from "../api";
import type { QualityCheck } from "@typedefs/stock";
import type { QcValues } from "@lib/schemas/stock";

export async function listQCs(
  params: { product_id?: string; check_type?: string; result?: string } = {},
): Promise<{ data: QualityCheck[] }> {
  const { data } = await api.get("/stock/quality-checks", { params });
  return data;
}

export async function createQC(payload: QcValues): Promise<QualityCheck> {
  const { data } = await api.post<QualityCheck>("/stock/quality-checks", {
    ...payload,
    notes: payload.notes || undefined,
  });
  return data;
}
