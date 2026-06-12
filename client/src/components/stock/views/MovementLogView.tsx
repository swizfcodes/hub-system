import { useQuery } from "@tanstack/react-query";
import { History, ArrowDown, ArrowUp } from "lucide-react";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { listMovements } from "@services/stock/movements";
import { MovementTypeIcon } from "../shared/MovementTypeIcon";
import { MOVEMENT_TYPE_META } from "@lib/constants/stockMovementTypes";
import { fmtDateTime, fmtRelative, fmtMoney } from "@lib/format";
import type { MovementType } from "@typedefs/stock";

interface Props {
  filters: {
    product_id?: string;
    location_id?: string;
    movement_type?: MovementType;
    from?: string;
    to?: string;
  };
}

export function MovementLogView({ filters }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["stock", "movements", filters],
    queryFn: () => listMovements({ ...filters, limit: 100 }),
  });

  const movements = data?.data ?? [];

  if (isLoading)
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  if (movements.length === 0) {
    return (
      <EmptyState
        icon={<History className="w-6 h-6" />}
        title="No movements"
        description="Stock movements show every entry, exit, transfer and adjustment."
      />
    );
  }

  return (
    <ol className="relative pl-6 border-l border-brand-graphite space-y-3">
      {movements.map((m) => {
        // Fall back gracefully for any movement_type not in the meta map
        // (e.g. older/extended types like received_from_supplier) — use the
        // row's own direction so the +/- and colour still render correctly.
        const meta = MOVEMENT_TYPE_META[m.movement_type] ?? {
          key: m.movement_type,
          label: (m.movement_type ?? "movement").replace(/_/g, " "),
          direction: m.direction === 1 ? 1 : -1,
          color: "#9E9891",
        };
        const totalValue = (m.unit_cost ?? 0) * m.quantity;
        return (
          <li key={m.movement_id} className="relative">
            <span className="absolute -left-[34px] top-3">
              <MovementTypeIcon type={m.movement_type} size="sm" />
            </span>
            <div className="rounded-xl border border-brand-graphite bg-brand-charcoal/50 p-3.5">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-brand-cream truncate">
                      {m.product_name ?? "—"}
                    </span>
                    <span className="text-[0.6rem] font-mono text-brand-smoke">
                      {m.product_sku}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[0.65rem]">
                    <span
                      className={
                        meta.direction === 1
                          ? "text-accent2 inline-flex items-center gap-0.5"
                          : "text-state-danger inline-flex items-center gap-0.5"
                      }
                    >
                      {meta.direction === 1 ? (
                        <ArrowDown className="w-2.5 h-2.5" />
                      ) : (
                        <ArrowUp className="w-2.5 h-2.5" />
                      )}
                      {meta.direction === 1 ? "+" : "−"}
                      {m.quantity}
                    </span>
                    <span className="text-brand-smoke">·</span>
                    <span className="text-brand-cloud">{meta.label}</span>
                    {m.to_location_name && meta.direction === 1 && (
                      <>
                        <span className="text-brand-smoke">→</span>{" "}
                        <span className="text-brand-cloud">
                          {m.to_location_name}
                        </span>
                      </>
                    )}
                    {m.from_location_name && meta.direction === -1 && (
                      <>
                        <span className="text-brand-smoke">from</span>{" "}
                        <span className="text-brand-cloud">
                          {m.from_location_name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {m.unit_cost != null && (
                  <span className="font-mono text-xs text-brand-accent">
                    {fmtMoney(totalValue, "NGN")}
                  </span>
                )}
              </div>
              {m.notes && (
                <p className="text-xs text-brand-cloud mt-2 italic">
                  "{m.notes}"
                </p>
              )}
              <div className="text-[0.6rem] text-brand-smoke mt-2">
                {fmtDateTime(m.performed_at)} · {fmtRelative(m.performed_at)}
                {m.performed_by_name && ` · ${m.performed_by_name}`}
                {m.reference_type && ` · ref ${m.reference_type}`}
                {m.batch_number && ` · batch ${m.batch_number}`}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
