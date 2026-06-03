import { api } from "../api";
import type {
  Product,
  ProductImage,
  ProductSupplierLink,
  Barcode,
} from "@typedefs/catalogue";

export interface ProductListParams {
  search?: string;
  category_id?: string;
  include_inactive?: boolean;
  include_deleted?: boolean;
  page?: number;
  limit?: number;
}

export async function listProducts(
  params: ProductListParams = {},
): Promise<{ data: Product[] }> {
  const { data } = await api.get<{ data: Product[] }>("/catalogue/products", {
    params,
  });
  return data;
}

export async function getProduct(id: string): Promise<Product> {
  const { data } = await api.get<Product>(`/catalogue/products/${id}`);
  return data;
}

export async function createProduct(
  payload: Partial<Product>,
): Promise<Product> {
  const { data } = await api.post<Product>("/catalogue/products", payload);
  return data;
}

export async function updateProduct(
  id: string,
  patch: Partial<Product>,
): Promise<Product> {
  const { data } = await api.patch<Product>(`/catalogue/products/${id}`, patch);
  return data;
}

export async function deleteProduct(id: string): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>(
    `/catalogue/products/${id}`,
  );
  return data;
}

export async function restoreProduct(id: string): Promise<Product> {
  const { data } = await api.post<Product>(`/catalogue/products/${id}/restore`);
  return data;
}

export async function getShareUrl(id: string): Promise<ShareData> {
  const { data } = await api.get<ShareData>(
    `/catalogue/products/${id}/share-url`,
  );
  return data;
}

export interface ShareData {
  product_id: string;
  sku: string;
  name: string;
  url: string;
  published: boolean;
  price?: number | null;
  currency?: string | null;
  image_url?: string | null;
  message: string;
}

// ── Bulk import ──
export interface ImportRowOk {
  row: number;
  sku: string;
  product_id: string;
  name: string;
  warning?: string | null;
}
export interface ImportRowSkip {
  row: number;
  sku: string;
  reason: string;
}
export interface ImportRowErr {
  row: number;
  sku?: string;
  message: string;
}
export interface ImportResult {
  total: number;
  created: ImportRowOk[];
  skipped: ImportRowSkip[];
  errors: ImportRowErr[];
}

export async function importProducts(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<ImportResult>(
    "/catalogue/products/import",
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return data;
}

// ── Images ──
export async function listImages(productId: string): Promise<ProductImage[]> {
  const { data } = await api.get<{ data: ProductImage[] }>(
    `/catalogue/products/${productId}/images`,
  );
  return data.data;
}
export async function uploadImage(
  productId: string,
  file: File,
  opts: { isPrimary?: boolean; altText?: string; displayOrder?: number } = {},
): Promise<ProductImage> {
  const form = new FormData();
  form.append("file", file);
  if (opts.isPrimary) form.append("is_primary", "true");
  if (opts.altText) form.append("alt_text", opts.altText);
  if (opts.displayOrder)
    form.append("display_order", String(opts.displayOrder));
  const { data } = await api.post<ProductImage>(
    `/catalogue/products/${productId}/images`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}
export async function setPrimaryImage(imageId: string): Promise<ProductImage> {
  const { data } = await api.put<ProductImage>(
    `/catalogue/images/${imageId}/primary`,
  );
  return data;
}
export async function reorderImage(
  imageId: string,
  displayOrder: number,
): Promise<ProductImage> {
  const { data } = await api.patch<ProductImage>(
    `/catalogue/images/${imageId}`,
    { display_order: displayOrder },
  );
  return data;
}
export async function deleteImage(
  imageId: string,
): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>(
    `/catalogue/images/${imageId}`,
  );
  return data;
}

// ── Product-supplier links ──
export async function listProductSuppliers(
  productId: string,
): Promise<ProductSupplierLink[]> {
  const { data } = await api.get<{ data: ProductSupplierLink[] }>(
    `/catalogue/products/${productId}/suppliers`,
  );
  return data.data;
}
export async function linkSupplier(
  productId: string,
  payload: {
    supplier_id: string;
    supplier_sku?: string;
    unit_cost?: number;
    lead_time_days?: number;
    is_preferred?: boolean;
  },
): Promise<ProductSupplierLink> {
  const { data } = await api.put<ProductSupplierLink>(
    `/catalogue/products/${productId}/suppliers`,
    payload,
  );
  return data;
}
export async function unlinkSupplier(
  productId: string,
  supplierId: string,
): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>(
    `/catalogue/products/${productId}/suppliers/${supplierId}`,
  );
  return data;
}

// ── Barcodes ──
export async function listBarcodes(productId: string): Promise<Barcode[]> {
  const { data } = await api.get<{ data: Barcode[] }>(
    `/catalogue/products/${productId}/barcodes`,
  );
  return data.data;
}
export async function lookupBarcode(value: string): Promise<Product> {
  const { data } = await api.get<Product>(
    `/catalogue/barcodes/lookup/${encodeURIComponent(value)}`,
  );
  return data;
}
export async function addBarcode(
  productId: string,
  payload: {
    barcode_value: string;
    barcode_type?: string;
    is_primary?: boolean;
  },
): Promise<Barcode> {
  const { data } = await api.post<Barcode>(
    `/catalogue/products/${productId}/barcodes`,
    payload,
  );
  return data;
}
export async function deleteBarcode(
  barcodeId: string,
): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>(
    `/catalogue/barcodes/${barcodeId}`,
  );
  return data;
}
