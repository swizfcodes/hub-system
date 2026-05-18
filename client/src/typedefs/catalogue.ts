// Types mirror per-business catalogue schema (000007_business_catalogue.sql).

export type LocationType = 'warehouse' | 'showroom' | 'pos_terminal' | 'retail_partner' | 'transit';
export type BarcodeType = 'CODE128' | 'EAN13' | 'QR' | 'UPC' | 'custom' | string;

export interface ProductCategory {
  category_id: string;
  name: string;
  parent_category_id?: string | null;
  description?: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  image_id: string;
  product_id: string;
  document_id: string;
  url?: string;          // resolved at API
  is_primary: boolean;
  display_order: number;
  alt_text?: string | null;
  created_at: string;
}

export interface ProductSupplierLink {
  product_id: string;
  supplier_id: string;
  supplier_name?: string;
  supplier_sku?: string | null;
  unit_cost?: number | null;
  lead_time_days?: number | null;
  is_preferred: boolean;
  created_at: string;
}

export interface Barcode {
  barcode_id: string;
  product_id: string;
  barcode_value: string;
  barcode_type: BarcodeType;
  is_primary: boolean;
  created_at: string;
}

export interface StockLocation {
  location_id: string;
  name: string;
  location_type: LocationType;
  partner_id?: string | null;
  address?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  product_id: string;
  sku: string;
  name: string;
  description?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  cost_price: number;
  selling_price: number;
  min_selling_price?: number | null;
  currency: string;
  weight_grams?: number | null;
  barcode?: string | null;
  primary_barcode?: Barcode;
  custom_fields: Record<string, unknown>;
  supplier_cert_number?: string | null;
  reorder_level: number;
  reorder_quantity: number;
  is_active: boolean;
  is_deleted: boolean;
  primary_image_url?: string | null;
  // Joined on getProduct:
  images?: ProductImage[];
  suppliers?: ProductSupplierLink[];
  barcodes?: Barcode[];
  // ── Backend gap (not in schema yet) — front-end keeps these optional fields
  // and renders a notice when null. PROCUREMENT_PATCH_NOTES.md §accounting.
  income_account_id?: string | null;
  inventory_account_id?: string | null;
  cogs_account_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductListResponse {
  data: Product[];
  pagination?: { page: number; limit: number; total: number };
}
