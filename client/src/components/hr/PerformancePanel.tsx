import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Target, Star } from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtDate } from "@lib/format";
import {
  getMyPerformance,
  getPerformance,
  acknowledgeReview,
  type PerformanceGoal,
} from "@services/hr";
import { KpiGrid, OverallScore } from "./HrShared";

function GoalRow({ g }: { g: PerformanceGoal }) {
  const pct =
    g.status === "achieved"
      ? 100
      : g.target_value && Number(g.target_value) > 0
        ? Math.min(100, Math.round((Number(g.current_value) / Number(g.target_value)) * 100))
        : g.status === "missed"
          ? 0
          : 50;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-brand-cream">{g.title}</span>
        <Badge
          tone={g.status === "achieved" ? "sage" : g.status === "missed" ? "rose" : "neutral"}
          size="xs"
        >
          {g.status}
        </Badge>
      </div>
      <div className="h-1.5 rounded-full bg-brand-graphite overflow-hidden">
        <div className="h-full bg-accent3" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[0.65rem] text-brand-smoke">
        <span>{g.description || g.metric || ""}</span>
        <span>
          {g.target_value != null
            ? `${Number(g.current_value)} / ${Number(g.target_value)}${g.unit ? " " + g.unit : ""}`
            : ""}
          {g.due_date ? ` · due ${fmtDate(g.due_date)}` : ""}
        </span>
      </div>
    </div>
  );
}

export function PerformancePanel({
  self = false,
  profileId,
}: {
  self?: boolean;
  profileId?: string;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: self ? ["hr", "me", "performance"] : ["hr", "performance", profileId],
    queryFn: () => (self ? getMyPerformance() : getPerformance(profileId!)),
    enabled: self || !!profileId,
  });

  const ackMut = useMutation({
    mutationFn: (id: string) => acknowledgeReview(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr"] });
      showToast.success("Review acknowledged");
    },
    onError: (e) => showToast.error(errMsg(e)),
  });

  if (isLoading || !data) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <OverallScore score={data.overall_score} rating={data.rating} />
          <div className="text-xs text-brand-smoke">
            {fmtDate(data.period.from)} – {fmtDate(data.period.to)}
            <div className="mt-0.5 text-brand-cloud">
              {data.profile.job_title}
              {data.profile.department ? ` · ${data.profile.department}` : ""}
            </div>
          </div>
        </div>
      </Card>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-smoke">
          KPIs (auto, role-aware)
        </h4>
        <KpiGrid kpis={data.kpis} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Target className="h-4 w-4 text-accent3" />
            <h4 className="text-sm font-semibold text-brand-cream">Goals</h4>
          </div>
          {data.goals.length ? (
            <div className="space-y-4">
              {data.goals.map((g) => (
                <GoalRow key={g.goal_id} g={g} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-brand-smoke">No goals set yet.</p>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 text-brand-accent" />
            <h4 className="text-sm font-semibold text-brand-cream">Reviews</h4>
          </div>
          {data.reviews.length ? (
            <div className="space-y-3">
              {data.reviews.map((rv) => (
                <div key={rv.review_id} className="rounded-xl border border-white/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-brand-smoke">
                      {fmtDate(rv.period_start)} – {fmtDate(rv.period_end)}
                    </span>
                    {rv.overall_rating != null && (
                      <Badge tone="gold" size="xs">
                        {Number(rv.overall_rating).toFixed(1)} / 5
                      </Badge>
                    )}
                  </div>
                  {rv.summary && <p className="mt-1 text-sm text-brand-cloud">{rv.summary}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone={rv.status === "acknowledged" ? "sage" : "neutral"} size="xs">
                      {rv.status}
                    </Badge>
                    {self && rv.status === "shared" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => ackMut.mutate(rv.review_id)}
                      >
                        Acknowledge
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-brand-smoke">No reviews yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
