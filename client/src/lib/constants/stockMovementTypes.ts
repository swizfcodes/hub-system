import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ShoppingBag,
  Store,
  Truck,
  Box,
  RotateCcw,
  AlertTriangle,
  Lock,
  LockOpen,
  Gift,
  Settings2,
} from "lucide-react";
import type { MovementType } from "@typedefs/stock";

export interface MovementTypeMeta {
  key: MovementType;
  label: string;
  icon: typeof ArrowDownToLine;
  color: string;
  direction: 1 | -1;
  tone: "gold" | "sage" | "rose" | "neutral" | "danger" | "info" | "warn";
}

export const MOVEMENT_TYPE_META: Record<MovementType, MovementTypeMeta> = {
  received_from_supplier: {
    key: "received_from_supplier",
    label: "Received (GRN)",
    icon: ArrowDownToLine,
    color: "#8B9D77",
    direction: 1,
    tone: "sage",
  },
  sold: {
    key: "sold",
    label: "Sold",
    icon: ShoppingBag,
    color: "#C9A86C",
    direction: -1,
    tone: "gold",
  },
  return_from_customer: {
    key: "return_from_customer",
    label: "Customer return",
    icon: RotateCcw,
    color: "#8B9D77",
    direction: 1,
    tone: "sage",
  },
  transferred_out: {
    key: "transferred_out",
    label: "Transferred out",
    icon: Truck,
    color: "#7A8FA8",
    direction: -1,
    tone: "info",
  },
  transferred_in: {
    key: "transferred_in",
    label: "Transferred in",
    icon: Truck,
    color: "#7A8FA8",
    direction: 1,
    tone: "info",
  },
  sent_to_consignment: {
    key: "sent_to_consignment",
    label: "Sent to consignment",
    icon: Box,
    color: "#A855F7",
    direction: -1,
    tone: "rose",
  },
  returned_from_consignment: {
    key: "returned_from_consignment",
    label: "Returned from consignment",
    icon: Box,
    color: "#A855F7",
    direction: 1,
    tone: "rose",
  },
  consignment_sale: {
    key: "consignment_sale",
    label: "Consignment sale",
    icon: Store,
    color: "#C9A86C",
    direction: -1,
    tone: "gold",
  },
  wholesale_out: {
    key: "wholesale_out",
    label: "Wholesale out",
    icon: ArrowUpFromLine,
    color: "#7A8FA8",
    direction: -1,
    tone: "info",
  },
  write_off: {
    key: "write_off",
    label: "Write-off / damage",
    icon: AlertTriangle,
    color: "#C75B5B",
    direction: -1,
    tone: "danger",
  },
  reserved: {
    key: "reserved",
    label: "Reserved",
    icon: Lock,
    color: "#D9A741",
    direction: -1,
    tone: "warn",
  },
  reservation_released: {
    key: "reservation_released",
    label: "Reservation freed",
    icon: LockOpen,
    color: "#D9A741",
    direction: 1,
    tone: "warn",
  },
  sample: {
    key: "sample",
    label: "Sample",
    icon: Gift,
    color: "#B76E79",
    direction: -1,
    tone: "rose",
  },
  gift: {
    key: "gift",
    label: "Gift",
    icon: Gift,
    color: "#B76E79",
    direction: -1,
    tone: "rose",
  },
  damaged: {
    key: "damaged",
    label: "Damaged",
    icon: AlertTriangle,
    color: "#C75B5B",
    direction: -1,
    tone: "danger",
  },
  returned_to_supplier: {
    key: "returned_to_supplier",
    label: "Return to supplier",
    icon: ArrowUpFromLine,
    color: "#B76E79",
    direction: -1,
    tone: "rose",
  },
  adjustment: {
    key: "adjustment",
    label: "Adjustment",
    icon: Settings2,
    color: "#9E9891",
    direction: 1,
    tone: "neutral",
  },
};

export const MOVEMENT_TYPES_ENTRY = Object.values(MOVEMENT_TYPE_META).filter(
  (m) => m.direction === 1,
);
export const MOVEMENT_TYPES_EXIT = Object.values(MOVEMENT_TYPE_META).filter(
  (m) => m.direction === -1,
);
