import { CRM_ACTIVITY_TYPES } from "@lib/constants/crmActivityTypes";
import type { ActivityType } from "@typedefs/crm";
import { cn } from "@lib/cn";

interface Props {
  type: ActivityType;
  direction?: "inbound" | "outbound" | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { box: "w-7 h-7", icon: "w-3.5 h-3.5" },
  md: { box: "w-9 h-9", icon: "w-4 h-4" },
  lg: { box: "w-12 h-12", icon: "w-5 h-5" },
};

export function ActivityIcon({
  type,
  direction,
  size = "sm",
  className,
}: Props) {
  const meta = CRM_ACTIVITY_TYPES[type];
  const Icon = meta.icon;
  const dims = SIZES[size];

  return (
    <div
      className={cn(
        "relative rounded-full flex items-center justify-center shrink-0",
        dims.box,
        className,
      )}
      style={{ background: `${meta.color}1F`, color: meta.color }}
      title={meta.label}
    >
      <Icon className={dims.icon} />
      {direction && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full text-[0.5rem] font-bold flex items-center justify-center border-2",
            direction === "inbound"
              ? "bg-accent2 text-brand-black border-brand-charcoal"
              : "bg-brand-accent text-brand-black border-brand-charcoal",
          )}
        >
          {direction === "inbound" ? "↓" : "↑"}
        </span>
      )}
    </div>
  );
}
