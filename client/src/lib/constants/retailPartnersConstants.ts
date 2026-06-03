import type { SelectOption } from "@components/ui/Select";
import type { BadgeProps } from "@components/ui/Badge";
import type {
  ArrangementType,
  ConsignmentStatus,
  SettlementStatus,
  SettlementCycle,
} from "@typedefs/retailPartners";

// ── Arrangement type ──────────────────────────────────────────────────────────

export const ARRANGEMENT_META: Record<
  ArrangementType,
  { label: string; tone: BadgeProps["tone"] }
> = {
  consignment: { label: "Consignment", tone: "sage" },
  wholesale: { label: "Wholesale", tone: "gold" },
  both: { label: "Both", tone: "plum" },
};

export const ARRANGEMENT_OPTIONS: SelectOption[] = [
  {
    value: "consignment",
    label: "Consignment — stock stays ours, partner sells on our behalf",
  },
  {
    value: "wholesale",
    label: "Wholesale — outright sale to partner at discounted price",
  },
  { value: "both", label: "Both — partner may do either depending on product" },
];

// ── Settlement cycle ──────────────────────────────────────────────────────────

export const CYCLE_OPTIONS: SelectOption[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
];

export const CYCLE_LABEL: Record<SettlementCycle, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
};

// ── Consignment status ────────────────────────────────────────────────────────

export const CONSIGNMENT_STATUS_META: Record<
  ConsignmentStatus,
  { label: string; tone: BadgeProps["tone"] }
> = {
  active: { label: "Active", tone: "sage" },
  partially_returned: { label: "Part Returned", tone: "warn" },
  fully_settled: { label: "Fully Settled", tone: "neutral" },
  recalled: { label: "Recalled", tone: "neutral" },
};

// ── Settlement status ─────────────────────────────────────────────────────────

export const SETTLEMENT_STATUS_META: Record<
  SettlementStatus,
  { label: string; tone: BadgeProps["tone"] }
> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  paid: { label: "Paid", tone: "sage" },
};

// ── Partner detail tabs ───────────────────────────────────────────────────────

export const PARTNER_TABS = [
  { key: "stock", label: "Consignment Stock" },
  { key: "sales", label: "Reported Sales" },
  { key: "settlements", label: "Settlements" },
  { key: "wholesale", label: "Wholesale" },
] as const;

// ── Arrangement filter options (for homepage filter) ──────────────────────────

export const FILTER_ARRANGEMENT_OPTIONS: SelectOption[] = [
  { value: "", label: "All Types" },
  { value: "consignment", label: "Consignment" },
  { value: "wholesale", label: "Wholesale" },
  { value: "both", label: "Both" },
];
