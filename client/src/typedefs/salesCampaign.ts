// ── typedefs/salesCampaign.ts ─────────────────────────────────────────────────

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "live"
  | "expired"
  | "archived";
export type CampaignTemplate = "minimal" | "editorial" | "bold";
export type DiscountType = "percentage" | "fixed_amount" | "none";
export type PaymentMethod = "paystack" | "bank_transfer";
export type FulfilmentType = "delivery" | "pickup";

export interface CampaignSections {
  hero: boolean;
  countdown: boolean;
  products: boolean;
  inquiry_form: boolean;
  whatsapp_button: boolean;
  stock_indicator: boolean;
}

export interface CampaignProduct {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  description?: string | null;
  image_url?: string | null;
  selling_price: number;
  campaign_price?: number | null;
  effective_price: number;
  campaign_label?: string | null;
  quantity_available: number;
  show_stock_count: boolean;
  low_stock_threshold: number;
  display_order: number;
  // cart state (frontend only)
  cartQuantity?: number;
}

export interface CampaignBankAccount {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  sort_code?: string | null;
  is_primary: boolean;
}

export interface SalesCampaign {
  campaign_id: string;
  campaign_name: string;
  slug: string;
  template: CampaignTemplate;
  status: CampaignStatus;
  headline?: string | null;
  subheadline?: string | null;
  body_copy?: string | null;
  hero_image_url?: string | null;
  accent_color?: string | null;
  discount_type?: DiscountType | null;
  discount_value?: number | null;
  sections: CampaignSections;
  start_date?: string | null;
  end_date?: string | null;
  is_evergreen: boolean;
  whatsapp_number?: string | null;
  inquiry_email?: string | null;
  store_location?: string | null;
  redirect_url?: string | null;
  qr_code_url?: string | null;
  products?: CampaignProduct[];
  bank_accounts?: CampaignBankAccount[];
  // admin stats
  order_count?: number;
  confirmed_revenue?: number;
  product_count?: number;
  created_at: string;
}

export interface CartItem {
  campaign_product_id: string;
  product_id: string;
  product_name: string;
  image_url?: string | null;
  quantity: number;
  unit_price: number; // price charged (after discount)
  list_price?: number; // original price before discount (for strike-through)
  line_total: number;
}

export interface CheckoutForm {
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  fulfilment_type: FulfilmentType;
  delivery_address?: {
    line1: string;
    area?: string;
    city: string;
    state: string;
    landmark?: string;
  };
  payment_method: PaymentMethod;
  bank_account_id?: string;
}

export interface CampaignOrderResult {
  order_id: string;
  order_number: string;
  tracking_token: string;
  total_amount: number;
  payment_method: PaymentMethod;
  paystack_url?: string | null;
  status: string;
}

export interface OrderTracking {
  order_number: string;
  status: string;
  status_message: string;
  fulfilment_type: FulfilmentType;
  pickup_location?: string | null;
  total_amount: number;
  items: { product_name: string; quantity: number; line_total: number }[];
  created_at: string;
}

export interface CampaignAnalytics {
  page_views: number;
  unique_visitors: number;
  whatsapp_taps: number;
  form_submits: number;
  orders_placed: number;
  by_source: Record<string, number>;
}
