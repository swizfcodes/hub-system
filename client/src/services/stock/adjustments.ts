import { api } from '../api';
import type { StockAdjustment } from '@typedefs/stock';
import type { AdjustmentValues } from '@lib/schemas/stock';

export async function listAdjustments(params: { product_id?: string; location_id?: string; from?: string; to?: string } = {}): Promise<{ data: StockAdjustment[] }> {
  const { data } = await api.get('/stock/adjustments', { params });
  return data;
}

export async function createAdjustment(payload: AdjustmentValues): Promise<StockAdjustment> {
  const { data } = await api.post<StockAdjustment>('/stock/adjustments', payload);
  return data;
}

/** Submit a count session as a batch of adjustments. */
export async function createBatchAdjustments(payloads: AdjustmentValues[]): Promise<{ created: number; adjustments: StockAdjustment[] }> {
  const { data } = await api.post('/stock/adjustments/batch', { adjustments: payloads });
  return data;
}

export async function approveAdjustment(id: string): Promise<StockAdjustment> {
  const { data } = await api.post<StockAdjustment>(`/stock/adjustments/${id}/approve`);
  return data;
}
