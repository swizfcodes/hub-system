import { useNavigate } from "react-router-dom";
import { Star, Calendar } from "lucide-react";
import { fmtMoney, fmtDate, fmtRelative } from "@lib/format";
import { ProbabilityBar } from "../shared/ProbabilityBar";
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
        "group cursor-pointer rounded-xl border bg-orika-charcoal border-orika-graphite p-3 transition-all",
        "hover:border-orika-gold/40 hover:shadow-card",
        dragging && "opacity-50 ring-2 ring-orika-gold rotate-1",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-medium text-orika-cream truncate">
              {deal.title}
            </h4>
            {deal.priority_level === "vip" && (
              <Star className="w-3 h-3 fill-orika-gold text-orika-gold shrink-0" />
            )}
          </div>
          {deal.contact_name && (
            <p className="text-[0.65rem] text-orika-smoke truncate mt-0.5">
              {deal.contact_name}
            </p>
          )}
        </div>
      </div>

      {!compact && (
        <>
          <div className="mt-2.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-sm text-orika-gold">
              {fmtMoney(deal.expected_value, "NGN")}
            </span>
            <span className="text-[0.6rem] text-orika-smoke">
              {deal.probability}%
            </span>
          </div>
          <ProbabilityBar
            probability={deal.probability ?? 50}
            className="mt-1.5"
          />

          <div className="mt-2 flex items-center gap-2 text-[0.6rem] text-orika-smoke">
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
