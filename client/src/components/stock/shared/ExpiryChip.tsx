import { Calendar, AlertTriangle } from "lucide-react";
import { cn } from "@lib/cn";
import { batchExpiryStatus } from "@services/stock/batches";
import { fmtDate } from "@lib/format";

export function ExpiryChip({
  expiry,
  className,
}: {
  expiry?: string | null;
  className?: string;
}) {
  if (!expiry) return null;
  const status = batchExpiryStatus(expiry);
  const days = Math.round((new Date(expiry).getTime() - Date.now()) / 86400000);

  const tone =
    status === "expired"
      ? "danger"
      : status === "critical"
        ? "warn"
        : status === "soon"
          ? "info"
          : "sage";
  const cls = {
    danger: "bg-state-danger/15 text-state-danger border-state-danger/30",
    warn: "bg-state-warn/15 text-state-warn border-state-warn/30",
    info: "bg-state-info/15 text-state-info border-state-info/30",
    sage: "bg-accent2/15 text-accent2 border-accent2/30",
  }[tone];

  const label =
    status === "expired"
      ? `Expired ${fmtDate(expiry)}`
      : days <= 30
        ? `${days}d`
        : fmtDate(expiry, "MMM yyyy");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[0.6rem] font-medium",
        cls,
        className,
      )}
    >
      {status === "expired" || status === "critical" ? (
        <AlertTriangle className="w-2.5 h-2.5" />
      ) : (
        <Calendar className="w-2.5 h-2.5" />
      )}
      {label}
    </span>
  );
}
