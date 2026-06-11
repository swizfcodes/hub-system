/**
 * WorkspacePage — Q10: C
 * The manager's daily home: own schedule + team task health + quick create.
 * Route: /workspace
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  Calendar,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { Badge } from "@components/ui/Badge";
import {
  EventFormModal,
  EventDetailPanel,
  EventTypeChip,
} from "@components/calendar/CalendarComponents";
import { TaskFormModal, PriorityBadge } from "@components/tasks/TaskComponents";
import { listEvents } from "@services/calendar";
import { getBoard } from "@services/tasks";
import { isToday, fmtTime } from "@lib/constants/schedulingConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { useAuthStore } from "@stores/useAuthStore";
import { fmtDate } from "@lib/format";
import { cn } from "@lib/cn";
import type { CalendarEvent } from "@typedefs/scheduling";
import { Topbar } from "@components/shell/Topbar";

export default function WorkspacePage() {
  const navigate = useNavigate();
  const { active: business } = useActiveBusiness();
  const { user } = useAuthStore();

  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const endStr = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    23,
    59,
    59,
  ).toISOString();

  // Today's events
  const { data: todayEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["workspace-events", business, todayStr],
    queryFn: () =>
      listEvents({
        business: business!,
        from: new Date(today.setHours(0, 0, 0, 0)).toISOString(),
        to: endStr,
      }),
    enabled: !!business,
    refetchInterval: 60_000,
  });

  // This week's events (for upcoming section)
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const { data: weekEvents = [] } = useQuery({
    queryKey: ["workspace-week-events", business],
    queryFn: () =>
      listEvents({
        business: business!,
        from: new Date().toISOString(),
        to: weekEnd.toISOString(),
      }),
    enabled: !!business,
  });

  // Team task board (all staff)
  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: ["workspace-board", business],
    queryFn: () => getBoard({ business: business! }),
    enabled: !!business,
    refetchInterval: 60_000,
  });

  // Compute overdue tasks (all tasks with due_at < now and not done/cancelled)
  const allActiveTasks = [
    ...(board?.inbox ?? []),
    ...(board?.today ?? []),
    ...(board?.this_week ?? []),
    ...(board?.this_month ?? []),
    ...(board?.later ?? []),
  ];
  const overdueTasks = allActiveTasks.filter(
    (t) => t.due_at && new Date(t.due_at) < today && !t.completed_at,
  );
  const urgentTasks = allActiveTasks.filter((t) => t.priority === "urgent");
  const doneToday = (board?.done ?? []).filter(
    (t) => t.completed_at && isToday(new Date(t.completed_at)),
  );

  // Group tasks by assignee for team overview
  const byAssignee = allActiveTasks.reduce(
    (acc, task) => {
      const name = task.assigned_to_name ?? "Unassigned";
      if (!acc[name]) acc[name] = { overdue: 0, urgent: 0, total: 0 };
      acc[name].total++;
      if (task.due_at && new Date(task.due_at) < today && !task.completed_at)
        acc[name].overdue++;
      if (task.priority === "urgent") acc[name].urgent++;
      return acc;
    },
    {} as Record<string, { overdue: number; urgent: number; total: number }>,
  );

  const teamMembers = Object.entries(byAssignee).sort(
    (a, b) => b[1].overdue - a[1].overdue,
  );

  return (
    <>
      <Topbar title="Workspace" subtitle="Tasks · Notes · Focus" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title={`Good ${getGreeting()}, ${user?.display_name || "there"}`}
          subtitle={today.toLocaleDateString("en-NG", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
          crumbs={[{ label: "Workspace" }]}
          actions={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setShowCreateTask(true)}
              >
                <Plus className="h-4 w-4" />
                New Task
              </Button>
              <Button onClick={() => setShowCreateEvent(true)}>
                <Plus className="h-4 w-4" />
                New Event
              </Button>
            </div>
          }
        />

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={Calendar}
            label="Today's events"
            value={String(todayEvents.length)}
            color="#4E9AF1"
          />
          <StatCard
            icon={CheckCircle2}
            label="Done today"
            value={String(doneToday.length)}
            color="#2D6A4F"
          />
          <StatCard
            icon={AlertCircle}
            label="Overdue"
            value={String(overdueTasks.length)}
            color={overdueTasks.length > 0 ? "#EF4444" : "#9E9891"}
            highlight={overdueTasks.length > 0}
          />
          <StatCard
            icon={Clock}
            label="Urgent tasks"
            value={String(urgentTasks.length)}
            color={urgentTasks.length > 0 ? "#F97316" : "#9E9891"}
            highlight={urgentTasks.length > 0}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left — Today's schedule */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-brand-cream">
                Today's Schedule
              </p>
              <button
                onClick={() => navigate("/calendar")}
                className="flex items-center gap-1 text-xs text-brand-smoke hover:text-brand-accent transition-colors"
              >
                Full calendar <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {eventsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : todayEvents.length === 0 ? (
              <div className="rounded-2xl border border-white/5 bg-brand-charcoal py-10 text-center">
                <Calendar className="mx-auto h-8 w-8 text-brand-smoke/30 mb-2" />
                <p className="text-sm text-brand-smoke">
                  Nothing scheduled for today
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowCreateEvent(true)}
                >
                  Add event
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {todayEvents
                  .sort(
                    (a, b) =>
                      new Date(a.start_at).getTime() -
                      new Date(b.start_at).getTime(),
                  )
                  .map((event) => (
                    <button
                      key={event.event_id}
                      onClick={() => setDetailEvent(event)}
                      className="w-full flex items-center gap-4 rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3 text-left hover:border-white/15 hover:bg-brand-graphite/20 transition-all"
                    >
                      <div className="text-center w-12 shrink-0">
                        <p className="text-sm font-semibold text-brand-cream">
                          {fmtTime(event.start_at)}
                        </p>
                        <p className="text-[10px] text-brand-smoke">
                          {fmtTime(event.end_at)}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-brand-cream truncate">
                          {event.title}
                        </p>
                        {event.location && (
                          <p className="text-xs text-brand-smoke truncate">
                            {event.location}
                          </p>
                        )}
                      </div>
                      <EventTypeChip type={event.event_type} size="xs" />
                    </button>
                  ))}
              </div>
            )}

            {/* Upcoming this week */}
            {weekEvents.filter((e) => !isToday(new Date(e.start_at))).length >
              0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mt-2">
                  Coming Up
                </p>
                <div className="space-y-1.5">
                  {weekEvents
                    .filter((e) => !isToday(new Date(e.start_at)))
                    .slice(0, 4)
                    .map((e) => (
                      <div
                        key={e.event_id}
                        className="flex items-center gap-3 text-sm px-3 py-2 rounded-xl border border-white/5 hover:border-white/10 cursor-pointer"
                        onClick={() => setDetailEvent(e)}
                      >
                        <span className="text-xs text-brand-smoke w-16 shrink-0">
                          {new Date(e.start_at).toLocaleDateString("en-NG", {
                            weekday: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="text-brand-cloud truncate">
                          {e.title}
                        </span>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>

          {/* Right — Team task overview */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-brand-cream">
                Team Task Health
              </p>
              <button
                onClick={() => navigate("/tasks")}
                className="flex items-center gap-1 text-xs text-brand-smoke hover:text-brand-accent transition-colors"
              >
                Kanban board <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {boardLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            ) : teamMembers.length === 0 ? (
              <div className="rounded-2xl border border-white/5 bg-brand-charcoal py-10 text-center">
                <Users className="mx-auto h-8 w-8 text-brand-smoke/30 mb-2" />
                <p className="text-sm text-brand-smoke">No active tasks</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowCreateTask(true)}
                >
                  Create first task
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {teamMembers.map(([name, stats]) => (
                  <div
                    key={name}
                    className="flex items-center gap-4 rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3"
                  >
                    {/* Initials avatar */}
                    <div className="h-8 w-8 rounded-full bg-brand-graphite flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-brand-cream">
                        {name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-brand-cream">
                        {name}
                      </p>
                      <p className="text-xs text-brand-smoke">
                        {stats.total} task{stats.total !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {stats.overdue > 0 && (
                        <Badge tone="danger" size="xs">
                          {stats.overdue} overdue
                        </Badge>
                      )}
                      {stats.urgent > 0 && (
                        <Badge tone="warn" size="xs">
                          {stats.urgent} urgent
                        </Badge>
                      )}
                      {stats.overdue === 0 && stats.urgent === 0 && (
                        <Badge tone="sage" size="xs">
                          On track
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Overdue task list */}
            {overdueTasks.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-widest text-red-400 mt-2">
                  Overdue ({overdueTasks.length})
                </p>
                <div className="space-y-1.5">
                  {overdueTasks.slice(0, 5).map((task) => (
                    <div
                      key={task.task_id}
                      className="flex items-center gap-3 rounded-xl border border-state-danger/20 bg-state-danger/5 px-3 py-2 text-sm"
                    >
                      <PriorityBadge priority={task.priority} />
                      <span className="flex-1 text-brand-cream truncate">
                        {task.title}
                      </span>
                      <span className="text-xs text-red-400 shrink-0">
                        {fmtDate(task.due_at!)}
                      </span>
                    </div>
                  ))}
                  {overdueTasks.length > 5 && (
                    <button
                      onClick={() => navigate("/tasks")}
                      className="text-xs text-brand-smoke hover:text-brand-accent transition-colors"
                    >
                      +{overdueTasks.length - 5} more — see all
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Event detail panel overlay */}
        {detailEvent && (
          <div
            className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setDetailEvent(null)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-white/10 bg-brand-charcoal p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <EventDetailPanel
                event={detailEvent}
                onEdit={() => setDetailEvent(null)}
                onClose={() => setDetailEvent(null)}
              />
            </div>
          </div>
        )}

        {/* Modals */}
        <EventFormModal
          open={showCreateEvent}
          onClose={() => setShowCreateEvent(false)}
        />
        <TaskFormModal
          open={showCreateTask}
          onClose={() => setShowCreateTask(false)}
          isManager={true}
        />
      </div>
    </>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  highlight = false,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-4 bg-brand-charcoal",
        highlight ? "border-red-500/20" : "border-white/5",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke">
          {label}
        </p>
      </div>
      <p
        className="font-display text-2xl font-light tabular-nums"
        style={{ color }}
      >
        {value}
      </p>
    </div>
  );
}
