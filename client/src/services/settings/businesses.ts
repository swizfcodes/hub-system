import { api } from "../api";
import type { Business, BusinessCreatePayload } from "@typedefs/settings";

export async function listBusinesses(
  includeInactive = false,
): Promise<Business[]> {
  const { data } = await api.get<Business[]>("/settings/businesses", {
    params: { includeInactive },
  });
  return data;
}

export async function getBusiness(key: string): Promise<Business> {
  const { data } = await api.get<Business>(`/settings/businesses/${key}`);
  return data;
}

export async function createBusiness(
  payload: BusinessCreatePayload,
): Promise<Business> {
  const { data } = await api.post<Business>("/settings/businesses", payload);
  return data;
}

export async function updateBusiness(
  key: string,
  patch: Partial<Business>,
): Promise<Business> {
  const { data } = await api.patch<Business>(
    `/settings/businesses/${key}`,
    patch,
  );
  return data;
}

export async function deactivateBusiness(
  key: string,
): Promise<{ business_key: string; is_active: boolean }> {
  const { data } = await api.delete(`/settings/businesses/${key}`);
  return data;
}
