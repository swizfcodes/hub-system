// ── Terminal & Session ────────────────────────────────────────────────────────

export type SessionStatus = "open" | "closed" | "reconciled";

export interface PosTerminal {
  terminal_id: string;
  name: string;
  location_id: string;
  location_name: string;
  location_type: string;
  is_active: boolean;
  // Populated when a session is open on this terminal
  session_id?: string | null;
  session_status?: SessionStatus | null;
  opened_by?: string | null;
  opened_at?: string | null;
  total_revenue?: number | null;
}

export interface PosSession {
  session_id: string;
  terminal_id: string;
  terminal_name: string;
  opened_by: string;
  opened_by_email: string;
  closed_by?: string | null;
  opened_at: string;
  closed_at?: string | null;
  opening_float: number;
  expected_cash: number;
  actual_cash?: number | null;
  cash_variance: number; // GENERATED ALWAYS AS STORED
  total_transfers: number;
  total_card: number;
  total_revenue: number;
  status: SessionStatus;
  reconciliation_notes?: string | null;
  // From join
  transaction_count?: number;
  session_revenue?: number;
}

// ── Transaction ───────────────────────────────────────────────────────────────

export type TransactionStatus = "pending" | "completed" | "voided";

export interface PosTransactionLine {
  line_id: string;
  transaction_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  vat_amount: number;
  line_total: number;
  display_order: number;
}

export interface PosPaymentSplit {
  split_id: string;
  transaction_id: string;
  payment_method: POSPaymentMethod;
  amount: number;
  reference?: string | null;
  paystack_reference?: string | null;
  confirmed: boolean;
}

export interface PosTransaction {
  transaction_id: string;
  transaction_number: string;
  offline_id?: string | null;
  session_id: string;
  contact_id?: string | null;
  contact_name?: string | null;
  primary_phone?: string | null;
  served_by: string;
  subtotal: number;
  discount_total: number;
  vat_amount: number;
  total_amount: number;
  amount_paid: number;
  change_given: number;
  fulfilment_type: "walk_in" | "dispatch";
  status: TransactionStatus;
  voided_by?: string | null;
  void_reason?: string | null;
  receipt_number?: string | null;
  created_at: string;
  lines?: PosTransactionLine[];
  payments?: PosPaymentSplit[];
}

// ── Cart (local state) ────────────────────────────────────────────────────────

export type POSPaymentMethod =
  | "cash"
  | "pos_card"
  | "bank_transfer";

export interface CartLine {
  id: string; // local UUID — not a DB ID
  product_id: string;
  description: string;
  unit_price: number; // actual price being charged
  selling_price: number; // catalogue price (reference)
  min_price: number; // min_selling_price
  quantity: number;
  discount_amount: number;
  line_total: number; // computed: (unit_price × qty) - discount_amount
  needs_approval: boolean; // true if unit_price < min_price
  stock_qty: number; // current available qty
  low_stock: boolean;
}

export interface PaymentSplitInput {
  id: string; // local UUID
  method: POSPaymentMethod;
  amount: number;
  reference?: string;
  paystack_ref?: string;
}

export interface OrderDiscount {
  type: "percentage" | "fixed";
  value: number;
}

export interface CartTotals {
  line_subtotal: number;
  order_disc_amt: number;
  loyalty_disc_amt: number;
  net_after_disc: number;
  vat: number;
  total: number;
}

// ── Parked transaction (local-only) ───────────────────────────────────────────

export interface ParkedTransaction {
  park_id: string;
  parked_at: string;
  customer: import("@typedefs/contacts").Contact | null;
  lines: CartLine[];
  order_discount: OrderDiscount | null;
  loyalty_info: import("@typedefs/loyalty").LoyaltyInfo | null;
  loyalty_disc: number;
  label?: string; // e.g. "Customer 1"
}

// ── Offline pending transaction ───────────────────────────────────────────────

export type SyncStatus = "pending" | "syncing" | "synced" | "conflict";

export interface PendingTransaction {
  offline_id: string;
  session_id: string;
  contact_id?: string;
  change_handling?: "return" | "keep";
  apply_vat?: boolean;
  lines: OfflineTransactionLine[];
  payments: OfflinePaymentSplit[];
  created_at_offline: string;
  sync_status: SyncStatus;
  conflict_type?:
    | "out_of_stock"
    | "session_closed"
    | "duplicate"
    | "validation"
    | "network_error";
  conflict_message?: string;
}

export interface OfflineTransactionLine {
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
}

export interface OfflinePaymentSplit {
  payment_method: POSPaymentMethod;
  amount: number;
  reference?: string;
}

// ── Product cache ─────────────────────────────────────────────────────────────

export interface POSProduct {
  product_id: string;
  sku: string;
  name: string;
  selling_price: number;
  min_selling_price: number;
  category_id: string | null;
  is_active: boolean;
  // Populated from stock cache
  available_qty?: number;
}

export interface POSCategory {
  category_id: string;
  name: string;
  display_order: number;
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface XReport {
  report_type: "X";
  session_id: string;
  terminal_name: string;
  opened_at: string;
  opened_by: string;
  snapshot_time: string;
  transactions: { total: number; voided: number; completed: number };
  revenue: {
    cash_total: number;
    transfer_total: number;
    card_total: number;
    total_revenue: number;
  };
  cash_drawer: {
    opening_float: number;
    cash_sales: number;
    expected_cash_on_hand: number;
  };
}

export interface ZReport extends Omit<
  XReport,
  "report_type" | "snapshot_time" | "cash_drawer"
> {
  report_type: "Z";
  closed_at: string;
  cash_drawer: {
    opening_float: number;
    expected_cash: number;
    actual_cash: number;
    variance: number;
    variance_pct: number;
    status: "balanced" | "minor_short" | "minor_over" | "short" | "over";
  };
  reconciliation_notes?: string | null;
}

// ── Sync response ─────────────────────────────────────────────────────────────

export interface SyncResult {
  offline_id: string;
  success: boolean;
  transaction_id?: string;
  transaction_number?: string;
  error?: string;
  conflict_type?: PendingTransaction["conflict_type"];
}

export interface SyncResponse {
  results: SyncResult[];
  total: number;
  succeeded: number;
  failed: number;
}
