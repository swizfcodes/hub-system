import { api } from "../api";
import type { Deal } from "@typedefs/crm";

export interface DealListParams {
  page?: number;
  limit?: number;
  stage?: string;
  assigned_to?: string;
  contact_id?: string;
}

export interface DealListResponse {
  data: Deal[];
}

export async function listDeals(
  params: DealListParams = {},
): Promise<DealListResponse> {
  const { data } = await api.get<DealListResponse>("/crm/deals", { params });
  return data;
}

export async function getDeal(id: string): Promise<Deal> {
  const { data } = await api.get<Deal>(`/crm/deals/${id}`);
  return data;
}

export async function createDeal(payload: Partial<Deal>): Promise<Deal> {
  const { data } = await api.post<Deal>("/crm/deals", payload);
  return data;
}

export async function updateDeal(
  id: string,
  patch: Partial<Deal>,
): Promise<Deal> {
  const { data } = await api.patch<Deal>(`/crm/deals/${id}`, patch);
  return data;
}

export async function moveDealStage(id: string, stage: string): Promise<Deal> {
  const { data } = await api.patch<Deal>(`/crm/deals/${id}/stage`, { stage });
  return data;
}

/**
 * Archive (soft delete) a deal.
 * Backend currently accepts `is_deleted` only if it's added to crm.service.updateDeal's
 * allowed list — flagged in backend/CRM_PATCH_NOTES.md.
 */
export async function archiveDeal(id: string): Promise<Deal> {
  return updateDeal(id, { is_deleted: true });
}
