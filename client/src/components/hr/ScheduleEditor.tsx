import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Select } from "@components/ui/Select";
import { Input } from "@components/ui/Input";
import { Skeleton } from "@components/ui/Skeleton";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import {
  getSchedule,
  updateSchedule,
  listWorkLocations,
  type DayMode,
  type WorkSchedule,
} from "@services/hr";
import { WEEK_DAYS } from "./HrShared";

const MODES: { value: DayMode; label: string }[] = [
  { value: "on_site", label: "Office" },
  { value: "remote", label: "Remote" },
  { value: "off", label: "Off" },
];

export function ScheduleEditor({ profileId }: { profileId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["hr", "schedule", profileId],
    queryFn: () => getSchedule(profileId),
  });
  const { data: locations } = useQuery({
    queryKey: ["hr", "work-locations"],
    queryFn: () => listWorkLocations(),
  });

  const [schedule, setSchedule] = useState<WorkSchedule>({});
  const [locationType, setLocationType] = useState("on_site");
  const [startTime, setStartTime] = useState("");
  const [grace, setGrace] = useState("15");
  const [locationId, setLocationId] = useState("");

  useEffect(() => {
    if (!data) return;
    setSchedule(data.work_schedule || {});
    setLocationType(data.work_location_type || "on_site");
    setStartTime(data.expected_start_time ? data.expected_start_time.slice(0, 5) : "");
    setGrace(String(data.grace_minutes ?? 15));
    setLocationId(data.work_location_id || "");
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      updateSchedule(profileId, {
        work_schedule: schedule,
        work_location_type: locationType as "on_site" | "remote" | "hybrid",
        expected_start_time: startTime || null,
        grace_minutes: Number(grace),
        work_location_id: locationId || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr"] });
      showToast.success("Schedule saved");
    },
    onError: (e) => showToast.error(errMsg(e)),
  });

  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <Card className="p-5 space-y-5">
      <div>
        <h4 className="mb-2 text-sm font-semibold text-brand-cream">Weekly pattern</h4>
        <p className="mb-3 text-xs text-brand-smoke">
          Set where this employee works each day. Attendance only expects a clock-in on Office and
          Remote days; Office days are geofence-checked.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {WEEK_DAYS.map(({ key, label }) => (
            <div key={key} className="rounded-xl border border-white/5 p-2">
              <div className="mb-1 text-center text-xs font-semibold text-brand-cream">{label}</div>
              <div className="flex flex-col gap-1">
                {MODES.map((m) => {
                  const selected = (schedule[key] || "off") === m.value;
                  return (
                    <button
                      key={m.value}
                      onClick={() => setSchedule((s) => ({ ...s, [key]: m.value }))}
                      className={cn(
                        "rounded-md px-1.5 py-1 text-[0.65rem] transition-colors",
                        selected
                          ? "bg-accent3 text-brand-black font-semibold"
                          : "bg-brand-graphite/50 text-brand-smoke hover:bg-brand-graphite",
                      )}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Arrangement"
          options={[
            { value: "on_site", label: "On-site" },
            { value: "hybrid", label: "Hybrid" },
            { value: "remote", label: "Remote" },
          ]}
          value={locationType}
          onChange={(e) => setLocationType(e.target.value)}
        />
        <Input
          label="Expected start"
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
        <Input
          label="Grace (min)"
          type="number"
          min={0}
          value={grace}
          onChange={(e) => setGrace(e.target.value)}
        />
        <Select
          label="Office location"
          options={[
            { value: "", label: "— none —" },
            ...(locations || []).map((l) => ({ value: l.location_id, label: l.name })),
          ]}
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} leftIcon={<Save className="h-4 w-4" />}>
          {mut.isPending ? "Saving…" : "Save schedule"}
        </Button>
      </div>
    </Card>
  );
}
