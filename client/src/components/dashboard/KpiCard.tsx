import { cn } from "@lib/cn";
import { fmtMoney } from "@lib/format";

interface KpiCardProps {
  label: string;
  value: string | number;
  type?: "currency" | "number" | "percent" | "text";
  currency?: string;
  sub?: string;
  delta?: number | null; // % change vs previous period
  alertColor?: string; // override card accent
  restricted?: boolean; // blur for insufficient permissions
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}

export function KpiCard({
  label,
  value,
  type = "number",
  currency = "NGN",
  sub,
  delta,
  alertColor,
  restricted = false,
  onClick,
  size = "md",
}: KpiCardProps) {
  // Format the value
  function formatValue(v: string | number): string {
    if (restricted) return "••••";
    const n = typeof v === "string" ? parseFloat(v) : v;
    switch (type) {
      case "currency":
        return isNaN(n) ? String(v) : fmtMoney(n, currency);
      case "percent":
        return isNaN(n) ? String(v) : `${n.toFixed(1)}%`;
      case "number":
        return isNaN(n) ? String(v) : n.toLocaleString("en-NG");
      default:
        return String(v);
    }
  }

  const accentColor = restricted ? "#9E9891" : (alertColor ?? "#C9A86C");
  const isAlert = !!alertColor && !restricted;

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl border bg-brand-charcoal transition-all",
        size === "sm" ? "px-3 py-3" : size === "lg" ? "px-6 py-5" : "px-4 py-4",
        isAlert ? "border-red-500/30" : "border-white/5",
        onClick &&
          "cursor-pointer hover:border-white/15 hover:bg-brand-graphite/20",
      )}
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      <p
        className={cn(
          "uppercase tracking-widest text-brand-smoke",
          size === "sm" ? "text-[0.55rem]" : "text-[0.65rem]",
        )}
      >
        {label}
      </p>

      <p
        className={cn(
          "font-display font-light tabular-nums mt-1",
          restricted && "blur-sm select-none",
          size === "sm" ? "text-xl" : size === "lg" ? "text-4xl" : "text-2xl",
        )}
        style={{ color: accentColor }}
      >
        {formatValue(value)}
      </p>

      {(sub || delta != null) && (
        <div className="flex items-center justify-between mt-1 gap-2">
          {sub && (
            <p className="text-[10px] text-brand-smoke truncate">{sub}</p>
          )}
          {delta != null && !restricted && <DeltaChip delta={delta} />}
        </div>
      )}

      {restricted && (
        <p className="text-[10px] text-brand-smoke/50 mt-1">Restricted</p>
      )}
    </div>
  );
}

// ── Delta chip ────────────────────────────────────────────────────────────────

function DeltaChip({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.1) {
    return <span className="text-[10px] text-brand-smoke/50">—</span>;
  }
  const up = delta > 0;
  const color = up ? "#2D6A4F" : "#EF4444";
  return (
    <span
      className="text-[10px] font-semibold tabular-nums shrink-0"
      style={{ color }}
    >
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

// ── StatRow — compact horizontal alternative to KpiCard ──────────────────────

interface StatRowProps {
  label: string;
  value: string | number;
  type?: KpiCardProps["type"];
  currency?: string;
  accent?: string;
}

export function StatRow({
  label,
  value,
  type = "number",
  currency = "NGN",
  accent,
}: StatRowProps) {
  function fmt(v: string | number): string {
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (type === "currency")
      return isNaN(n) ? String(v) : fmtMoney(n, currency);
    if (type === "percent") return isNaN(n) ? String(v) : `${n.toFixed(1)}%`;
    if (type === "number")
      return isNaN(n) ? String(v) : n.toLocaleString("en-NG");
    return String(v);
  }
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2 last:border-0">
      <span className="text-xs text-brand-smoke">{label}</span>
      <span
        className="text-xs font-semibold tabular-nums text-brand-cream"
        style={accent ? { color: accent } : undefined}
      >
        {fmt(value)}
      </span>
    </div>
  );
}
