import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import {
  addMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
} from "date-fns";
import { Button } from "@components/ui/Button";
import { EmptyState } from "@components/ui/EmptyState";
import { Skeleton } from "@components/ui/Skeleton";
import { fmtMoney } from "@lib/format";
import type { PipelineStageWithDeals } from "@typedefs/crm";
import { cn } from "@lib/cn";

interface Props {
  pipeline?: PipelineStageWithDeals[];
  loading?: boolean;
}

export function PipelineCalendar({ pipeline, loading }: Props) {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(new Date());

  const dealsByDate = useMemo(() => {
    const map: Record<
      string,
      Array<PipelineStageWithDeals["deals"][number] & { stage_colour: string }>
    > = {};
    for (const stage of pipeline ?? []) {
      for (const d of stage.deals) {
        if (!d.expected_close_date) continue;
        const key = d.expected_close_date.slice(0, 10);
        (map[key] = map[key] || []).push({ ...d, stage_colour: stage.colour });
      }
    }
    return map;
  }, [pipeline]);

  const days = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    // Pad to full weeks for grid.
    const padBefore = (start.getDay() + 6) % 7; // Monday-first
    const days = eachDayOfInterval({ start, end });
    const pad: Date[] = [];
    for (let i = padBefore - 1; i >= 0; i--) {
      const d = new Date(start);
      d.setDate(start.getDate() - i - 1);
      pad.push(d);
    }
    return [...pad, ...days];
  }, [cursor]);

  if (loading) return <Skeleton className="h-[500px]" />;

  const today = new Date();
  const hasAnyDates = Object.keys(dealsByDate).length > 0;

  if (!hasAnyDates) {
    return (
      <EmptyState
        icon={<CalendarRange className="w-6 h-6" />}
        title="No expected close dates"
        description="Add expected close dates to your deals to see them in this calendar view."
      />
    );
  }

  return (
    <div className="rounded-2xl border border-brand-graphite bg-brand-charcoal/60 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-brand-graphite">
        <h3 className="font-display text-xl text-brand-cream">
          {format(cursor, "MMMM yyyy")}
        </h3>
        <div className="inline-flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCursor(addMonths(cursor, -1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCursor(new Date())}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCursor(addMonths(cursor, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-brand-graphite">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-[0.6rem] uppercase tracking-widest text-brand-smoke font-semibold text-center"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-fr">
        {days.map((day, i) => {
          const key = day.toISOString().slice(0, 10);
          const list = dealsByDate[key] || [];
          const otherMonth = !isSameMonth(day, cursor);
          const isToday = isSameDay(day, today);
          return (
            <div
              key={i}
              className={cn(
                "min-h-[96px] p-1.5 border-r border-b border-brand-graphite/60",
                otherMonth && "opacity-30",
              )}
            >
              <div
                className={cn(
                  "inline-flex items-center justify-center w-6 h-6 rounded-full text-[0.7rem]",
                  isToday
                    ? "bg-brand-accent text-brand-black font-bold"
                    : "text-brand-smoke",
                )}
              >
                {format(day, "d")}
              </div>
              <div className="mt-1 space-y-1">
                {list.slice(0, 3).map((d) => (
                  <button
                    key={d.deal_id}
                    onClick={() => navigate(`/crm/${d.deal_id}`)}
                    className="w-full block text-left px-1.5 py-1 rounded text-[0.6rem] truncate hover:bg-brand-charcoal transition-colors"
                    style={{
                      borderLeft: `3px solid ${d.stage_colour}`,
                      color: "#F0EAE0",
                    }}
                    title={`${d.title} · ${fmtMoney(d.expected_value, "NGN")}`}
                  >
                    {d.title}
                  </button>
                ))}
                {list.length > 3 && (
                  <div className="text-[0.55rem] text-brand-smoke px-1.5">
                    +{list.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
