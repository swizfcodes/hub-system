import type { ColumnType } from "@typedefs/reports";

// ── Report family definitions ─────────────────────────────────────────────────

export const REPORT_FAMILIES = {
  sales: {
    label: "Sales",
    icon: "📈",
    color: "#4E9AF1",
    permission: "view",
    types: [
      {
        key: "by_period",
        label: "Sales by Period",
        params: ["start_date", "end_date", "group_by"],
      },
      {
        key: "by_product",
        label: "Sales by Product",
        params: ["start_date", "end_date", "limit"],
      },
      {
        key: "by_customer",
        label: "Sales by Customer",
        params: ["start_date", "end_date", "limit"],
      },
    ],
  },
  finance: {
    label: "Finance",
    icon: "💰",
    color: "#2D6A4F",
    permission: "approve",
    types: [
      {
        key: "profit_and_loss",
        label: "Profit & Loss",
        params: ["start_date", "end_date"],
      },
      {
        key: "outstanding_invoices",
        label: "Outstanding Invoices",
        params: ["as_of_date"],
      },
      {
        key: "expenses_by_category",
        label: "Expenses by Category",
        params: ["start_date", "end_date"],
      },
    ],
  },
  purchases: {
    label: "Purchases",
    icon: "🛒",
    color: "#7B68EE",
    permission: "approve",
    types: [
      {
        key: "by_supplier",
        label: "By Supplier",
        params: ["start_date", "end_date"],
      },
      {
        key: "by_category",
        label: "By Category",
        params: ["start_date", "end_date"],
      },
      {
        key: "by_period",
        label: "By Period",
        params: ["start_date", "end_date"],
      },
    ],
  },
  stock: {
    label: "Stock",
    icon: "📦",
    color: "#F59E0B",
    permission: "view",
    types: [
      { key: "valuation", label: "Stock Valuation", params: [] },
      {
        key: "movements",
        label: "Stock Movements",
        params: ["start_date", "end_date", "movement_type"],
      },
      { key: "low_stock", label: "Low Stock Items", params: [] },
    ],
  },
  payroll: {
    label: "Payroll",
    icon: "👥",
    color: "#C9A86C",
    permission: "approve",
    types: [
      {
        key: "summary",
        label: "Payroll Summary",
        params: ["start_date", "end_date"],
      },
      { key: "staff_detail", label: "Staff Detail", params: ["payroll_id"] },
    ],
  },
  delivery: {
    label: "Delivery",
    icon: "🚚",
    color: "#9E9891",
    permission: "view",
    types: [
      {
        key: "performance",
        label: "Delivery Performance",
        params: ["start_date", "end_date"],
      },
      {
        key: "by_courier",
        label: "By Courier",
        params: ["start_date", "end_date"],
      },
    ],
  },
  attendance: {
    label: "Attendance",
    icon: "🗓️",
    color: "#E879A4",
    permission: "approve",
    types: [
      {
        key: "leave_summary",
        label: "Leave Summary",
        params: ["start_date", "end_date"],
      },
      {
        key: "by_staff",
        label: "By Staff",
        params: ["start_date", "end_date"],
      },
    ],
  },
} as const;

export type ReportFamilyKey = keyof typeof REPORT_FAMILIES;

// ── Chart config per report type ──────────────────────────────────────────────

type ChartConfig = {
  type: "line" | "bar" | "pie" | "area";
  xKey: string;
  yKeys: string[];
};

export const REPORT_CHART_CONFIG: Partial<Record<string, ChartConfig>> = {
  "sales.by_period": {
    type: "area",
    xKey: "period",
    yKeys: ["total", "invoice_count"],
  },
  "sales.by_product": {
    type: "bar",
    xKey: "product_name",
    yKeys: ["revenue", "units_sold"],
  },
  "sales.by_customer": {
    type: "bar",
    xKey: "display_name",
    yKeys: ["total_spend"],
  },
  "finance.profit_and_loss": { type: "bar", xKey: "label", yKeys: ["amount"] },
  "finance.expenses_by_category": {
    type: "pie",
    xKey: "category",
    yKeys: ["total"],
  },
  "purchases.by_supplier": {
    type: "bar",
    xKey: "supplier_name",
    yKeys: ["total_spend"],
  },
  "purchases.by_period": {
    type: "area",
    xKey: "period",
    yKeys: ["total_amount"],
  },
  "purchases.by_category": { type: "pie", xKey: "category", yKeys: ["total"] },
  "stock.valuation": {
    type: "bar",
    xKey: "name",
    yKeys: ["cost_value", "retail_value"],
  },
  "delivery.by_courier": { type: "pie", xKey: "courier", yKeys: ["total"] },
  "delivery.performance": { type: "bar", xKey: "status", yKeys: ["total"] },
  "attendance.leave_summary": {
    type: "bar",
    xKey: "leave_type",
    yKeys: ["total_days"],
  },
  "attendance.by_staff": {
    type: "bar",
    xKey: "staff_name",
    yKeys: ["approved_days"],
  },
};

// ── Value formatter ───────────────────────────────────────────────────────────

export function formatCellValue(value: unknown, type: ColumnType): string {
  if (value === null || value === undefined) return "—";
  const v = value as string | number;
  switch (type) {
    case "currency":
      return `₦${parseFloat(String(v)).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "percent":
      return `${parseFloat(String(v)).toFixed(2)}%`;
    case "int":
      return parseInt(String(v)).toLocaleString();
    case "decimal":
      return parseFloat(String(v)).toFixed(2);
    case "date":
      return String(v).slice(0, 10);
    case "datetime":
      return String(v).slice(0, 16).replace("T", " ");
    default:
      return String(v);
  }
}

// ── Date range presets ────────────────────────────────────────────────────────

export function getPresetRange(preset: string): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  switch (preset) {
    case "this_month": {
      return {
        startDate: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    }
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: fmt(s), endDate: fmt(e) };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      const s = new Date(now.getFullYear(), q * 3, 1);
      const e = new Date(now.getFullYear(), q * 3 + 3, 0);
      return { startDate: fmt(s), endDate: fmt(e) };
    }
    case "this_year": {
      return {
        startDate: fmt(new Date(now.getFullYear(), 0, 1)),
        endDate: fmt(new Date(now.getFullYear(), 11, 31)),
      };
    }
    case "last_30":
    default: {
      const s = new Date(now);
      s.setDate(s.getDate() - 30);
      return { startDate: fmt(s), endDate: fmt(now) };
    }
  }
}

export function getCompareRange(
  primary: { startDate: string; endDate: string },
  mode: string,
): { startDate: string; endDate: string } {
  const start = new Date(primary.startDate);
  const end = new Date(primary.endDate);
  const days = Math.round(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (mode === "prev_period") {
    const cs = new Date(start);
    cs.setDate(cs.getDate() - days - 1);
    const ce = new Date(start);
    ce.setDate(ce.getDate() - 1);
    return { startDate: fmt(cs), endDate: fmt(ce) };
  }
  // prev_year
  const cs = new Date(start);
  cs.setFullYear(cs.getFullYear() - 1);
  const ce = new Date(end);
  ce.setFullYear(ce.getFullYear() - 1);
  return { startDate: fmt(cs), endDate: fmt(ce) };
}

export const GROUP_BY_OPTIONS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

export const DATE_PRESETS = [
  { value: "last_30", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
];

export const COMPARE_OPTIONS = [
  { value: "none", label: "No comparison" },
  { value: "prev_period", label: "vs Previous period" },
  { value: "prev_year", label: "vs Same period last year" },
  { value: "custom", label: "Custom date range" },
];

export const CHART_COLORS = [
  "#4E9AF1",
  "#C9A86C",
  "#2D9CDB",
  "#E879A4",
  "#9E9891",
  "#2D6A4F",
  "#7B68EE",
];
