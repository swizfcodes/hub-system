import {
  Phone,
  MessageCircle,
  Mail,
  Store,
  FileText,
  Receipt,
  CreditCard,
  StickyNote,
  ArrowRightLeft,
} from "lucide-react";
import type { ActivityType } from "@typedefs/crm";

export interface ActivityTypeMeta {
  key: ActivityType;
  label: string;
  shortcut?: string; // single-key desktop shortcut
  icon: typeof Phone;
  color: string; // hex
  textClass: string;
  quickTemplate: boolean; // shown in the FAB quick-actions row
  defaultDirection?: "inbound" | "outbound";
}

export const CRM_ACTIVITY_TYPES: Record<ActivityType, ActivityTypeMeta> = {
  call: {
    key: "call",
    label: "Call",
    shortcut: "C",
    icon: Phone,
    color: "#C9A86C",
    textClass: "text-brand-accent",
    quickTemplate: true,
    defaultDirection: "outbound",
  },
  message: {
    key: "message",
    label: "Text / WhatsApp",
    shortcut: "T",
    icon: MessageCircle,
    color: "#B76E79",
    textClass: "text-accent3",
    quickTemplate: true,
    defaultDirection: "outbound",
  },
  email: {
    key: "email",
    label: "Email",
    shortcut: "E",
    icon: Mail,
    color: "#7A8FA8",
    textClass: "text-state-info",
    quickTemplate: true,
    defaultDirection: "outbound",
  },
  store_visit: {
    key: "store_visit",
    label: "Store visit",
    shortcut: "V",
    icon: Store,
    color: "#8B9D77",
    textClass: "text-accent2",
    quickTemplate: true,
    defaultDirection: "inbound",
  },
  note: {
    key: "note",
    label: "Note",
    shortcut: "N",
    icon: StickyNote,
    color: "#9E9891",
    textClass: "text-brand-stone",
    quickTemplate: true,
  },
  quotation_sent: {
    key: "quotation_sent",
    label: "Quotation sent",
    icon: FileText,
    color: "#C9A86C",
    textClass: "text-brand-accent",
    quickTemplate: false,
    defaultDirection: "outbound",
  },
  invoice_sent: {
    key: "invoice_sent",
    label: "Invoice sent",
    icon: Receipt,
    color: "#C9A86C",
    textClass: "text-brand-accent",
    quickTemplate: false,
    defaultDirection: "outbound",
  },
  payment_received: {
    key: "payment_received",
    label: "Payment received",
    icon: CreditCard,
    color: "#8B9D77",
    textClass: "text-accent2",
    quickTemplate: false,
    defaultDirection: "inbound",
  },
  stage_change: {
    key: "stage_change",
    label: "Stage change",
    icon: ArrowRightLeft,
    color: "#9E9891",
    textClass: "text-brand-stone",
    quickTemplate: false,
  },
};

export const QUICK_TEMPLATE_ORDER: ActivityType[] = [
  "call",
  "message",
  "email",
  "store_visit",
  "note",
];

// Default summary templates — speed up logging by pre-filling.
export const DEFAULT_SUMMARIES: Partial<Record<ActivityType, string>> = {
  call: "Spoke with client",
  message: "Sent WhatsApp message",
  email: "Sent follow-up email",
  store_visit: "Client visited the showroom",
  note: "",
};
