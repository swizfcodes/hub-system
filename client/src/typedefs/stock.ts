// Types mirror per-business stock schema (000008_business_stock.sql)
// + planned backend additions documented in STOCK_PATCH_NOTES.md.

// These string values MUST match the movement_type values written to the
// stock_movements table by the backend (movements.service.recordMovement and
// its callers). A mismatch silently breaks the Movement Log type filter — the
// dropdown would query a value that never exists in the ledger.
export type MovementType =
  | "received_from_supplier" // GRN / purchase receipt
  | "sold" // invoice + POS issue
  | "return_from_customer"
  | "transferred_out"
  | "transferred_in"
  | "sent_to_consignment"
  | "returned_from_consignment"
  | "consignment_sale"
  | "wholesale_out"
  | "reserved"
  | "reservation_released"
  | "write_off"
  | "sample"
  | "gift"
  | "damaged"
  | "returned_to_supplier"
  | "adjustment";

export type ReservationStatus = "active" | "released" | "converted_to_sale";
export type AdjustmentType =
  | "count"
  | "write_off"
  | "damage"
  | "found"
  | "correction";
export type TransferStatus =
  | "pending"
  | "in_transit"
  | "received"
  | "cancelled";
export type QualityCheckType =
  | "incoming"
  | "periodic"
  | "return"
  | "pre_consignment";
export type QualityResult = "pass" | "fail" | "conditional";

export interface StockMovement {
  movement_id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  movement_type: MovementType;
  quantity: number;
  direction: 1 | -1; // 1 = in, -1 = out
  from_location_id?: string | null;
  from_location_name?: string;
  to_location_id?: string | null;
  to_location_name?: string;
  reference_type?: string | null;
  reference_id?: string | null;
  unit_cost?: number | null;
  batch_number?: string | null;
  batch_id?: string | null; // backend pending — see STOCK_PATCH_NOTES §batches
  notes?: string | null;
  performed_by: string;
  performed_by_name?: string;
  performed_at: string;
}

export interface StockReservation {
  reservation_id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  quantity: number;
  reserved_for?: string | null; // contact_id
  reserved_for_name?: string;
  crm_deal_id?: string | null;
  crm_deal_title?: string;
  expires_at: string;
  status: ReservationStatus;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockAdjustment {
  adjustment_id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  location_id: string;
  location_name?: string;
  adjustment_type: AdjustmentType;
  quantity_before: number;
  quantity_after: number;
  quantity_delta: number; // computed: after - before
  reason: string;
  approved_by?: string | null;
  approved_by_name?: string;
  created_by: string;
  created_by_name?: string;
  created_at: string;
}

export interface StockTransfer {
  transfer_id: string;
  transfer_number: string;
  from_location_id: string;
  from_location_name?: string;
  to_location_id: string;
  to_location_name?: string;
  status: TransferStatus;
  notes?: string | null;
  initiated_by: string;
  initiated_by_name?: string;
  received_by?: string | null;
  received_by_name?: string;
  initiated_at: string;
  received_at?: string | null;
  lines?: StockTransferLine[]; // backend pending — currently a single-product transfer
}

export interface StockTransferLine {
  line_id: string;
  transfer_id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  quantity: number;
}

export interface QualityCheck {
  check_id: string;
  product_id: string;
  product_name?: string;
  check_type: QualityCheckType;
  result: QualityResult;
  notes?: string | null;
  checked_by: string;
  checked_by_name?: string;
  checked_at: string;
}

// ── On-hand summary (computed by backend) ──
export interface OnHandRow {
  product_id: string;
  product_sku: string;
  product_name: string;
  category_id?: string | null;
  category_name?: string | null;
  primary_image_url?: string | null;
  cost_price?: number;
  selling_price?: number;
  currency: string;
  reorder_level: number;
  reorder_quantity: number;
  on_hand: number; // sum across all locations
  reserved: number; // active reservations
  available: number; // on_hand - reserved
  by_location?: Array<{
    location_id: string;
    location_name: string;
    location_type: string;
    on_hand: number;
  }>;
  // Batch tracking
  tracks_batches?: boolean;
  oldest_expiry?: string | null; // earliest expiring batch (if any)
  // Computed flags
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  is_overstocked?: boolean;
}

export interface OnHandResponse {
  data: OnHandRow[];
  pagination?: { page: number; limit: number; total: number };
  totals?: {
    total_value: number;
    total_units: number;
    low_stock_count: number;
    out_of_stock_count: number;
  };
}

// ── Batch / Lot tracking (backend pending — see STOCK_PATCH_NOTES §batches) ──
export interface StockBatch {
  batch_id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  batch_number: string;
  manufactured_date?: string | null;
  expiry_date?: string | null;
  initial_quantity: number;
  remaining_quantity: number;
  location_id?: string | null;
  location_name?: string;
  notes?: string | null;
  created_at: string;
  // Computed
  days_to_expiry?: number | null;
  expiry_status?: "fresh" | "soon" | "critical" | "expired";
}

// ── Count Session (UI state, not a backend table) ──
// A count session is a UX wrapper around batched stock_adjustments.
// On submit we POST one or more adjustments to the backend in a single request.
export interface CountSession {
  id: string; // client-side UUID
  location_id: string;
  location_name: string;
  started_at: string;
  started_by_name: string;
  notes?: string;
  rows: CountSessionRow[];
}

export interface CountSessionRow {
  product_id: string;
  product_sku: string;
  product_name: string;
  system_count: number;
  counted: number | null; // null = not counted yet
  variance: number; // counted - system_count
  notes?: string;
}

// ── Manufacturer / SKU helpers (Catalogue extension) ──
export interface ManufacturerInfo {
  manufacturer_name?: string | null;
  manufacturer_code?: string | null;
  auto_generate_sku: boolean;
  // Resolved final SKU = `${prefix}${manufacturer_code or generated}${suffix}`
}
