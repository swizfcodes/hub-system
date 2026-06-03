import type { BadgeProps } from "@components/ui/Badge";
import type { EventType, TaskStatus, TaskPriority } from "@typedefs/scheduling";

// ── Event type meta ───────────────────────────────────────────────────────────

export const EVENT_TYPE_META: Record<
  EventType,
  { label: string; color: string; bg: string }
> = {
  meeting: { label: "Meeting", color: "#4E9AF1", bg: "#4E9AF115" },
  viewing: { label: "Viewing", color: "#7B68EE", bg: "#7B68EE15" },
  appointment: { label: "Appointment", color: "#2D9CDB", bg: "#2D9CDB15" },
  delivery: { label: "Delivery", color: "#F59E0B", bg: "#F59E0B15" },
  task: { label: "Task", color: "#C9A86C", bg: "#C9A86C15" },
  reminder: { label: "Reminder", color: "#E879A4", bg: "#E879A415" },
  other: { label: "Other", color: "#9E9891", bg: "#9E989115" },
};

export const EVENT_TYPE_OPTIONS = Object.entries(EVENT_TYPE_META).map(
  ([value, { label }]) => ({ value, label }),
);

// ── Task status meta ──────────────────────────────────────────────────────────

export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; tone: BadgeProps["tone"]; color: string; dot?: boolean }
> = {
  inbox: { label: "Inbox", tone: "neutral", color: "#9E9891" },
  today: { label: "Today", tone: "gold", color: "#C9A86C", dot: true },
  this_week: { label: "This Week", tone: "info", color: "#4E9AF1" },
  this_month: { label: "This Month", tone: "plum", color: "#7B68EE" },
  later: { label: "Later", tone: "neutral", color: "#6B7280" },
  done: { label: "Done", tone: "sage", color: "#2D6A4F" },
  cancelled: { label: "Cancelled", tone: "danger", color: "#EF4444" },
};

export const TASK_STATUS_COLUMNS: TaskStatus[] = [
  "inbox",
  "today",
  "this_week",
  "this_month",
  "later",
  "done",
  "cancelled",
];

// ── Task priority meta ────────────────────────────────────────────────────────

export const TASK_PRIORITY_META: Record<
  TaskPriority,
  { label: string; tone: BadgeProps["tone"]; color: string }
> = {
  low: { label: "Low", tone: "neutral", color: "#9E9891" },
  normal: { label: "Normal", tone: "info", color: "#4E9AF1" },
  high: { label: "High", tone: "warn", color: "#F97316" },
  urgent: { label: "Urgent", tone: "danger", color: "#EF4444" },
};

export const TASK_PRIORITY_OPTIONS = Object.entries(TASK_PRIORITY_META).map(
  ([value, { label }]) => ({ value, label }),
);

export const TASK_STATUS_OPTIONS = Object.entries(TASK_STATUS_META).map(
  ([value, { label }]) => ({ value, label }),
);

// ── Reference type labels ─────────────────────────────────────────────────────

export const REF_TYPE_LABEL: Record<string, string> = {
  contact: "Contact",
  sales_order: "Sales Order",
  invoice: "Invoice",
  delivery: "Delivery",
  expense: "Expense",
  crm_deal: "Deal",
  purchase_order: "Purchase Order",
};

// ── Calendar utility functions ─────────────────────────────────────────────────

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Generate a 6-week calendar grid starting from the Sunday before the 1st */
export function generateMonthGrid(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const weeks: Date[][] = [];
  const current = new Date(startDate);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtEventRange(
  start: string,
  end: string,
  allDay: boolean,
): string {
  if (allDay) return "All day";
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

export function eventsForDay<T extends { start_at: string }>(
  events: T[],
  day: Date,
): T[] {
  return events.filter((e) => isSameDay(new Date(e.start_at), day));
}

/** Given a task's due_at, return the appropriate default status */
export function dueDateToStatus(due: Date): TaskStatus {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diff = (dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "today";
  if (diff === 0) return "today";
  if (diff <= 6) return "this_week";
  if (diff <= 30) return "this_month";
  return "later";
}
