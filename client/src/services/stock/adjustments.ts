import { api } from "../api";
import type { StockAdjustment } from "@typedefs/stock";
import type { AdjustmentValues } from "@lib/schemas/stock";

export async function listAdjustments(
  params: {
    product_id?: string;
    location_id?: string;
    from?: string;
    to?: string;
  } = {},
): Promise<{ data: StockAdjustment[] }> {
  const { data } = await api.get("/stock/adjustment", { params });
  return data;
}

export async function createAdjustment(
  payload: AdjustmentValues,
): Promise<StockAdjustment> {
  const { data } = await api.post<StockAdjustment>(
    "/stock/adjustment",
    payload,
  );
  return data;
}

/** Submit a count session as a batch of adjustments. */
export async function createBatchAdjustments(
  payloads: AdjustmentValues[],
): Promise<{ created: number; adjustments: StockAdjustment[] }> {
  const { data } = await api.post("/stock/adjustment/batch", {
    adjustments: payloads,
  });
  return data;
}

export async function approveAdjustment(id: string): Promise<StockAdjustment> {
  const { data } = await api.post<StockAdjustment>(
    `/stock/adjustment/${id}/approve`,
  );
  return data;
}
