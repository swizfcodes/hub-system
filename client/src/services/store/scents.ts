import { api } from "@services/api";

export interface EditableScent {
  family: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  swatch: string | null;
  ink: string | null;
  image: string | null;
  display_order: number;
  has_override: boolean;
}

export async function listEditableScents(): Promise<EditableScent[]> {
  const { data } = await api.get<{ data: EditableScent[] }>(
    "/store-admin/scents",
  );
  return data.data;
}

export async function saveScent(
  family: string,
  payload: Partial<EditableScent>,
): Promise<EditableScent> {
  const { data } = await api.put<EditableScent>(
    `/store-admin/scents/${encodeURIComponent(family)}`,
    payload,
  );
  return data;
}
