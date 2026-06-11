// Types mirror per-business CRM schema (000009_business_crm.sql).

export type DealStage = string; // free-form to support per-business pipeline_stage_defs
export type DealSource =
  | "walk_in"
  | "referral"
  | "social_media"
  | "repeat"
  | "campaign"
  | "website"
  | "event"
  | string;

export interface Deal {
  deal_id: string;
  contact_id: string;
  contact_name?: string;
  assigned_to?: string | null;
  assigned_to_email?: string | null;
  title: string;
  stage: DealStage;
  expected_value?: number | null;
  probability: number; // 0-100
  expected_close_date?: string | null;
  source?: DealSource | null;
  lost_reason?: string | null;
  won_at?: string | null;
  lost_at?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  // Joined on findDealById:
  email?: string | null;
  primary_phone?: string;
  whatsapp_number?: string | null;
  priority_level?: "vip" | "regular" | "new";
  activities?: DealActivity[];
  notes?: DealNote[];
}

export type ActivityType =
  | "call"
  | "message"
  | "email"
  | "store_visit"
  | "quotation_sent"
  | "invoice_sent"
  | "payment_received"
  | "note"
  | "stage_change";

export interface DealActivity {
  activity_id: string;
  deal_id?: string | null;
  contact_id: string;
  activity_type: ActivityType;
  summary: string;
  direction?: "inbound" | "outbound" | null;
  performed_by?: string | null;
  performed_at: string;
  is_auto: boolean;
}

export interface DealNote {
  note_id: string;
  deal_id?: string | null;
  contact_id: string;
  content: string;
  is_pinned: boolean;
  created_by?: string | null;
  created_by_email?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineStageWithDeals {
  stage_key: string;
  stage_label: string;
  colour: string;
  display_order: number;
  is_terminal: boolean;
  deals: Array<
    Pick<
      Deal,
      | "deal_id"
      | "title"
      | "stage"
      | "expected_value"
      | "probability"
      | "expected_close_date"
      | "updated_at"
      | "contact_name"
      | "priority_level"
    >
  >;
  total_value: number;
}

export interface PipelineResponse {
  pipeline: PipelineStageWithDeals[];
}

// ── Clients workspace ──
// Computed per business from invoice history + crm_settings thresholds.

export type ClientSegment =
  | "new"
  | "active"
  | "lapsed"
  | "big_spender"
  | "prospect";

export interface ClientSummary {
  contact_id: string;
  display_name: string;
  company_name?: string | null;
  primary_phone?: string | null;
  whatsapp_number?: string | null;
  email?: string | null;
  priority_level?: "vip" | "regular" | "new";
  source?: string | null;
  created_at: string;
  is_vip: boolean;
  is_big_spender: boolean;
  segment: ClientSegment;
  next_birthday?: string | null;
  total_spend: string | number;
  purchase_count: number;
  last_purchase_at?: string | null;
  first_purchase_at?: string | null;
  loyalty_points: number;
}

export interface ClientListResponse {
  data: ClientSummary[];
  pagination: { page: number; limit: number; total: number };
}

export interface ClientInsights {
  avg_basket: number | null;
  purchase_cadence_days: number | null;
  days_since_last_purchase: number | null;
  due_for_visit: boolean;
  top_categories: Array<{ category: string; total: string | number }>;
  open_balance: number;
  overdue_invoices: number;
}

export interface ClientDealSummary {
  deal_id: string;
  title: string;
  stage: string;
  expected_value?: number | string | null;
  expected_close_date?: string | null;
  created_at: string;
  is_terminal?: boolean | null;
}

export interface ClientProfileData extends ClientSummary {
  deals: ClientDealSummary[];
  preferences: CustomerPreference[];
  milestones: CustomerMilestone[];
  tags: Array<{ tag_id: string; tag_name: string; colour?: string | null }>;
  insights: ClientInsights;
}

export interface ClientPurchase {
  invoice_id: string;
  invoice_number: string;
  invoice_type: string;
  status: string;
  issue_date: string;
  total_amount: string | number;
  amount_paid: string | number;
  amount_outstanding: string | number;
  currency: string;
  item_count: number;
  summary?: string | null;
}

export interface TodayPerson {
  contact_id: string;
  display_name: string;
  primary_phone?: string | null;
  whatsapp_number?: string | null;
  is_vip?: boolean;
  segment?: ClientSegment;
}

export interface TodayFeed {
  birthdays: Array<TodayPerson & { next_birthday: string; days_away: number }>;
  milestones: Array<
    TodayPerson & {
      milestone_id: string;
      milestone_type: MilestoneType;
      next_date: string;
      notes?: string | null;
    }
  >;
  to_welcome: Array<
    TodayPerson & {
      source?: string | null;
      created_at: string;
      first_purchase_at?: string | null;
      total_spend: string | number;
    }
  >;
  lapsed: Array<
    TodayPerson & {
      total_spend: string | number;
      last_purchase_at: string;
      days_silent: number;
    }
  >;
  top_this_month: Array<
    TodayPerson & {
      spend_this_month: string | number;
      purchases_this_month: number;
    }
  >;
  stale_deals: Array<{
    deal_id: string;
    title: string;
    stage: string;
    expected_value?: string | number | null;
    contact_id: string;
    display_name: string;
    days_quiet: number;
  }>;
  overdue_invoices: Array<{
    invoice_id: string;
    invoice_number: string;
    contact_id: string;
    display_name: string;
    due_date: string;
    amount_outstanding: string | number;
    days_overdue: number;
  }>;
}

export interface CrmClientSettings {
  lapsed_days: number;
  new_customer_days: number;
  big_spender_threshold: string | number;
  birthday_window_days: number;
  stale_deal_days: number;
  updated_at: string;
}

// ── Concierge ──
export interface CustomerPreference {
  preference_id: string;
  contact_id: string;
  preference_key: string; // 'ring_size', 'preferred_metal', etc.
  preference_value: string;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export type MilestoneType =
  | "birthday"
  | "wedding_anniversary"
  | "business_anniversary"
  | "graduation"
  | "other";

export interface CustomerMilestone {
  milestone_id: string;
  contact_id: string;
  milestone_type: MilestoneType;
  milestone_date: string;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
}
