// ── lib/constants/campaignsConstants.ts ──────────────────────────────────────
import type { BadgeProps } from "@components/ui/Badge";
import type {
  CampaignStatus,
  CampaignType,
  RecipientStatus,
} from "@typedefs/campaigns";
import type { SelectOption } from "@components/ui/Select";

export const CAMPAIGN_STATUS_META: Record<
  CampaignStatus,
  { label: string; tone: BadgeProps["tone"]; dot?: boolean }
> = {
  draft: { label: "Draft", tone: "neutral" },
  queued: { label: "Scheduled", tone: "info", dot: true },
  sending: { label: "Sending", tone: "gold", dot: true },
  sent: { label: "Sent", tone: "sage" },
  paused: { label: "Paused", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export const RECIPIENT_STATUS_META: Record<
  RecipientStatus,
  { label: string; tone: BadgeProps["tone"] }
> = {
  pending: { label: "Pending", tone: "neutral" },
  sending: { label: "Sending", tone: "gold" },
  sent: { label: "Sent", tone: "info" },
  delivered: { label: "Delivered", tone: "info" },
  opened: { label: "Opened", tone: "gold" },
  clicked: { label: "Clicked", tone: "sage" },
  bounced: { label: "Bounced", tone: "danger" },
  unsubscribed: { label: "Unsubscribed", tone: "danger" },
};

export const CAMPAIGN_TYPE_META: Record<
  CampaignType,
  { label: string; color: string; icon: string }
> = {
  email: { label: "Email", color: "#4E9AF1", icon: "📧" },
  whatsapp: { label: "WhatsApp", color: "#25D366", icon: "💬" },
};

export const CAMPAIGN_TYPE_OPTIONS: SelectOption[] = [
  { value: "email", label: "📧 Email campaign" },
  { value: "whatsapp", label: "💬 WhatsApp broadcast" },
];

export const PRIORITY_OPTIONS: SelectOption[] = [
  { value: "", label: "All priorities" },
  { value: "VIP", label: "VIP only" },
  { value: "regular", label: "Regular" },
];

export const CONTACT_TYPE_OPTIONS = [
  { value: "customer", label: "Customer" },
  { value: "subscriber", label: "Subscriber" },
  { value: "supplier", label: "Supplier" },
  { value: "partner", label: "Partner" },
  { value: "lead", label: "Lead" },
];

// WhatsApp daily limit — matches env var WA_DAILY_LIMIT
export const WA_DAILY_LIMIT_DEFAULT = 1_000;
export const WA_WARN_THRESHOLD_PCT = 0.8; // warn at 80%

// Template variables for personalisation.
//
// SOURCE OF TRUTH: personalise() in modules/campaigns/scheduler.service.js.
// Only list tokens the backend actually substitutes — anything else goes
// out to customers as literal "{{...}}" text. Order/product/amount tokens
// were removed: bulk campaigns have no order context to fill them from.
// Contacts without a display_name fall back to "Valued Customer" (both
// tokens — never a bare "Valued").
export const TEMPLATE_VARIABLES = [
  {
    token: "{{customer_name}}",
    label: "Customer full name",
    example: "Adaeze Obi",
  },
  { token: "{{first_name}}", label: "First name only", example: "Adaeze" },
];

export const LAST_PURCHASE_OPTIONS: SelectOption[] = [
  { value: "", label: "Any time" },
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 6 months" },
  { value: "365", label: "Last year" },
];

export const CAMPAIGN_STEPS = [
  { key: "details", label: "Details" },
  { key: "audience", label: "Audience" },
  { key: "content", label: "Content" },
  { key: "schedule", label: "Schedule" },
  { key: "review", label: "Review" },
] as const;
