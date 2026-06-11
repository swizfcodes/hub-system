import { useNavigate } from "react-router-dom";
import { Star, Calendar } from "lucide-react";
import { fmtMoney, fmtDate, fmtRelative } from "@lib/format";
import type { PipelineStageWithDeals } from "@typedefs/crm";
import { cn } from "@lib/cn";

type DealLite = PipelineStageWithDeals["deals"][number];

interface Props {
  deal: DealLite;
  dragging?: boolean;
  compact?: boolean;
  className?: string;
  draggableProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function DealCard({
  deal,
  dragging,
  compact,
  className,
  draggableProps,
}: Props) {
  const navigate = useNavigate();
  const isStale =
    Date.now() - new Date(deal.updated_at).getTime() > 14 * 24 * 60 * 60 * 1000;
  const isOverdue =
    deal.expected_close_date &&
    new Date(deal.expected_close_date).getTime() < Date.now();

  return (
    <div
      {...draggableProps}
      onClick={() => navigate(`/crm/${deal.deal_id}`)}
      className={cn(
        "group cursor-pointer rounded-xl border bg-brand-charcoal border-brand-graphite p-3 transition-all",
        "hover:border-brand-accent/40 hover:shadow-card",
        dragging && "opacity-50 ring-2 ring-brand-accent rotate-1",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-medium text-brand-cream truncate">
              {deal.title}
            </h4>
            {deal.priority_level === "vip" && (
              <Star className="w-3 h-3 fill-brand-accent text-brand-accent shrink-0" />
            )}
          </div>
          {deal.contact_name && (
            <p className="text-[0.65rem] text-brand-smoke truncate mt-0.5">
              {deal.contact_name}
            </p>
          )}
        </div>
      </div>

      {!compact && (
        <>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-sm text-brand-accent">
              {fmtMoney(deal.expected_value, "NGN")}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2 text-[0.6rem] text-brand-smoke">
            {deal.expected_close_date && (
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  isOverdue && "text-state-danger",
                )}
              >
                <Calendar className="w-2.5 h-2.5" />
                {fmtDate(deal.expected_close_date)}
              </span>
            )}
            {isStale && (
              <span className="ml-auto text-state-warn">
                Stale · {fmtRelative(deal.updated_at)}
              </span>
            )}
            {!isStale && !deal.expected_close_date && (
              <span className="ml-auto">{fmtRelative(deal.updated_at)}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
