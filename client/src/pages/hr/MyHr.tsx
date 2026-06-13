import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Plane, Clock } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { Tabs } from "@components/ui/Tabs";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { getMyHr } from "@services/hr";
import { WeekScheduleView } from "@components/hr/HrShared";
import { ClockWidget } from "@components/hr/ClockWidget";
import { AttendancePanel } from "@components/hr/AttendancePanel";
import { PerformancePanel } from "@components/hr/PerformancePanel";
import { QueriesPanel } from "@components/hr/QueriesPanel";
import { RequestLeaveModal } from "@components/hr/RequestLeaveModal";

export default function MyHr() {
  const [tab, setTab] = useState("attendance");
  const [leaveOpen, setLeaveOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["hr", "me"],
    queryFn: getMyHr,
    retry: false,
  });

  if (isError) {
    return (
      <>
        <Topbar title="My HR" />
        <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto">
          <EmptyState
            title="No staff profile linked"
            description="Your account isn't linked to an employee profile yet. Ask HR to link it so you can clock in, request leave and see your performance."
          />
        </div>
      </>
    );
  }

  const openQueries = data?.open_queries.length || 0;

  return (
    <>
      <Topbar title="My HR" subtitle="Attendance · Leave · Performance" />
      <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <PageHeader
          title="My HR"
          subtitle="Your attendance, leave, queries and performance — all in one place."
          crumbs={[{ label: "My HR" }]}
          actions={
            <div className="flex items-center gap-2">
              <ClockWidget />
              <Button onClick={() => setLeaveOpen(true)} leftIcon={<Plane className="h-4 w-4" />}>
                Request leave
              </Button>
            </div>
          }
        />

        {isLoading || !data ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5 md:col-span-2">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-accent3" />
                <h3 className="text-sm font-semibold text-brand-cream">My week</h3>
                <Badge tone="neutral" size="xs">
                  {data.schedule.work_location_type.replace("_", " ")}
                </Badge>
              </div>
              <WeekScheduleView schedule={data.schedule.work_schedule} />
              <div className="mt-3 flex items-center gap-2 text-xs text-brand-smoke">
                <Clock className="h-3.5 w-3.5" />
                {data.schedule.expected_start_time
                  ? `Expected start ${data.schedule.expected_start_time.slice(0, 5)} · ${data.schedule.grace_minutes}m grace`
                  : "No fixed start time"}
                {data.schedule.work_location_name ? ` · ${data.schedule.work_location_name}` : ""}
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-brand-cream">Leave balance</h3>
              {data.leave_balance?.length ? (
                <div className="space-y-1.5">
                  {data.leave_balance.map((b) => (
                    <div key={b.leave_type} className="flex justify-between text-xs">
                      <span className="capitalize text-brand-smoke">{b.leave_type}</span>
                      <span className="text-brand-cream">{b.days_taken} taken</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-brand-smoke">No leave taken this year.</p>
              )}
            </Card>
          </div>
        )}

        <Tabs
          tabs={[
            { key: "attendance", label: "Attendance" },
            { key: "performance", label: "Performance" },
            { key: "queries", label: "Queries", badge: openQueries || undefined },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "attendance" && <AttendancePanel mode="self" />}
        {tab === "performance" && <PerformancePanel self />}
        {tab === "queries" && <QueriesPanel mode="self" />}
      </div>

      <RequestLeaveModal open={leaveOpen} onClose={() => setLeaveOpen(false)} />
    </>
  );
}
