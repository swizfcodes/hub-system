import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  List,
  LayoutGrid,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import {
  EventPill,
  EventFormModal,
  EventDetailPanel,
} from "@components/calendar/CalendarComponents";
import { listEvents } from "@services/calendar";
import {
  MONTH_NAMES,
  DAY_NAMES,
  generateMonthGrid,
  isSameDay,
  isToday,
  eventsForDay,
  EVENT_TYPE_META,
  fmtTime,
} from "@lib/constants/schedulingConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { cn } from "@lib/cn";
import type { CalendarEvent } from "@typedefs/scheduling";
import { Topbar } from "@/components/shell/Topbar";

type CalView = "month" | "week" | "list";

export default function CalendarPage() {
  const { active: business } = useActiveBusiness();

  const [view, setView] = useState<CalView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [defaultStart, setDefaultStart] = useState<string | undefined>();

  // Compute range for the current view
  const { rangeStart, rangeEnd } = getViewRange(view, currentDate);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["calendar-events", business, rangeStart, rangeEnd],
    queryFn: () =>
      listEvents({
        business: business!,
        from: rangeStart,
        to: rangeEnd,
      }),
    enabled: !!business,
    refetchInterval: 60_000,
  });

  function navigate(dir: -1 | 1) {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (view === "month") d.setMonth(d.getMonth() + dir);
      else if (view === "week") d.setDate(d.getDate() + 7 * dir);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
  }

  function handleDayClick(day: Date) {
    setSelectedDay(day);
  }

  function handleDayDoubleClick(day: Date) {
    const dt = new Date(day);
    dt.setHours(9, 0, 0);
    setDefaultStart(dt.toISOString());
    setShowCreate(true);
  }

  const title =
    view === "month"
      ? `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
      : view === "week"
        ? `Week of ${currentDate.toLocaleDateString("en-NG", { month: "short", day: "numeric" })}`
        : `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  const selectedEvents = selectedDay ? eventsForDay(events, selectedDay) : [];

  return (
    <>
      <Topbar title="Calendar" subtitle="Events · Meetings · Deadlines." />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-[1500px] mx-auto">
        <PageHeader
          title="Calendar"
          subtitle="Schedule events, meetings, and track deadlines."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Calendar" }]}
          actions={
            <Button
              onClick={() => {
                setDefaultStart(undefined);
                setShowCreate(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New Event
            </Button>
          }
        />

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate(-1)}
              className="rounded-lg p-2 text-brand-smoke hover:text-brand-cream hover:bg-brand-graphite/30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-brand-smoke hover:text-brand-cream hover:bg-brand-graphite/30 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => navigate(1)}
              className="rounded-lg p-2 text-brand-smoke hover:text-brand-cream hover:bg-brand-graphite/30 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <h2 className="text-lg font-semibold text-brand-cream">{title}</h2>

          <div className="ml-auto flex items-center gap-1 rounded-xl border border-white/5 bg-brand-charcoal p-1">
            {(
              [
                { key: "month", icon: LayoutGrid, label: "Month" },
                { key: "week", icon: Calendar, label: "Week" },
                { key: "list", icon: List, label: "List" },
              ] as const
            ).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  view === key
                    ? "bg-brand-accent text-brand-black"
                    : "text-brand-smoke hover:text-brand-cream",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          className={cn(
            "flex gap-4",
            detailEvent ? "flex-col lg:flex-row" : "",
          )}
        >
          {/* Main calendar area */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <Skeleton className="h-96 rounded-2xl" />
            ) : view === "month" ? (
              <MonthView
                currentDate={currentDate}
                events={events}
                selectedDay={selectedDay}
                onDayClick={handleDayClick}
                onDayDoubleClick={handleDayDoubleClick}
                onEventClick={(e) => {
                  setDetailEvent(e);
                  setEditEvent(null);
                }}
              />
            ) : view === "week" ? (
              <WeekView
                currentDate={currentDate}
                events={events}
                onEventClick={(e) => {
                  setDetailEvent(e);
                  setEditEvent(null);
                }}
                onSlotClick={(dt) => {
                  setDefaultStart(dt);
                  setShowCreate(true);
                }}
              />
            ) : (
              <ListView
                events={events}
                onEventClick={(e) => {
                  setDetailEvent(e);
                  setEditEvent(null);
                }}
              />
            )}
          </div>

          {/* Event detail panel */}
          {detailEvent && (
            <div className="w-full lg:w-72 shrink-0">
              <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-5 sticky top-6">
                <EventDetailPanel
                  event={detailEvent}
                  onEdit={() => {
                    setEditEvent(detailEvent);
                    setDetailEvent(null);
                  }}
                  onClose={() => setDetailEvent(null)}
                />
              </div>
            </div>
          )}

          {/* Selected day panel (month view) */}
          {view === "month" && selectedDay && !detailEvent && (
            <div className="w-full lg:w-64 shrink-0">
              <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-4 sticky top-6 space-y-3">
                <p className="text-sm font-semibold text-brand-cream">
                  {selectedDay.toLocaleDateString("en-NG", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
                {selectedEvents.length === 0 ? (
                  <p className="text-xs text-brand-smoke">No events</p>
                ) : (
                  selectedEvents.map((e) => (
                    <button
                      key={e.event_id}
                      onClick={() => setDetailEvent(e)}
                      className="w-full text-left rounded-lg border border-white/5 bg-brand-graphite/30 px-3 py-2 hover:border-white/15 transition-colors"
                    >
                      <p className="text-xs font-medium text-brand-cream truncate">
                        {e.title}
                      </p>
                      <p className="text-[10px] text-brand-smoke">
                        {fmtTime(e.start_at)}
                      </p>
                    </button>
                  ))
                )}
                <Button
                  size="sm"
                  fullWidth
                  variant="ghost"
                  onClick={() => handleDayDoubleClick(selectedDay)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add event
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Modals */}
        <EventFormModal
          open={showCreate}
          onClose={() => {
            setShowCreate(false);
            setDefaultStart(undefined);
          }}
          defaultStart={defaultStart}
        />
        {editEvent && (
          <EventFormModal
            open={!!editEvent}
            onClose={() => setEditEvent(null)}
            existing={editEvent}
          />
        )}
      </div>
    </>
  );
}

// ── MonthView ─────────────────────────────────────────────────────────────────

function MonthView({
  currentDate,
  events,
  selectedDay,
  onDayClick,
  onDayDoubleClick,
  onEventClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  selectedDay: Date | null;
  onDayClick: (d: Date) => void;
  onDayDoubleClick: (d: Date) => void;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const weeks = generateMonthGrid(
    currentDate.getFullYear(),
    currentDate.getMonth(),
  );
  const currentMonth = currentDate.getMonth();

  return (
    <div className="rounded-2xl border border-white/5 bg-brand-charcoal overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-white/5">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[0.65rem] font-semibold uppercase tracking-widest text-brand-smoke"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="divide-y divide-white/5">
        {weeks.map((week, wi) => (
          <div
            key={wi}
            className="grid grid-cols-7 divide-x divide-white/5"
            style={{ minHeight: 96 }}
          >
            {week.map((day, di) => {
              const dayEvents = eventsForDay(events, day);
              const isThisMonth = day.getMonth() === currentMonth;
              const _isToday = isToday(day);
              const isSelected = selectedDay && isSameDay(day, selectedDay);

              return (
                <div
                  key={di}
                  onClick={() => onDayClick(day)}
                  onDoubleClick={() => onDayDoubleClick(day)}
                  className={cn(
                    "min-h-24 p-1.5 cursor-pointer transition-colors",
                    isThisMonth ? "bg-transparent" : "bg-brand-graphite/10",
                    isSelected
                      ? "bg-brand-accent/5"
                      : "hover:bg-brand-graphite/20",
                  )}
                >
                  {/* Day number */}
                  <div
                    className={cn(
                      "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                      _isToday
                        ? "bg-brand-accent text-brand-black font-bold"
                        : "",
                      !isThisMonth ? "text-brand-smoke/40" : "text-brand-cloud",
                    )}
                  >
                    {day.getDate()}
                  </div>

                  {/* Events (up to 3 pills) */}
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((e) => (
                      <EventPill
                        key={e.event_id}
                        event={e}
                        onClick={onEventClick}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[9px] text-brand-smoke pl-1">
                        +{dayEvents.length - 3} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── WeekView ──────────────────────────────────────────────────────────────────

function WeekView({
  currentDate,
  events,
  onEventClick,
  onSlotClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onSlotClick: (dt: string) => void;
}) {
  // Generate 7 days starting from Sunday of the week
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    return d;
  });

  const hours = Array.from({ length: 13 }, (_, i) => i + 7); // 7am – 7pm

  return (
    <div className="rounded-2xl border border-white/5 bg-brand-charcoal overflow-hidden overflow-x-auto">
      {/* Day headers */}
      <div className="grid grid-cols-8 border-b border-white/5">
        <div className="px-3 py-3 text-xs text-brand-smoke"></div>
        {days.map((d, i) => (
          <div
            key={i}
            className={cn(
              "px-2 py-3 text-center",
              isToday(d) && "bg-brand-accent/5",
            )}
          >
            <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke">
              {DAY_NAMES[d.getDay()]}
            </p>
            <p
              className={cn(
                "text-sm font-semibold",
                isToday(d) ? "text-brand-accent" : "text-brand-cream",
              )}
            >
              {d.getDate()}
            </p>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="divide-y divide-white/5">
        {hours.map((hour) => (
          <div
            key={hour}
            className="grid grid-cols-8"
            style={{ minHeight: 48 }}
          >
            <div className="px-3 py-1 text-[0.65rem] text-brand-smoke/60">
              {hour % 12 === 0 ? 12 : hour % 12}
              {hour < 12 ? "am" : "pm"}
            </div>
            {days.map((day, di) => {
              const slotEvents = events.filter((e) => {
                const start = new Date(e.start_at);
                return isSameDay(start, day) && start.getHours() === hour;
              });
              const slotDt = new Date(day);
              slotDt.setHours(hour, 0, 0);

              return (
                <div
                  key={di}
                  onClick={() => onSlotClick(slotDt.toISOString())}
                  className="border-l border-white/5 p-0.5 cursor-pointer hover:bg-brand-graphite/10 transition-colors"
                >
                  {slotEvents.map((e) => {
                    const meta =
                      EVENT_TYPE_META[e.event_type] ?? EVENT_TYPE_META.other;
                    return (
                      <div
                        key={e.event_id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onEventClick(e);
                        }}
                        className="rounded px-1.5 py-0.5 text-[0.6rem] font-medium cursor-pointer leading-tight mb-0.5"
                        style={{
                          backgroundColor: meta.bg,
                          color: meta.color,
                          borderLeft: `2px solid ${meta.color}`,
                        }}
                      >
                        {e.title}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ListView ──────────────────────────────────────────────────────────────────

function ListView({
  events,
  onEventClick,
}: {
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
}) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-brand-charcoal py-16 text-center">
        <Calendar className="mx-auto h-10 w-10 text-brand-smoke/30 mb-3" />
        <p className="text-sm text-brand-smoke">No events in this period</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((event) => {
        const meta = EVENT_TYPE_META[event.event_type] ?? EVENT_TYPE_META.other;
        return (
          <button
            key={event.event_id}
            onClick={() => onEventClick(event)}
            className="w-full flex items-start gap-4 rounded-2xl border border-white/5 bg-brand-charcoal px-5 py-4 text-left hover:border-white/15 hover:bg-brand-graphite/20 transition-all"
          >
            <div
              className="mt-1 h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: meta.color }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-brand-cream truncate">
                {event.title}
              </p>
              <p className="text-xs text-brand-smoke mt-0.5">
                {new Date(event.start_at).toLocaleDateString("en-NG", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
                {" · "}
                {event.all_day
                  ? "All day"
                  : `${fmtTime(event.start_at)} – ${fmtTime(event.end_at)}`}
              </p>
              {event.location && (
                <p className="text-xs text-brand-smoke/60 mt-0.5">
                  {event.location}
                </p>
              )}
            </div>
            <span
              className="text-[0.6rem] uppercase font-semibold px-2 py-0.5 rounded-full border shrink-0"
              style={{ color: meta.color, borderColor: `${meta.color}40` }}
            >
              {meta.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function getViewRange(
  view: CalView,
  date: Date,
): { rangeStart: string; rangeEnd: string } {
  const d = new Date(date);
  if (view === "month") {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      rangeStart: start.toISOString(),
      rangeEnd: new Date(
        end.getFullYear(),
        end.getMonth(),
        end.getDate(),
        23,
        59,
        59,
      ).toISOString(),
    };
  }
  if (view === "week") {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      rangeStart: new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
      ).toISOString(),
      rangeEnd: new Date(
        end.getFullYear(),
        end.getMonth(),
        end.getDate(),
        23,
        59,
        59,
      ).toISOString(),
    };
  }
  // list = month range
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    rangeStart: start.toISOString(),
    rangeEnd: new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate(),
      23,
      59,
      59,
    ).toISOString(),
  };
}
