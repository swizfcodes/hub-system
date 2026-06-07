// Types mirror shared.contacts / shared.contact_addresses / shared.contact_tags.
// Source of truth: hub-system/shared/contacts/contacts.repository.js + migration 000003.

export type ContactType = "customer" | "supplier" | "staff" | "retail_partner" | "subscriber";
export type PriorityLevel = "vip" | "regular" | "new";
export type ContactSource =
  | "walk_in"
  | "social_media"
  | "referral"
  | "website"
  | "event";
export type AddressType = "delivery" | "billing" | "office" | "home" | "other";

export interface ContactAddress {
  address_id: string;
  contact_id: string;
  address_type: AddressType;
  line1: string;
  line2?: string | null;
  area?: string | null;
  city: string;
  state: string;
  country: string;
  landmark?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  google_maps_url?: string | null;
  is_default: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface ContactTag {
  tag_id: string;
  contact_id: string;
  tag_name: string;
  business: string;
  colour: string;
  created_by?: string | null;
  created_at: string;
}

export interface Contact {
  contact_id: string;
  contact_type: ContactType[];
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  gender?: "M" | "F" | "other" | "prefer_not" | null;
  date_of_birth?: string | null;
  birthday_month?: number | null;
  birthday_day?: number | null;
  tin?: string | null;
  cac_number?: string | null;
  primary_phone: string;
  whatsapp_number?: string | null;
  email?: string | null;
  addresses?: ContactAddress[] | null;
  tags?: ContactTag[] | null;
  priority_level: PriorityLevel;
  assigned_to?: string | null;
  visible_to: string[];
  source?: ContactSource | null;
  notes?: string | null;
  is_deleted: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

// Backend timeline endpoint returns these three buckets.
export interface ContactTimeline {
  activities: Array<{
    activity_id: string;
    activity_type: string;
    summary: string;
    direction?: "in" | "out";
    performed_at: string;
    is_auto: boolean;
  }>;
  invoices: Array<{
    invoice_id: string;
    invoice_number: string;
    total_amount: number;
    amount_paid: number;
    status: string;
    issue_date: string;
  }>;
  deals: Array<{
    deal_id: string;
    title: string;
    stage: string;
    expected_value: number;
    created_at: string;
  }>;
}

export interface ContactListResponse {
  data: Contact[];
  total: number;
  page: number;
  limit: number;
}
