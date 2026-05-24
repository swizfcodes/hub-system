// Types mirror the per-business sales schema (000010 + 000011 + 000012)
// plus invoice payment link columns from 000013.

// ── Enums ─────────────────────────────────────────────────────────────────────

export type QuoteStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'confirmed'
  | 'expired'
  | 'cancelled';

export type OrderStatus =
  | 'confirmed'
  | 'partially_fulfilled'
  | 'fulfilled'
  | 'awaiting_dispatch'
  | 'cancelled';

export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'voided';

export type ReceiptStatus = 'issued' | 'voided';

export type FulfilmentType = 'walk_in' | 'delivery';

export type PaymentMethod =
  | 'bank_transfer'
  | 'pos_card'
  | 'cash'
  | 'paystack'
  | 'stripe';

export type DiscountType = 'percentage' | 'fixed';

export type DiscountApprovalStatus = 'pending' | 'approved' | 'rejected';

export type SendChannel = 'email' | 'whatsapp';

// ── Line items ─────────────────────────────────────────────────────────────────

export interface QuotationLine {
  line_id: string;
  quotation_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  discount_amount: number;
  line_total: number;
  display_order: number;
}

export interface OrderLine {
  line_id: string;
  order_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  status: 'pending' | 'fulfilled' | 'cancelled';
}

export interface InvoiceLine {
  line_id: string;
  invoice_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  vat_rate: number;
  vat_amount: number;
  line_total: number;
  display_order: number;
}

// ── Core entities ──────────────────────────────────────────────────────────────

export interface Quotation {
  quotation_id: string;
  quotation_number: string;
  contact_id: string;
  contact_name?: string;
  email?: string | null;
  whatsapp_number?: string | null;
  primary_phone?: string | null;
  deal_id?: string | null;
  assigned_to?: string | null;
  status: QuoteStatus;
  valid_until: string;
  subtotal: number;
  discount_total: number;
  vat_amount: number;
  total_amount: number;
  currency: string;
  payment_terms?: string | null;
  notes?: string | null;
  terms_conditions?: string | null;
  sent_at?: string | null;
  confirmed_at?: string | null;
  created_by?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  lines?: QuotationLine[];
  // Derived — from discount_approvals join
  has_pending_approval?: boolean;
}

export interface SalesOrder {
  order_id: string;
  order_number: string;
  quotation_id?: string | null;
  quotation_number?: string | null;
  contact_id: string;
  contact_name?: string;
  primary_phone?: string | null;
  deal_id?: string | null;
  status: OrderStatus;
  fulfilment_type: FulfilmentType;
  total_amount: number;
  amount_paid: number;
  amount_outstanding: number;  // GENERATED ALWAYS AS STORED — never write
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  lines?: OrderLine[];
  // Populated when fetched with joins
  invoice_id?: string | null;
  invoice_number?: string | null;
  invoice_status?: InvoiceStatus | null;
}

export interface InvoicePayment {
  payment_id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  reference?: string | null;
  paystack_reference?: string | null;
  is_confirmed: boolean;
  recorded_by?: string | null;
  notes?: string | null;
}

export interface Invoice {
  invoice_id: string;
  invoice_number: string;
  invoice_type: string;
  contact_id: string;
  contact_name?: string;
  email?: string | null;
  whatsapp_number?: string | null;
  primary_phone?: string | null;
  order_id?: string | null;
  order_number?: string | null;
  deal_id?: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  subtotal: number;
  discount_total: number;
  vat_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_outstanding: number;  // GENERATED ALWAYS AS STORED — never write
  currency: string;
  notes?: string | null;
  payment_instructions?: string | null;
  paystack_payment_url?: string | null;
  stripe_payment_url?: string | null;
  paystack_reference?: string | null;
  stripe_payment_intent_id?: string | null;
  sent_at?: string | null;
  created_by?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  lines?: InvoiceLine[];
  payments?: InvoicePayment[];
}

export interface Receipt {
  receipt_id: string;
  receipt_number: string;
  invoice_id: string;
  invoice_number?: string;
  payment_id?: string | null;
  contact_id: string;
  contact_name?: string;
  order_id?: string | null;
  deal_id?: string | null;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  payment_reference?: string | null;
  notes?: string | null;
  issued_at: string;
  issued_by?: string | null;
  is_voided: boolean;
  voided_at?: string | null;
  void_reason?: string | null;
  created_at: string;
}

export interface DiscountApproval {
  approval_id: string;
  reference_type: 'quotation' | 'pos_transaction';
  reference_id: string;
  product_id: string;
  requested_price: number;
  min_price: number;
  requested_by: string;
  reviewed_by?: string | null;
  status: DiscountApprovalStatus;
  review_notes?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

// ── KPI ───────────────────────────────────────────────────────────────────────

export interface SalesKpis {
  pipeline_value: number;
  open_quotes: number;
  confirmed_this_month: number;
  overdue_invoices: number;
  revenue_this_month: number;
  avg_order_value: number;
}

// ── List response envelopes ───────────────────────────────────────────────────

export interface SalesListResponse<T> {
  data: T[];
  total?: number;
}

// ── Form input shapes (used in QuoteFormModal wizard) ─────────────────────────

export interface QuoteLineInput {
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
}
