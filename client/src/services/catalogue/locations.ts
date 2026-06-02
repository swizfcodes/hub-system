import { api } from "../api";
import type { StockLocation } from "@typedefs/catalogue";

export async function listLocations(
  includeInactive = false,
): Promise<StockLocation[]> {
  const { data } = await api.get<{ data: StockLocation[] }>(
    "/catalogue/locations",
    { params: { include_inactive: includeInactive } },
  );
  return data.data;
}
export async function createLocation(
  payload: Partial<StockLocation>,
): Promise<StockLocation> {
  const { data } = await api.post<StockLocation>(
    "/catalogue/locations",
    payload,
  );
  return data;
}
export async function updateLocation(
  id: string,
  patch: Partial<StockLocation>,
): Promise<StockLocation> {
  const { data } = await api.patch<StockLocation>(
    `/catalogue/locations/${id}`,
    patch,
  );
  return data;
}
export async function deleteLocation(
  id: string,
): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>(
    `/catalogue/locations/${id}`,
  );
  return data;
}
