// Types mirror per-business purchasing schema (000014_business_purchasing.sql).

export type RFQStatus = 'draft' | 'sent' | 'responses_received' | 'closed' | 'cancelled';
export type POStatus = 'draft' | 'sent' | 'acknowledged' | 'partially_received' | 'received' | 'invoiced' | 'paid' | 'cancelled';
export type QuoteStatus = 'received' | 'accepted' | 'rejected';
export type QualityStatus = 'pending' | 'accepted' | 'partially_rejected' | 'rejected';
export type BillStatus = 'pending' | 'matched' | 'approved' | 'paid' | 'disputed';

export interface Supplier {
  supplier_id: string;
  contact_id: string;
  supplier_code: string;
  payment_terms_days: number;
  preferred_currency: string;
  lead_time_days?: number | null;
  portal_access_token?: string | null;
  rating: number;             // 1-5
  credit_limit?: number;
  is_active: boolean;
  notes?: string | null;
  // Joined from contacts
  display_name?: string;
  email?: string | null;
  primary_phone?: string;
  addresses?: unknown[];
  created_at: string;
  updated_at: string;
}

export interface RFQLine {
  line_id: string;
  rfq_id: string;
  product_id?: string | null;
  product_name?: string;        // joined
  product_sku?: string;
  description: string;
  quantity_needed: number;
  target_price?: number | null;
  notes?: string | null;
}

export interface RFQ {
  rfq_id: string;
  rfq_number: string;
  title: string;
  status: RFQStatus;
  response_deadline?: string | null;
  notes?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined
  lines?: RFQLine[];
  invited_suppliers?: Supplier[];
  quote_count?: number;
}

export interface SupplierQuote {
  quote_id: string;
  rfq_id: string;
  supplier_id: string;
  supplier_name?: string;
  rfq_line_id?: string | null;
  unit_price: number;
  currency: string;
  lead_time_days?: number | null;
  valid_until?: string | null;
  notes?: string | null;
  status: QuoteStatus;
  created_at: string;
  // Computed (frontend):
  weighted_score?: number;
  is_recommended?: boolean;
}

export interface POLine {
  line_id: string;
  po_id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_price: number;
  line_total: number;
  tracking_number?: string | null;
}

export interface PurchaseOrder {
  po_id: string;
  po_number: string;
  supplier_id: string;
  supplier_name?: string;
  rfq_id?: string | null;
  status: POStatus;
  order_date: string;
  expected_delivery?: string | null;
  delivery_address?: string | null;
  subtotal: number;
  shipping_cost: number;
  import_duty: number;
  other_charges: number;
  total_amount: number;
  currency: string;
  exchange_rate?: number | null;
  ngn_equivalent?: number | null;
  notes?: string | null;
  document_id?: string | null;
  created_by: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  lines?: POLine[];
}

export interface GoodsReceiptLine {
  gr_line_id: string;
  receipt_id: string;
  po_line_id: string;
  product_name?: string;
  product_sku?: string;
  quantity_received: number;
  quantity_accepted: number;
  quantity_rejected: number;
  rejection_reason?: string | null;
  quality_status: QualityStatus;
}

export interface GoodsReceipt {
  receipt_id: string;
  po_id: string;
  received_date: string;
  received_by: string;
  warehouse_location_id?: string | null;
  notes?: string | null;
  created_at: string;
  lines?: GoodsReceiptLine[];
}

export interface SupplierInvoice {
  sup_invoice_id: string;
  supplier_id: string;
  supplier_name?: string;
  po_id?: string | null;
  po_number?: string;
  supplier_invoice_number: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  currency: string;
  amount_ngn?: number | null;
  status: BillStatus;
  amount_paid: number;
  paid_at?: string | null;
  document_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// Best-value scoring weights (Q5 answer B+C)
export interface QuoteScoreWeights {
  price: number;          // 0-1
  lead_time: number;
  supplier_rating: number;
  payment_terms: number;
  delivery_history: number;
}

export const DEFAULT_SCORE_WEIGHTS: QuoteScoreWeights = {
  price: 0.50,
  lead_time: 0.20,
  supplier_rating: 0.15,
  payment_terms: 0.10,
  delivery_history: 0.05,
};
