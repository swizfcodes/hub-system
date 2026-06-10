import type {
  DeliveryStatus,
  Courier,
  DeliveryZone,
} from "@typedefs/logistics";
import type { SelectOption } from "@components/ui/Select";
import type { BadgeProps } from "@components/ui/Badge";

// ── Delivery status meta ──────────────────────────────────────────────────────

export const DELIVERY_STATUS_META: Record<
  DeliveryStatus,
  { label: string; tone: BadgeProps["tone"]; dot?: boolean }
> = {
  pending_dispatch: { label: "Pending Dispatch", tone: "warn", dot: true },
  dispatched: { label: "Dispatched", tone: "info", dot: true },
  picked_up: { label: "Picked Up", tone: "info", dot: true },
  in_transit: { label: "In Transit", tone: "gold", dot: true },
  delivered: { label: "Delivered", tone: "sage", dot: false },
  failed: { label: "Failed", tone: "danger", dot: false },
  returned: { label: "Returned", tone: "neutral", dot: false },
};

// ── Courier meta ──────────────────────────────────────────────────────────────

export const COURIER_META: Record<Courier, { label: string; color: string }> = {
  relay: { label: "Relay", color: "#FF6B35" },
  chowdeck: { label: "Chowdeck", color: "#E8A020" },
  gigl: { label: "GIG Logistics", color: "#1A4B8C" },
  manual: { label: "Manual / Ride-hail", color: "#C9A86C" },
};

// ── Zone labels ───────────────────────────────────────────────────────────────

export const ZONE_LABEL: Record<DeliveryZone, string> = {
  lagos: "Lagos (Same-day eligible)",
  interstate: "Interstate Nigeria",
  international: "International",
};

// ── Courier select options (for Select component) ─────────────────────────────

export const COURIER_OPTIONS: SelectOption[] = [
  { value: "manual", label: "Manual — Uber / Bolt / inDrive / any courier" },
  { value: "gigl", label: "GIG Logistics (API not connected)" },
  { value: "chowdeck", label: "Chowdeck (API not connected)" },
  { value: "relay", label: "Relay (API not connected)" },
];

// ── Status filter tabs ────────────────────────────────────────────────────────

export const LOGISTICS_TABS = [
  { key: "pending", label: "Queue" },
  { key: "active", label: "Active" },
  { key: "delivered", label: "Delivered" },
  { key: "failed", label: "Issues" },
] as const;

// ── Fee bearer options ────────────────────────────────────────────────────────

export const FEE_BEARER_OPTIONS: SelectOption[] = [
  { value: "customer", label: "Customer pays delivery fee" },
  { value: "business", label: "We absorb the fee" },
  { value: "split", label: "Split 50/50" },
];

// ── Zone detection helper ─────────────────────────────────────────────────────

import type { DeliveryAddress } from "@typedefs/logistics";

export function detectZone(address: Partial<DeliveryAddress>): DeliveryZone {
  const state = (address.state || "").toLowerCase();
  const country = (address.country || "nigeria").toLowerCase();
  if (state.includes("lagos")) return "lagos";
  if (country === "nigeria") return "interstate";
  return "international";
}

// ── Signature pad config ──────────────────────────────────────────────────────

export const SIGNATURE_PAD_OPTIONS = {
  penColor: "rgb(15, 15, 15)",
  backgroundColor: "rgb(255, 255, 255)",
  minWidth: 0.5,
  maxWidth: 2.5,
};
