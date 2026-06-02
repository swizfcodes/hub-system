import { api } from "../api";
import type { ProductCategory } from "@typedefs/catalogue";

export async function listCategories(
  includeInactive = false,
): Promise<ProductCategory[]> {
  const { data } = await api.get<{ data: ProductCategory[] }>(
    "/catalogue/categories",
    {
      params: { include_inactive: includeInactive },
    },
  );
  return data.data;
}
export async function getCategory(id: string): Promise<ProductCategory> {
  const { data } = await api.get<ProductCategory>(
    `/catalogue/categories/${id}`,
  );
  return data;
}
export async function createCategory(
  payload: Partial<ProductCategory>,
): Promise<ProductCategory> {
  const { data } = await api.post<ProductCategory>(
    "/catalogue/categories",
    payload,
  );
  return data;
}
export async function updateCategory(
  id: string,
  patch: Partial<ProductCategory>,
): Promise<ProductCategory> {
  const { data } = await api.patch<ProductCategory>(
    `/catalogue/categories/${id}`,
    patch,
  );
  return data;
}
export async function deleteCategory(
  id: string,
): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>(
    `/catalogue/categories/${id}`,
  );
  return data;
}
