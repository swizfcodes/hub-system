import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, LogIn, LogOut, MapPin } from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { getMyToday, clockIn, clockOut, captureGeo } from "@services/hr";

function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}`;
}

function fmtWorked(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "Today" card for the My HR dashboard — surfaces the clock-in time, a live
// running shift timer, and the clock in / out action right at the top so staff
// can act the moment they land on the page.
export function TodayAttendanceCard() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["hr", "me", "today"],
    queryFn: getMyToday,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

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

  // Not linked to a staff profile — nothing to track.
  if (!isLoading && !data) return null;

  function run(mut: typeof inMut | typeof outMut) {
    if (busy) return;
    setBusy(true);
    mut.mutate();
  }

  const record = data?.record;
  const clockedIn = !!data?.clocked_in;
  const clockedOut = !!data?.clocked_out;
  const isOff = data?.expected_mode === "off";

  // Headline status line.
  let statusLabel = "Not clocked in yet";
  let statusTone: "warn" | "sage" | "neutral" = "warn";
  if (clockedOut) {
    statusLabel = "Clocked out";
    statusTone = "neutral";
  } else if (clockedIn) {
    statusLabel = "On shift";
    statusTone = "sage";
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2">
            <Clock className="h-4 w-4 text-accent3" />
            <h3 className="text-sm font-semibold text-brand-cream">Today</h3>
            <Badge tone={statusTone} size="xs">
              {statusLabel}
            </Badge>
            {isOff && !clockedIn && !clockedOut && (
              <Badge tone="neutral" size="xs">
                Day off
              </Badge>
            )}
          </div>

          {clockedIn && !clockedOut && record?.clock_in_at ? (
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tabular-nums text-accent3">
                {fmtElapsed(Date.now() - new Date(record.clock_in_at).getTime())}
              </span>
              <span className="text-xs text-brand-smoke">
                on shift · in at {fmtTime(record.clock_in_at)}
              </span>
            </div>
          ) : clockedOut && record?.clock_in_at ? (
            <p className="text-xs text-brand-smoke">
              In {fmtTime(record.clock_in_at)}
              {record.clock_out_at ? ` · Out ${fmtTime(record.clock_out_at)}` : ""}
              {record.worked_minutes != null
                ? ` · ${fmtWorked(record.worked_minutes)} worked`
                : ""}
            </p>
          ) : (
            <p className="text-xs text-brand-smoke">
              {isOff
                ? "It's your day off — clock in only if you're working."
                : "Clock in to start tracking your shift."}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {data?.work_location_name && (
            <span className="hidden items-center gap-1 text-xs text-brand-smoke sm:inline-flex">
              <MapPin className="h-3.5 w-3.5 opacity-60" />
              {data.work_location_name}
            </span>
          )}
          {!clockedOut &&
            (clockedIn ? (
              <Button
                variant="ghost"
                onClick={() => run(outMut)}
                disabled={busy}
                leftIcon={<LogOut className="h-4 w-4" />}
              >
                {busy ? "…" : "Clock out"}
              </Button>
            ) : (
              <Button
                onClick={() => run(inMut)}
                disabled={busy}
                leftIcon={<LogIn className="h-4 w-4" />}
              >
                {busy ? "…" : "Clock in"}
              </Button>
            ))}
        </div>
      </div>
    </Card>
  );
}
