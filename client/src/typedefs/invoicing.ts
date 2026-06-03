// ── Enums / unions ────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "voided";

export type InvoiceType = "standard" | "proforma" | "retail_partner_settlement";

export type InvoicePaymentMethod =
  | "bank_transfer"
  | "pos_card"
  | "cash"
  | "paystack"
  | "flutterwave";

export type CreditNoteStatus = "draft" | "issued" | "applied" | "refunded";

// ── Core invoice types ────────────────────────────────────────────────────────

export interface InvoiceLine {
  line_id: string;
  invoice_id: string;
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  vat_rate: number;
  vat_amount: number;
  line_total: number;
  display_order: number;
}

export interface InvoicePayment {
  payment_id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method: InvoicePaymentMethod;
  reference?: string | null;
  paystack_reference?: string | null;
  flutterwave_reference?: string | null;
  is_confirmed: boolean;
  confirmed_at?: string | null;
  recorded_by?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface Invoice {
  invoice_id: string;
  invoice_number: string;
  invoice_type: InvoiceType;
  contact_id: string;
  contact_name: string;
  email?: string | null;
  primary_phone?: string | null;
  whatsapp_number?: string | null;
  order_id?: string | null;
  pos_transaction_id?: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  subtotal: number;
  discount_total: number;
  vat_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_outstanding: number;
  currency: string;
  notes?: string | null;
  payment_instructions?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  is_deleted: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Joined from aggregates (only on getById)
  lines?: InvoiceLine[];
  payments?: InvoicePayment[];
}

// ── Credit notes ──────────────────────────────────────────────────────────────

export interface CreditNoteLine {
  line_id: string;
  credit_note_id: string;
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface CreditNote {
  credit_note_id: string;
  credit_note_number: string;
  invoice_id: string;
  invoice_number: string;
  contact_id: string;
  contact_name: string;
  reason: string;
  total_amount: number;
  status: CreditNoteStatus;
  issued_at?: string | null;
  document_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  lines?: CreditNoteLine[];
}

// ── KPIs & aging ──────────────────────────────────────────────────────────────

export interface InvoiceKpis {
  total_outstanding: number;
  total_overdue: number;
  collected_this_month: number;
  bucket_current: number;
  bucket_1_30: number;
  bucket_31_60: number;
  bucket_61_90: number;
  bucket_90_plus: number;
}

// ── API response wrappers ─────────────────────────────────────────────────────

export interface InvoiceListResponse {
  data: Invoice[];
}

export interface CreditNoteListResponse {
  data: CreditNote[];
}
