// ── DeliveryStatusBadge.tsx ───────────────────────────────────────────────────

import { Badge } from "@components/ui/Badge";
import {
  DELIVERY_STATUS_META,
  COURIER_META,
} from "@lib/constants/logisticsConstants";
import type { DeliveryStatus, Courier } from "@typedefs/logistics";
import { cn } from "@lib/cn";

interface DeliveryStatusBadgeProps {
  status: DeliveryStatus;
  size?: "xs" | "sm";
}

export function DeliveryStatusBadge({
  status,
  size = "sm",
}: DeliveryStatusBadgeProps) {
  const meta = DELIVERY_STATUS_META[status];
  return (
    <Badge tone={meta.tone} size={size} dot={meta.dot}>
      {meta.label}
    </Badge>
  );
}

interface CourierBadgeProps {
  courier: Courier;
  size?: "xs" | "sm";
}

export function CourierBadge({ courier, size = "xs" }: CourierBadgeProps) {
  const meta = COURIER_META[courier];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 font-semibold uppercase tracking-wide",
        size === "xs" ? "py-0.5 text-[0.6rem]" : "py-1 text-[0.65rem]",
      )}
      style={{
        color: meta.color,
        borderColor: `${meta.color}40`,
        backgroundColor: `${meta.color}14`,
      }}
    >
      {meta.label}
    </span>
  );
}
