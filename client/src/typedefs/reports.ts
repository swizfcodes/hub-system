// ── typedefs/reports.ts ──────────────────────────────────────────────────────

export type ReportFormat = "json" | "csv" | "pdf" | "excel";
export type ColumnType =
  | "string"
  | "int"
  | "decimal"
  | "currency"
  | "percent"
  | "date"
  | "datetime";
export type CompareMode = "none" | "prev_period" | "prev_year" | "custom";
export type GroupBy = "day" | "week" | "month";

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export interface ReportMeta {
  title: string;
  subtitle?: string;
  generatedAt: string;
  totals?: Record<string, number | string>;
  summary?: Record<string, number | string | Record<string, number>>;
  sensitive?: boolean;
}

export interface ReportData {
  meta: ReportMeta;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}

export interface ReportFilters {
  startDate: string;
  endDate: string;
  groupBy?: GroupBy;
  limit?: number;
  compareMode: CompareMode;
  compareStart?: string;
  compareEnd?: string;
}

export interface SavedReport {
  report_id: string;
  created_by: string;
  report_name: string;
  report_type: string; // e.g. 'sales.by_period'
  filters?: Record<string, unknown>;
  columns?: string[];
  sort_config?: Record<string, unknown>;
  is_shared: boolean;
  schedule?: ScheduleConfig | null;
  last_run_at?: string | null;
  created_at: string;
}

export interface ScheduleConfig {
  frequency: "weekly" | "monthly";
  day_of_week?: number; // 0=Sun…6=Sat (weekly only)
  day_of_month?: number; // 1–28 (monthly only)
  channels: ("email" | "whatsapp")[];
  recipients?: string[];
  whatsapp_numbers?: string[];
}
