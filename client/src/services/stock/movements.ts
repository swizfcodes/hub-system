import { api } from "../api";
import type { StockMovement, MovementType } from "@typedefs/stock";
import type { ManualExitValues } from "@lib/schemas/stock";

export interface MovementListParams {
  product_id?: string;
  location_id?: string;
  movement_type?: MovementType;
  reference_type?: string;
  reference_id?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function listMovements(
  params: MovementListParams = {},
): Promise<{
  data: StockMovement[];
  pagination?: { page: number; limit: number; total: number };
}> {
  const { data } = await api.get("/stock/movements", { params });
  return data;
}

/** Manual stock exit (gift, sample, write-off, etc.) */
export async function recordManualExit(
  payload: ManualExitValues,
): Promise<StockMovement> {
  const { data } = await api.post<StockMovement>(
    "/stock/movements/manual-exit",
    {
      ...payload,
      batch_id: payload.batch_id || undefined,
    },
  );
  return data;
}
