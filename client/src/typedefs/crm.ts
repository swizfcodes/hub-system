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
