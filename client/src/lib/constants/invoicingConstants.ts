import type {
  InvoiceStatus,
  // InvoiceType,
  InvoicePaymentMethod,
  CreditNoteStatus,
} from "@typedefs/invoicing";
import type { SelectOption } from "@components/ui/Select";

// ── Invoice status ─────────────────────────────────────────────────────────────

export const INVOICE_STATUS_META: Record<
  InvoiceStatus,
  { label: string; color: string; bg: string }
> = {
  draft: { label: "Draft", color: "#9E9891", bg: "#9E989114" },
  sent: { label: "Sent", color: "#C9A86C", bg: "#C9A86C14" },
  partially_paid: { label: "Partial", color: "#4E9AF1", bg: "#4E9AF114" },
  paid: { label: "Paid", color: "#2D6A4F", bg: "#2D6A4F14" },
  overdue: { label: "Overdue", color: "#C0392B", bg: "#C0392B14" },
  voided: { label: "Voided", color: "#555555", bg: "#55555514" },
};

// ── Invoice type options (for Select component) ────────────────────────────────

export const INVOICE_TYPE_OPTIONS: SelectOption[] = [
  { value: "standard", label: "Standard Invoice" },
  { value: "proforma", label: "Proforma Invoice" },
  { value: "retail_partner_settlement", label: "Partner Settlement" },
];

// ── Payment method options ────────────────────────────────────────────────────

export const PAYMENT_METHOD_OPTIONS: SelectOption[] = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "paystack", label: "Paystack" },
  { value: "pos_card", label: "POS Card" },
  { value: "cash", label: "Cash" },
  { value: "flutterwave", label: "Flutterwave" },
];

export const PAYMENT_METHOD_LABEL: Record<InvoicePaymentMethod, string> = {
  bank_transfer: "Bank Transfer",
  pos_card: "POS Card",
  cash: "Cash",
  paystack: "Paystack",
  flutterwave: "Flutterwave",
};

// ── Credit note status ────────────────────────────────────────────────────────

export const CREDIT_NOTE_STATUS_META: Record<
  CreditNoteStatus,
  { label: string; color: string }
> = {
  draft: { label: "Draft", color: "#9E9891" },
  issued: { label: "Issued", color: "#C9A86C" },
  applied: { label: "Applied", color: "#2D6A4F" },
  refunded: { label: "Refunded", color: "#4E9AF1" },
};

// ── Status filter tabs ────────────────────────────────────────────────────────

export const INVOICE_STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "partially_paid", label: "Partial" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "voided", label: "Voided" },
] as const;

// ── Aging bucket definitions ──────────────────────────────────────────────────

export const AGING_BUCKETS = [
  { key: "bucket_current", label: "Current", days: "0 days" },
  { key: "bucket_1_30", label: "1–30 days", days: "30 days" },
  { key: "bucket_31_60", label: "31–60 days", days: "60 days" },
  { key: "bucket_61_90", label: "61–90 days", days: "90 days" },
  { key: "bucket_90_plus", label: "90+ days", days: "90+ days" },
] as const;

/** Days overdue at which a write-off is auto-suggested in InvoiceDetail. */
export const WRITE_OFF_SUGGEST_DAYS = 180;

// ── Invoice channel options ───────────────────────────────────────────────────

export const SEND_CHANNEL_OPTIONS: SelectOption[] = [
  { value: "email", label: "Email (PDF attachment)" },
  { value: "whatsapp", label: "WhatsApp (message + link)" },
];
