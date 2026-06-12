import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { StagePill } from "../shared/StagePill";
import { fmtMoney, fmtDate, fmtRelative } from "@lib/format";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { TrendingUp } from "lucide-react";
import type { PipelineStageWithDeals } from "@typedefs/crm";
import { cn } from "@lib/cn";

interface Props {
  pipeline?: PipelineStageWithDeals[];
  loading?: boolean;
}

type SortKey =
  | "updated_at"
  | "expected_close_date"
  | "expected_value"
  | "title"
  | "stage";

export function PipelineTable({ pipeline, loading }: Props) {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const stageColours = useMemo(() => {
    const m: Record<string, { label: string; colour: string }> = {};
    (pipeline ?? []).forEach((s) => {
      m[s.stage_key] = { label: s.stage_label, colour: s.colour };
    });
    return m;
  }, [pipeline]);

  const rows = useMemo(() => {
    const all = (pipeline ?? []).flatMap((s) =>
      s.deals.map((d) => ({
        ...d,
        stage_label: s.stage_label,
        stage_colour: s.colour,
      })),
    );
    const sign = sortDir === "asc" ? 1 : -1;
    return [...all].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortBy];
      const bv = (b as Record<string, unknown>)[sortBy];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number")
        return (av - bv) * sign;
      return String(av).localeCompare(String(bv)) * sign;
    });
  }, [pipeline, sortBy, sortDir]);

  const sortIcon = (k: SortKey) => {
    if (sortBy !== k) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-brand-accent" />
    ) : (
      <ArrowDown className="w-3 h-3 text-brand-accent" />
    );
  };

  const toggle = (k: SortKey) => {
    if (sortBy === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortBy(k);
      setSortDir("desc");
    }
  };

  if (loading)
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp className="w-6 h-6" />}
        title="No deals yet"
        description="Create your first deal to start tracking it through the pipeline."
      />
    );
  }

  return (
    <div className="rounded-2xl border border-brand-graphite bg-brand-charcoal/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-charcoal border-b border-brand-graphite">
            <tr>
              <Th onClick={() => toggle("title")} sort={sortIcon("title")}>
                Title
              </Th>
              <Th>Contact</Th>
              <Th onClick={() => toggle("stage")} sort={sortIcon("stage")}>
                Stage
              </Th>
              <Th
                onClick={() => toggle("expected_value")}
                sort={sortIcon("expected_value")}
                className="text-right"
              >
                Value
              </Th>
              <Th
                onClick={() => toggle("expected_close_date")}
                sort={sortIcon("expected_close_date")}
              >
                Close date
              </Th>
              <Th
                onClick={() => toggle("updated_at")}
                sort={sortIcon("updated_at")}
              >
                Updated
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const stage = stageColours[r.stage] ?? {
                label: r.stage,
                colour: "#94A3B8",
              };
              const isOverdue =
                r.expected_close_date &&
                new Date(r.expected_close_date).getTime() < Date.now();
              return (
                <tr
                  key={r.deal_id}
                  onClick={() => navigate(`/crm/${r.deal_id}`)}
                  className="border-b border-brand-graphite/40 hover:bg-brand-charcoal cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-brand-cream truncate">
                        {r.title}
                      </span>
                      {r.priority_level === "vip" && (
                        <Star className="w-3 h-3 fill-brand-accent text-brand-accent" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-brand-cloud truncate max-w-[180px]">
                    {r.contact_name}
                  </td>
                  <td className="px-4 py-3">
                    <StagePill
                      stageKey={r.stage}
                      label={stage.label}
                      colour={stage.colour}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-brand-accent">
                    {fmtMoney(r.expected_value, "NGN")}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3",
                      isOverdue && "text-state-danger",
                    )}
                  >
                    {r.expected_close_date
                      ? fmtDate(r.expected_close_date)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-brand-smoke text-xs">
                    {fmtRelative(r.updated_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  sort,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  sort?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 text-left text-[0.6rem] tracking-widest uppercase text-brand-smoke font-semibold",
        onClick && "cursor-pointer hover:text-brand-cream",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
        {sort}
      </span>
    </th>
  );
}
