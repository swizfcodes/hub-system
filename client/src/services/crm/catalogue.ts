import { api } from "../api";
import type {
  Product,
  ProductListResponse,
  ProductCategory,
} from "@typedefs/catalogue";

export interface ProductListParams {
  search?: string;
  category_id?: string;
  include_inactive?: boolean;
  page?: number;
  limit?: number;
}

export async function listProducts(
  params: ProductListParams = {},
): Promise<ProductListResponse> {
  const { data } = await api.get<ProductListResponse | { data: Product[] }>(
    "/catalogue/products",
    { params },
  );
  if ("pagination" in data) return data as ProductListResponse;
  return { data: (data as { data: Product[] }).data };
}

export async function getProduct(id: string): Promise<Product> {
  const { data } = await api.get<Product>(`/catalogue/products/${id}`);
  return data;
}

export async function listCategories(): Promise<ProductCategory[]> {
  const { data } = await api.get<
    { data: ProductCategory[] } | ProductCategory[]
  >("/catalogue/categories");
  return Array.isArray(data) ? data : data.data;
}
