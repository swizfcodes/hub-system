import { api } from "../api";
import type { CustomField, EntityType } from "@typedefs/settings";

export async function listCustomFields(
  params: {
    business?: string;
    entity_type?: EntityType;
    activeOnly?: boolean;
  } = {},
): Promise<CustomField[]> {
  const { data } = await api.get<CustomField[]>("/settings/custom-fields", {
    params,
  });
  return data;
}
export async function createCustomField(
  payload: Partial<CustomField>,
): Promise<CustomField> {
  const { data } = await api.post<CustomField>(
    "/settings/custom-fields",
    payload,
  );
  return data;
}
export async function updateCustomField(
  id: string,
  patch: Partial<CustomField>,
): Promise<CustomField> {
  const { data } = await api.patch<CustomField>(
    `/settings/custom-fields/${id}`,
    patch,
  );
  return data;
}
export async function deleteCustomField(
  id: string,
): Promise<{ field_id: string; is_active: boolean }> {
  const { data } = await api.delete(`/settings/custom-fields/${id}`);
  return data;
}
