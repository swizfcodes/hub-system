// ── typedefs/campaigns.ts ────────────────────────────────────────────────────
// Type definitions for the Campaigns module (email & WhatsApp marketing
// campaigns). The runtime shape mirrors the backend campaigns module:
// see modules/campaigns/campaigns.repository.js on the server.

// ── Enums ────────────────────────────────────────────────────────────────────

export type CampaignStatus =
  | 'draft'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'paused'
  | 'cancelled';

export type CampaignType = 'email' | 'whatsapp';

export type RecipientStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'unsubscribed';

// ── Audience filter (server compiles to a WHERE clause) ──────────────────────

export interface AudienceInclude {
  contact_type?:          string[];
  priority_level?:        string[];
  tag_names?:             string[];
  purchased_within_days?: number;
  min_lifetime_spend?:    number;
  category_ids?:          string[];
  birthday_within_days?:  number;
}

export interface AudienceFilter {
  // Nested shape consumed by the backend audience compiler.
  include?:             AudienceInclude;
  // Flat convenience fields used by parts of the builder UI.
  contact_type?:        string[];
  priority_level?:      string;
  tags?:                string[];
  has_whatsapp?:        boolean;
  has_email?:           boolean;
  exclude_unsubscribed: boolean;
  last_purchase_days?:  number;
}

// ── Core campaign record ─────────────────────────────────────────────────────

export interface Campaign {
  campaign_id:      string;
  campaign_name:    string;
  campaign_type:    CampaignType;
  status:           CampaignStatus;
  subject_line?:    string | null;
  from_name?:       string | null;
  html_content:     string;
  audience_filter?: AudienceFilter;
  scheduled_at?:    string | null;
  sent_at?:         string | null;
  recipient_count:  number;
  delivered_count:  number;
  opened_count:     number;
  clicked_count:    number;
  bounced_count:    number;
  unsubscribed_count: number;
  created_by?:      string;
  created_at?:      string;
  updated_at?:      string;
}

// ── Aggregated stats panel ───────────────────────────────────────────────────

export interface CampaignStats {
  total_recipients?: number;
  delivered?:        number;
  opened?:           number;
  clicked?:          number;
  bounced?:          number;
  unsubscribed?:     number;
  delivery_rate?:    number;
  open_rate_pct?:    number;
  click_rate_pct?:   number;
}

// ── A/B test result ──────────────────────────────────────────────────────────

export interface ABVariant {
  campaign_id:       string;
  campaign_name:     string;
  variant?:          'A' | 'B';
  subject_line?:     string | null;
  recipient_count:   number;
  delivered_count:   number;
  open_rate_pct:     number;
  click_rate_pct:    number;
}

export interface ABResult {
  winner:   string | null;  // campaign_id of the winning variant
  variants: ABVariant[];
}

// ── Recipient activity row ───────────────────────────────────────────────────

export interface RecipientActivity {
  recipient_id:    string;
  contact_id:      string;
  display_name:    string;
  email?:          string | null;
  whatsapp_number?: string | null;
  status:          RecipientStatus;
  sent_at?:        string | null;
  delivered_at?:   string | null;
  opened_at?:      string | null;
  clicked_at?:     string | null;
  bounced_at?:     string | null;
  error_reason?:   string | null;
}

// ── Saved segment ────────────────────────────────────────────────────────────

export interface Segment {
  segment_id:   string;
  name:         string;
  description?: string | null;
  filter:       AudienceFilter;
  created_by?:  string;
  created_at?:  string;
}

// ── Follow-up suggestion (the page's "VIPs to re-engage" list) ───────────────

export interface FollowUpSuggestion {
  contact_id:     string;
  display_name:   string;
  reason:         string;
  primary_phone?: string | null;
  open_count:     number;
}

// ── Audience preview row ─────────────────────────────────────────────────────

export interface AudiencePreviewRow {
  contact_id:   string;
  display_name: string;
  email?:       string | null;
  whatsapp_number?: string | null;
}

export interface AudiencePreview {
  count:   number;
  sample:  AudiencePreviewRow[];
}
