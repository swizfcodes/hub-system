// ── Section definitions ───────────────────────────────────────────────────────
//
// `modules`: which permission modules unlock this section.
//   A user sees the section if they have `view` on ANY of these modules.
// `financeApproveModule`: if set, the finance values are unblurred only when
//   the user also has `approve` (or `view`) on this module.

export const DASHBOARD_SECTIONS = [
  {
    key: "sales",
    label: "Sales",
    icon: "📈",
    requiresApprove: false,
    modules: ["sales", "pos", "invoicing"],
  },
  {
    key: "finance",
    label: "Finance",
    icon: "💰",
    requiresApprove: true,
    modules: ["accounting", "invoicing", "expenses"],
    financeApproveModule: "accounting",
  },
  {
    key: "customers",
    label: "Customers & CRM",
    icon: "👥",
    requiresApprove: false,
    modules: ["crm", "contacts"],
  },
  {
    key: "stock",
    label: "Inventory",
    icon: "📦",
    requiresApprove: false,
    modules: ["stock", "catalogue", "purchasing"],
  },
  {
    key: "logistics",
    label: "Logistics",
    icon: "🚚",
    requiresApprove: false,
    modules: ["logistics"],
  },
  {
    key: "retail",
    label: "Retail Partners",
    icon: "🏪",
    requiresApprove: false,
    modules: ["retail-partners"],
  },
] as const;

export type SectionKey = (typeof DASHBOARD_SECTIONS)[number]["key"];

export const DEFAULT_VISIBLE_SECTIONS: SectionKey[] = [
  "sales",
  "finance",
  "customers",
  "stock",
  "logistics",
];

// ── Alert thresholds ──────────────────────────────────────────────────────────

export const ALERT_THRESHOLDS = {
  overdue_invoices_count: 1, // show alert if any overdue
  low_stock_count: 1, // show alert if any low stock
  failed_deliveries_count: 1, // show if any failed in 7 days
  pending_dispatch_count: 5, // warn if too many pending
};

// ── Notification type meta ────────────────────────────────────────────────────

export const NOTIFICATION_TYPE_META: Record<
  string,
  { icon: string; color: string; label: string }
> = {
  task_assigned: { icon: "✅", color: "#4E9AF1", label: "Task" },
  calendar_invite: { icon: "📅", color: "#C9A86C", label: "Calendar" },
  loyalty_tier_upgrade: { icon: "🏆", color: "#C9A86C", label: "Loyalty" },
  message: { icon: "💬", color: "#25D366", label: "Message" },
  invoice_overdue: { icon: "⚠️", color: "#EF4444", label: "Invoice" },
  delivery_failed: { icon: "🚫", color: "#EF4444", label: "Delivery" },
  delivery_delivered: { icon: "✅", color: "#2D6A4F", label: "Delivery" },
  expense_approved: { icon: "💸", color: "#2D6A4F", label: "Expense" },
  expense_rejected: { icon: "❌", color: "#EF4444", label: "Expense" },
  payroll_run_complete: { icon: "💼", color: "#7B68EE", label: "Payroll" },
  stock_low: { icon: "📦", color: "#F97316", label: "Stock" },
  campaign_sent: { icon: "📧", color: "#4E9AF1", label: "Campaign" },
  system: { icon: "🔔", color: "#9E9891", label: "System" },
};

export function getNotificationMeta(type: string) {
  return (
    NOTIFICATION_TYPE_META[type] ?? {
      icon: "🔔",
      color: "#9E9891",
      label: "Notification",
    }
  );
}

// ── Brand toggle options ──────────────────────────────────────────────────────

export const BRAND_OPTIONS = [
  { value: "combined", label: "Combined", icon: "🔗" },
  { value: "jewelry", label: "Bejewelled", icon: "💎" },
  { value: "diffusers", label: "Orika Living", icon: "🕯️" },
] as const;

export type BrandOption = (typeof BRAND_OPTIONS)[number]["value"];

// ── Period options ────────────────────────────────────────────────────────────

export const PERIOD_OPTIONS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
];

export function getPeriodParams(period: string): {
  year: number;
  month?: number;
} {
  const now = new Date();
  switch (period) {
    case "last_month": {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return { year: now.getFullYear(), month: q * 3 + 1 };
    }
    case "this_year":
      return { year: now.getFullYear() };
    case "this_month":
    default:
      return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
}

// ── KPI card colour ───────────────────────────────────────────────────────────

export function getKpiColor(
  value: number,
  threshold?: number,
  inverse = false,
): string {
  if (threshold === undefined) return "#C9A86C"; // gold default
  const breached = inverse ? value > threshold : value < threshold;
  return breached ? "#EF4444" : "#C9A86C";
}
