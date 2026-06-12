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

// ── Period options ────────────────────────────────────────────────────────────

export const PERIOD_OPTIONS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
];

export interface PeriodParams {
  start_date: string;
  end_date: string;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Returns explicit start/end dates. We send start_date/end_date (which the
// backend's getPeriodDates honours directly) instead of {year, month} —
// the old params could only describe a single month, so "this quarter"
// showed one month and "this year" fell back to the current month.
export function getPeriodParams(period: string): PeriodParams {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case "last_month":
      return {
        start_date: ymd(new Date(y, m - 1, 1)),
        end_date: ymd(new Date(y, m, 0)),
      };
    case "this_quarter": {
      const qStart = Math.floor(m / 3) * 3;
      return {
        start_date: ymd(new Date(y, qStart, 1)),
        end_date: ymd(new Date(y, qStart + 3, 0)),
      };
    }
    case "this_year":
      return {
        start_date: ymd(new Date(y, 0, 1)),
        end_date: ymd(new Date(y, 11, 31)),
      };
    case "this_month":
    default:
      return {
        start_date: ymd(new Date(y, m, 1)),
        end_date: ymd(new Date(y, m + 1, 0)),
      };
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
