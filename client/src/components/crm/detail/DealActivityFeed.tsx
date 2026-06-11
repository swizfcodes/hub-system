import { useMemo } from "react";
import { ActivityIcon } from "../shared/ActivityIcon";
import { CRM_ACTIVITY_TYPES } from "@lib/constants/crmActivityTypes";
import { fmtDateTime, fmtRelative } from "@lib/format";
import { EmptyState } from "@components/ui/EmptyState";
import { History } from "lucide-react";
import type { DealActivity } from "@typedefs/crm";

interface Props {
  activities?: DealActivity[] | null;
}

export function DealActivityFeed({ activities }: Props) {
  const sorted = useMemo(
    () =>
      [...(activities ?? [])].sort(
        (a, b) =>
          new Date(b.performed_at).getTime() -
          new Date(a.performed_at).getTime(),
      ),
    [activities],
  );

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={<History className="w-6 h-6" />}
        title="No activity yet"
        description="Log a call, message, meeting, or note — the timeline builds itself from there."
      />
    );
  }

  return (
    <ol className="relative pl-7 border-l border-brand-graphite space-y-4">
      {sorted.map((a) => {
        const meta =
          CRM_ACTIVITY_TYPES[a.activity_type] ?? CRM_ACTIVITY_TYPES.note;
        return (
          <li key={a.activity_id} className="relative">
            <span className="absolute -left-[34px] top-2">
              <ActivityIcon
                type={a.activity_type}
                direction={a.direction}
                size="sm"
              />
            </span>
            <div className="rounded-xl border border-brand-graphite bg-brand-charcoal/50 p-3.5">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <span className="text-sm text-brand-cream">{a.summary}</span>
                <span
                  className={`text-[0.6rem] uppercase tracking-widest font-semibold ${meta.textClass}`}
                >
                  {meta.label}
                  {a.is_auto && " · auto"}
                </span>
              </div>
              <div className="text-[0.65rem] text-brand-smoke mt-1.5">
                {fmtDateTime(a.performed_at)} · {fmtRelative(a.performed_at)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
