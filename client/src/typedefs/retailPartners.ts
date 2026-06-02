// ── typedefs/retailPartners.ts ────────────────────────────────────────────────
// Shared types for the Retail Partners / Consignment module.
// Derived from the constants META maps, zod schemas, and service responses.

export type ArrangementType = "consignment" | "wholesale" | "both";

export type ConsignmentStatus =
  | "active"
  | "partially_returned"
  | "fully_settled"
  | "recalled";

export type SettlementStatus = "draft" | "sent" | "paid";

export type SettlementCycle = "weekly" | "biweekly" | "monthly";

export interface PartnerBalance {
  current_balance: number;
  outstanding_balance: number;
  credit_used?: number;
}

// ── Core partner record ───────────────────────────────────────────────────────
export interface RetailPartner {
  partner_id: string;
  partner_code: string;
  contact_id: string;
  display_name: string;
  company_name?: string | null;
  email?: string | null;
  primary_phone?: string | null;
  arrangement_type: ArrangementType;
  consignment_margin_pct?: number;
  wholesale_discount_pct?: number;
  payment_terms_days: number;
  settlement_cycle: SettlementCycle;
  credit_limit: number;
  current_balance: number;
  outstanding_balance?: number;
  balance?: PartnerBalance;
  units_held?: number;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  // Optional embedded dashboard rollup returned by GET /retail-partners/:id
  dashboard?: PartnerDashboard;
}

export interface PartnerDashboard {
  units_held?: number;
  stock_value?: number;
  outstanding_balance?: number;
  sales_this_period?: number;
  last_settlement_date?: string | null;
}

// ── Overview row (GET /retail-partners/overview) ──────────────────────────────
export interface PartnerOverview {
  partner_id: string;
  partner_code: string;
  name: string;
  display_name?: string;
  company_name?: string | null;
  arrangement_type: ArrangementType;
  units_held: number;
  outstanding_balance: number;
  settlement_cycle: SettlementCycle;
  is_active: boolean;
}

// ── Consignment stock line ────────────────────────────────────────────────────
export interface ConsignmentStock {
  consignment_id: string;
  partner_id: string;
  product_id: string;
  product_name?: string;
  variant_id?: string | null;
  sku?: string;
  units_sent?: number;
  units_held: number;
  units_sold?: number;
  units_returned?: number;
  quantity_sent?: number;
  quantity_sold?: number;
  quantity_outstanding: number;
  unit_cost?: number;
  agreed_price?: number;
  selling_price: number;
  status: ConsignmentStatus;
  sent_at?: string;
  sent_date?: string;
  name?: string;
}

// ── Reported partner sale ─────────────────────────────────────────────────────
export interface ConsignmentSale {
  sale_id: string;
  partner_id: string;
  consignment_id?: string;
  product_id?: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
  sale_amount: number;
  net_amount?: number;
  vat_amount?: number;
  sold_at?: string;
  period_start?: string;
  period_end?: string;
  settlement_id?: string | null;
}

// ── Partner settlement ────────────────────────────────────────────────────────
export interface PartnerSettlement {
  settlement_id: string;
  settlement_number?: string;
  partner_id: string;
  partner_name?: string;
  reference?: string;
  period_start: string;
  period_end: string;
  gross_amount: number;
  margin_amount?: number;
  net_payable: number;
  amount?: number;
  status: SettlementStatus;
  created_at?: string;
  sent_at?: string | null;
  paid_at?: string | null;
  lines?: ConsignmentSale[];
}
