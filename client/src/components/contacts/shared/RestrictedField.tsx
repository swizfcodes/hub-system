import { Lock } from "lucide-react";
import { cn } from "@lib/cn";

interface Props {
  label: string;
  value?: string | number | null;
  /** Backend masks restricted values with prefix "****". We render that as a lock. */
  surface?: "dark" | "light";
  className?: string;
}

export function RestrictedField({
  label,
  value,
  surface = "light",
  className,
}: Props) {
  const isDark = surface === "dark";
  const isRestricted =
    value == null || (typeof value === "string" && value.startsWith("****"));

  return (
    <div
      className={cn(
        "p-3 rounded-xl border",
        isDark
          ? "border-orika-graphite bg-orika-charcoal/40"
          : "border-orika-cloud/40 bg-white/40",
        className,
      )}
    >
      <div
        className={cn(
          "text-[0.6rem] uppercase tracking-widest",
          isDark ? "text-orika-smoke" : "text-text-on-light-muted",
        )}
      >
        {label}
      </div>
      {isRestricted ? (
        <div className="mt-1 inline-flex items-center gap-1.5 text-xs italic text-orika-smoke">
          <Lock className="w-3 h-3" />
          {value ?? "Restricted"}
        </div>
      ) : (
        <div
          className={cn(
            "text-sm font-medium mt-0.5 truncate",
            isDark ? "text-orika-cream" : "text-orika-black",
          )}
        >
          {value}
        </div>
      )}
    </div>
  );
}
