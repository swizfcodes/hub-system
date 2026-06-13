// ── Sales dashboard ───────────────────────────────────────────────────────────

export interface SalesRevenue {
  total_amount: number;
  total_collected: number;
  invoice_count: number;
  avg_order_value: number;
  prev_period_amount?: number;
}

export interface TopProduct {
  description: string;
  product_id?: string;
  revenue: number;
  units_sold: number;
}

export interface RevenueByDay {
  date: string;
  revenue: number;
  orders: number;
}

export interface QuoteConversion {
  total_quotes: number;
  converted: number;
  conversion_rate: number;
}

export interface PaymentMethod {
  payment_method: string;
  transaction_count: number;
  total_amount: number;
}

export interface SalesDashboard {
  period: { startDate: string; endDate: string };
  revenue: SalesRevenue;
  top_products: TopProduct[];
  revenue_by_day: RevenueByDay[];
  quotations: QuoteConversion;
  payment_methods: PaymentMethod[];
}

// ── Finance dashboard ─────────────────────────────────────────────────────────

export interface IncomeVsExpense {
  income: number;
  expenses: number;
  net: number;
}

export interface ARAgeing {
  current: number;
  "1_30": number;
  "31_60": number;
  "61_90": number;
  "90plus": number;
  total: number;
  invoice_count: number;
}

export interface BankBalance {
  account_id: string;
  bank_name: string;
  account_name: string;
  running_balance: number;
}

export interface FinanceDashboard {
  period: { startDate: string; endDate: string };
  income_vs_expense: IncomeVsExpense;
  ar_ageing: ARAgeing;
  ap_summary: { total_outstanding: number; invoice_count: number };
  bank_balances: BankBalance[];
}

// ── Stock dashboard ───────────────────────────────────────────────────────────

export interface StockValue {
  total_products: number;
  total_cost_value: number;
  total_retail_value: number;
}

export interface TopMovingProduct {
  name: string;
  sku: string;
  units_out: number;
}

export interface StockDashboard {
  total_value: StockValue;
  low_stock: { low_stock_count: number };
  top_moving: TopMovingProduct[];
  location_breakdown: { location_name: string; total_units: number }[];
}

// ── Customer dashboard ────────────────────────────────────────────────────────

export interface CustomerSummary {
  total_customers: number;
  vip_count: number;
  new_this_period: number;
}

export interface TopCustomer {
  display_name: string;
  contact_id: string;
  priority_level: string;
  lifetime_value: number;
  order_count: number;
  last_order: string;
}

export interface CustomerDashboard {
  period: { startDate: string; endDate: string };
  summary: CustomerSummary;
  new_vs_returning: { new_customers: number; returning_customers: number };
  top_customers: TopCustomer[];
  pipeline_health: { stage: string; count: number; total_value: number }[];
}

// ── Logistics dashboard ───────────────────────────────────────────────────────

export interface LogisticsSummary {
  pending: number;
  in_transit: number;
  delivered: number;
  failed: number;
  returned: number;
  total_fees: number;
  avg_delivery_hours: number;
}

export interface LogisticsDashboard {
  period: { startDate: string; endDate: string };
  summary: LogisticsSummary;
  by_courier: {
    courier: string;
    total: number;
    delivered: number;
    success_rate: number;
  }[];
  active_deliveries: {
    delivery_id: string;
    delivery_number: string;
    status: string;
    contact_name: string;
  }[];
}

// ── Overview ──────────────────────────────────────────────────────────────────

export interface OverviewData {
  period: { startDate: string; endDate: string };
  revenue: { revenue: number; invoices: number };
  stock: { low_stock_alerts: number };
  deliveries: { pending_dispatch: number; failed: number };
  crm: { open_deals: number; total_value: number };
  notifications: { unread_count: number };
}

// ── Yesterday summary ─────────────────────────────────────────────────────────

export interface YesterdaySummary {
  date: string;
  revenue: number;
  invoice_count: number;
  new_customers: number;
  top_product: { name: string; units: number; revenue: number } | null;
}

// ── Today summary (live hero card) ────────────────────────────────────────────

export interface TodaySummary extends YesterdaySummary {
  transaction_count: number;
  order_count: number;
}

// ── My recent sales (cashier dashboard) ───────────────────────────────────────

export interface MyRecentSale {
  order_id: string;
  order_number: string;
  total_amount: number;
  status: string;
  created_at: string;
  customer_name: string | null;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface AppNotification {
  notification_id: string;
  type: string;
  title: string;
  body?: string | null;
  action_url?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationPreference {
  pref_id: string;
  notification_type: string;
  in_app: boolean;
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  push_enabled: boolean;
}

// ── Alert item (derived from multiple sources) ────────────────────────────────

export interface AlertItem {
  id: string;
  severity: "error" | "warn" | "info";
  label: string;
  count?: number;
  amount?: number;
  href: string;
  icon: string;
}
