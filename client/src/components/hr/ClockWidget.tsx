import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, LogIn, LogOut, MapPin } from "lucide-react";
import { cn } from "@lib/cn";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { getMyToday, clockIn, clockOut, captureGeo } from "@services/hr";

// Format a running duration (ms) as H:MM:SS for the live "time on shift" timer.
function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}`;
}

// Format a settled worked total (minutes) as "Xh Ym".
function fmtWorked(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Clock in / out control for the shell top bar. Shows a clear call-to-action
// to clock in, a live ticking timer once on shift, and a clock-out button.
// Hidden only for accounts not linked to a staff profile (nothing to track).
export function ClockWidget({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data, isError } = useQuery({
    queryKey: ["hr", "me", "today"],
    queryFn: getMyToday,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // Drive the live timer — re-render every second while on shift.
  const [, setTick] = useState(0);
  const onShift = !!data?.clocked_in && !data?.clocked_out;
  useEffect(() => {
    if (!onShift) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [onShift]);

  const inMut = useMutation({
    mutationFn: async () => clockIn(await captureGeo()),
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ["hr", "me"] });
      if (rec.is_offsite)
        showToast.info("Clocked in — note: you're outside the office geofence");
      else if (rec.status === "late")
        showToast.warn(`Clocked in — ${rec.late_minutes} min late`);
      else showToast.success("Clocked in");
    },
    onError: (e) => showToast.error(errMsg(e)),
    onSettled: () => setBusy(false),
  });

  const outMut = useMutation({
    mutationFn: async () => clockOut(await captureGeo()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr", "me"] });
      showToast.success("Clocked out — have a good one");
    },
    onError: (e) => showToast.error(errMsg(e)),
    onSettled: () => setBusy(false),
  });

  // Not a staff member (or endpoint unavailable) — render nothing.
  if (isError || !data) return null;

  const { clocked_in, clocked_out, record } = data;

  function handle(fn: typeof inMut | typeof outMut) {
    if (busy) return;
    setBusy(true);
    fn.mutate();
  }

  // ── Clocked out — show the settled total for the day ──────────────────────
  if (clocked_out) {
    const worked = record?.worked_minutes;
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs",
          "bg-brand-graphite/60 text-brand-smoke border border-brand-graphite",
        )}
        title="You've clocked out for today"
      >
        <Clock className="w-3.5 h-3.5" />
        {!compact && (
          <span>
            Done{worked != null ? ` · ${fmtWorked(worked)}` : " for today"}
          </span>
        )}
      </div>
    );
  }

  // ── On shift — live timer + clock-out ─────────────────────────────────────
  if (clocked_in && record?.clock_in_at) {
    const since = new Date(record.clock_in_at);
    const elapsed = fmtElapsed(Date.now() - since.getTime());
    const sinceLabel = since.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <div className="inline-flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums",
            "bg-accent3/15 text-accent3 border border-accent3/30",
          )}
          title={`On shift since ${sinceLabel}`}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent3 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent3" />
          </span>
          {elapsed}
        </span>
        <button
          onClick={() => handle(outMut)}
          disabled={busy}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
            "bg-brand-graphite text-brand-cream hover:bg-brand-graphite/70 border border-brand-graphite",
          )}
          title="Clock out"
        >
          <LogOut className="w-3.5 h-3.5" />
          {!compact && <span>{busy ? "…" : "Clock out"}</span>}
        </button>
      </div>
    );
  }

  // ── Not clocked in yet — prominent call to action ─────────────────────────
  const isOff = data.expected_mode === "off";
  return (
    <button
      onClick={() => handle(inMut)}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60",
        "bg-accent3/20 text-accent3 hover:bg-accent3/30 border border-accent3/40",
      )}
      title={
        isOff
          ? "Day off — clocking in records the time as worked"
          : data.work_location_name
            ? `${data.expected_mode === "remote" ? "Remote" : "On-site"} · ${data.work_location_name}`
            : data.expected_mode === "remote"
              ? "Remote day"
              : "On-site day"
      }
    >
      <LogIn className="w-3.5 h-3.5" />
      <span>{busy ? "…" : "Clock in"}</span>
      {!compact && data.expected_mode === "on_site" && (
        <MapPin className="w-3 h-3 opacity-60" />
      )}
    </button>
  );
}
