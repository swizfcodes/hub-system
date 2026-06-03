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
  received: {
    key: "received",
    label: "Received",
    icon: ArrowDownToLine,
    color: "#8B9D77",
    direction: 1,
    tone: "sage",
  },
  sold: {
    key: "sold",
    label: "Sold (invoice)",
    icon: ShoppingBag,
    color: "#C9A86C",
    direction: -1,
    tone: "gold",
  },
  pos_sale: {
    key: "pos_sale",
    label: "POS sale",
    icon: Store,
    color: "#C9A86C",
    direction: -1,
    tone: "gold",
  },
  returned_from_customer: {
    key: "returned_from_customer",
    label: "Customer return",
    icon: RotateCcw,
    color: "#8B9D77",
    direction: 1,
    tone: "sage",
  },
  returned_to_supplier: {
    key: "returned_to_supplier",
    label: "Return to supplier",
    icon: ArrowUpFromLine,
    color: "#B76E79",
    direction: -1,
    tone: "rose",
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
  consigned_out: {
    key: "consigned_out",
    label: "Consigned out",
    icon: Box,
    color: "#A855F7",
    direction: -1,
    tone: "rose",
  },
  consigned_returned: {
    key: "consigned_returned",
    label: "Consignment back",
    icon: Box,
    color: "#A855F7",
    direction: 1,
    tone: "rose",
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
  written_off: {
    key: "written_off",
    label: "Written off",
    icon: AlertTriangle,
    color: "#C75B5B",
    direction: -1,
    tone: "danger",
  },
  damaged: {
    key: "damaged",
    label: "Damaged",
    icon: AlertTriangle,
    color: "#C75B5B",
    direction: -1,
    tone: "danger",
  },
  sample: {
    key: "sample",
    label: "Sample / gift",
    icon: Gift,
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
