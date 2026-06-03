import { MOVEMENT_TYPE_META } from "@lib/constants/stockMovementTypes";
import type { MovementType } from "@typedefs/stock";
import { cn } from "@lib/cn";

export function MovementTypeIcon({
  type,
  size = "sm",
  className,
}: {
  type: MovementType;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = MOVEMENT_TYPE_META[type];
  const Icon = meta.icon;
  const box = size === "sm" ? "w-7 h-7" : "w-9 h-9";
  const ic = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center shrink-0",
        box,
        className,
      )}
      style={{ background: `${meta.color}1F`, color: meta.color }}
    >
      <Icon className={ic} />
    </div>
  );
}
