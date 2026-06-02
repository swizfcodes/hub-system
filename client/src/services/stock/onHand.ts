import { api } from "../api";
import type { OnHandResponse, OnHandRow } from "@typedefs/stock";

export interface OnHandParams {
  search?: string;
  category_id?: string;
  location_id?: string;
  low_stock_only?: boolean;
  out_of_stock_only?: boolean;
  page?: number;
  limit?: number;
}

/**
 * Backend gap: a unified /api/stock/on-hand endpoint that returns
 * one row per product with on-hand summed across locations + breakdown.
 * Until the endpoint is exposed, the frontend falls back to computing
 * client-side from listMovements (only viable for tiny datasets).
 *
 * Drop-in code in STOCK_PATCH_NOTES.md.
 */
export async function listOnHand(
  params: OnHandParams = {},
): Promise<OnHandResponse> {
  try {
    const { data } = await api.get<OnHandResponse>("/stock/on-hand", {
      params,
    });
    return data;
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404) {
      return {
        data: [],
        totals: {
          total_value: 0,
          total_units: 0,
          low_stock_count: 0,
          out_of_stock_count: 0,
        },
      };
    }
    throw e;
  }
}

/**
 * On-hand for one product across all locations. Used on Product Detail Stock tab.
 */
export async function getOnHand(productId: string): Promise<OnHandRow | null> {
  try {
    const { data } = await api.get<OnHandRow>(`/stock/on-hand/${productId}`);
    return data;
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404)
      return null;
    throw e;
  }
}
