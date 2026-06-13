import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, LogIn, LogOut, MapPin } from "lucide-react";
import { cn } from "@lib/cn";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { getMyToday, clockIn, clockOut, captureGeo } from "@services/hr";

// Compact clock in / out control that lives in the shell top bar.
// Hidden for users whose account isn't linked to a staff profile.
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
  // Scheduled day off and not working — no clock control needed.
  if (data.expected_mode === "off" && !data.clocked_in) return null;

  const { clocked_in, clocked_out } = data;

  function handle(fn: typeof inMut | typeof outMut) {
    if (busy) return;
    setBusy(true);
    fn.mutate();
  }

  if (clocked_out) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs",
          "bg-brand-graphite/60 text-brand-smoke border border-brand-graphite",
        )}
        title="You've clocked out for today"
      >
        <Clock className="w-3.5 h-3.5" />
        {!compact && <span>Done for today</span>}
      </div>
    );
  }

  const active = !clocked_in
    ? { label: "Clock in", icon: <LogIn className="w-3.5 h-3.5" />, run: () => handle(inMut) }
    : { label: "Clock out", icon: <LogOut className="w-3.5 h-3.5" />, run: () => handle(outMut) };

  return (
    <button
      onClick={active.run}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
        !clocked_in
          ? "bg-accent3/20 text-accent3 hover:bg-accent3/30 border border-accent3/30"
          : "bg-brand-graphite text-brand-cream hover:bg-brand-graphite/70 border border-brand-graphite",
      )}
      title={
        data.work_location_name
          ? `${data.expected_mode === "remote" ? "Remote" : "On-site"} · ${data.work_location_name}`
          : data.expected_mode === "remote"
            ? "Remote day"
            : "On-site day"
      }
    >
      {active.icon}
      {!compact && <span>{busy ? "…" : active.label}</span>}
      {!compact && data.expected_mode === "on_site" && (
        <MapPin className="w-3 h-3 opacity-60" />
      )}
    </button>
  );
}
