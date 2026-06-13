import { Badge } from "@components/ui/Badge";
import { Card } from "@components/ui/Card";
import { cn } from "@lib/cn";
import type { AttendanceStatus, Kpi, WorkSchedule, DayMode } from "@services/hr";

export const WEEK_DAYS: { key: keyof WorkSchedule; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const ATT_TONE: Record<AttendanceStatus, Parameters<typeof Badge>[0]["tone"]> = {
  present: "sage",
  remote: "info",
  late: "gold",
  absent: "rose",
  off: "neutral",
  on_leave: "plum",
  holiday: "neutral",
};

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  return (
    <Badge tone={ATT_TONE[status] || "neutral"} size="xs">
      {status.replace("_", " ")}
    </Badge>
  );
}

const DAY_MODE_STYLE: Record<DayMode, string> = {
  on_site: "bg-accent3/20 text-accent3 border-accent3/30",
  remote: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  off: "bg-brand-graphite/50 text-brand-smoke border-brand-graphite",
};

const DAY_MODE_LABEL: Record<DayMode, string> = {
  on_site: "Office",
  remote: "Remote",
  off: "Off",
};

// Compact read-only week pattern strip.
export function WeekScheduleView({ schedule }: { schedule: WorkSchedule }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEK_DAYS.map(({ key, label }) => {
        const mode = (schedule?.[key] || "off") as DayMode;
        return (
          <div
            key={key}
            className={cn(
              "flex flex-col items-center rounded-lg border px-2.5 py-1.5 text-[0.65rem]",
              DAY_MODE_STYLE[mode],
            )}
            title={`${label}: ${DAY_MODE_LABEL[mode]}`}
          >
            <span className="font-semibold">{label}</span>
            <span className="opacity-80">{DAY_MODE_LABEL[mode]}</span>
          </div>
        );
      })}
    </div>
  );
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-brand-smoke";
  if (score >= 85) return "text-emerald-400";
  if (score >= 65) return "text-amber-400";
  return "text-rose-400";
}

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {kpis.map((k) => (
        <Card key={k.key} className="p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-brand-smoke">{k.label}</span>
            {k.target != null && (
              <span className="text-[0.6rem] text-brand-smoke/70">
                target {k.target}
                {k.unit === "%" ? "%" : ""}
              </span>
            )}
          </div>
          <div className={cn("mt-1 font-display text-2xl", scoreColor(k.score))}>
            {k.value == null
              ? "—"
              : k.unit === "%"
                ? `${k.value}%`
                : k.unit.startsWith("₦")
                  ? `₦${Number(k.value).toLocaleString("en-NG")}`
                  : k.value}
          </div>
          <p className="mt-0.5 text-[0.65rem] text-brand-smoke">{k.hint}</p>
        </Card>
      ))}
    </div>
  );
}

// Big circular-ish overall score + 0–5 rating.
export function OverallScore({
  score,
  rating,
}: {
  score: number | null;
  rating: number | null;
}) {
  return (
    <div className="flex items-center gap-4">
      <div
        className={cn(
          "flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border-4",
          score == null
            ? "border-brand-graphite text-brand-smoke"
            : score >= 85
              ? "border-emerald-500/40 text-emerald-400"
              : score >= 65
                ? "border-amber-500/40 text-amber-400"
                : "border-rose-500/40 text-rose-400",
        )}
      >
        <span className="font-display text-2xl leading-none">{score ?? "—"}</span>
        <span className="text-[0.55rem] uppercase tracking-wider opacity-70">score</span>
      </div>
      <div>
        <div className="text-sm text-brand-cream">Overall performance</div>
        <div className="text-xs text-brand-smoke">
          {rating != null ? `${rating.toFixed(1)} / 5.0 rating` : "Not enough data yet"}
        </div>
      </div>
    </div>
  );
}
