// ── Enums / unions ────────────────────────────────────────────────────────────

export type DeliveryStatus =
  | "pending_dispatch"
  | "dispatched"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "failed"
  | "returned";

export type Courier = "relay" | "chowdeck" | "gigl" | "manual";

export type DeliveryZone = "lagos" | "interstate" | "international";

export type ReferenceType = "pos_transaction" | "sales_order" | "manual";

export type FeeBorneBy = "customer" | "business" | "split";

// ── Address ───────────────────────────────────────────────────────────────────

export interface DeliveryAddress {
  line1: string;
  area?: string;
  city: string;
  state: string;
  country?: string;
  landmark?: string;
  recipient_name?: string;
  phone?: string;
}

// ── Core delivery types ───────────────────────────────────────────────────────

export interface DeliveryItem {
  item_id: string;
  delivery_id: string;
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price?: number | null;
  sku?: string | null;
}

export interface TrackingEntry {
  tracking_id?: string;
  track_id?: string;
  delivery_id: string;
  status: DeliveryStatus;
  source: string;
  message?: string | null;
  occurred_at: string;
  created_at: string;
}

export interface Delivery {
  delivery_id: string;
  delivery_number: string;
  reference_type: ReferenceType;
  reference_id: string;
  contact_id: string;
  contact_name: string;
  primary_phone?: string | null;
  whatsapp_number?: string | null;
  contact_email?: string | null;
  delivery_address: DeliveryAddress;
  courier: Courier;
  courier_company?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  delivery_fee: number;
  fee_borne_by: FeeBorneBy;
  status: DeliveryStatus;
  waybill_number?: string | null;
  tracking_url?: string | null;
  failure_reason?: string | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  courier_order_id: string;
  // Signature fields
  signature_token?: string | null;
  customer_signature?: string | null;
  driver_signature?: string | null;
  customer_signed_at?: string | null;
  driver_signed_at?: string | null;
  customer_signed_name?: string | null;
  driver_signed_name?: string | null;
  customer_emailed?: boolean;
  token_expires_at?: string | null;
  signed_at?: string | null;
  // Joined
  items?: DeliveryItem[];
  tracking?: TrackingEntry[];
  is_deleted: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Courier suggestion ────────────────────────────────────────────────────────

export interface CourierSuggestion {
  courier: Courier;
  label: string;
  estimated_hours: string;
  recommended: boolean;
  fee: number | null;
  currency?: string;
  fee_error?: string;
  note?: string;
}

export interface CourierSuggestResponse {
  zone: DeliveryZone;
  options: CourierSuggestion[];
}

// ── Signing page ──────────────────────────────────────────────────────────────

export interface SigningInfo {
  delivery_number: string;
  contact_name: string;
  delivery_address: DeliveryAddress;
  items: DeliveryItem[];
  already_signed: boolean;
}

// ── API response wrappers ─────────────────────────────────────────────────────

export interface DeliveryListResponse {
  data: Delivery[];
}
