import { api } from "@services/api";

// Storefront "formats" cards (store.signatures). Full CRUD — pre-seeded
// from the storefront's current four formats (migration 000049).

export interface StoreSignature {
  slug: string;
  name: string;
  size_label: string;
  price_label: string;
  blurb: string;
  image: string | null;
  display_order: number;
}

export type NewSignature = Omit<StoreSignature, "slug"> & { slug?: string };

export async function listSignatures(): Promise<StoreSignature[]> {
  const { data } = await api.get<{ data: StoreSignature[] }>(
    "/store-admin/signatures",
  );
  return data.data;
}

export async function createSignature(
  payload: NewSignature,
): Promise<StoreSignature> {
  const { data } = await api.post<StoreSignature>(
    "/store-admin/signatures",
    payload,
  );
  return data;
}

export async function updateSignature(
  slug: string,
  payload: Partial<StoreSignature>,
): Promise<StoreSignature> {
  const { data } = await api.put<StoreSignature>(
    `/store-admin/signatures/${encodeURIComponent(slug)}`,
    payload,
  );
  return data;
}

export async function deleteSignature(
  slug: string,
): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>(
    `/store-admin/signatures/${encodeURIComponent(slug)}`,
  );
  return data;
}
