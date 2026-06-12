import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings, Trophy } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { TierBadge } from "@components/loyalty/LoyaltyComponents";
import { getLoyaltyStats, getLeaderboard, listTiers } from "@services/loyalty";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { cn } from "@lib/cn";
import { Topbar } from "@/components/shell/Topbar";

export default function LoyaltyDashboard() {
  const { active: business } = useActiveBusiness();
  const navigate = useNavigate();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["loyalty-stats", business],
    queryFn: getLoyaltyStats,
    refetchInterval: 5 * 60_000,
  });

  const { data: leaderboard = [], isLoading: leadLoading } = useQuery({
    queryKey: ["loyalty-leaderboard", business],
    queryFn: () => getLeaderboard(20),
    refetchInterval: 5 * 60_000,
  });

  const { data: tiers = [] } = useQuery({
    queryKey: ["loyalty-tiers", business],
    queryFn: listTiers,
  });

  // Points rate display
  const ptsPerNaira = stats?.config?.points_per_naira ?? 0.001;
  const nairaPerPt =
    ptsPerNaira > 0 ? Math.round(1 / ptsPerNaira).toLocaleString() : "—";

  return (
    <>
      <Topbar title="Loyalty" subtitle="Points · Rewards" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Loyalty Programme"
          subtitle={`Earning rate: 1 point per ₦${nairaPerPt} spent · Expiry: ${stats?.config?.expiry_months ?? 12} months`}
          crumbs={[{ label: "Hub", to: "/" }, { label: "Loyalty" }]}
          actions={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => navigate("/loyalty/tiers")}
              >
                <Settings className="h-4 w-4" />
                Manage Tiers
              </Button>
            </div>
          }
        />

        {/* KPI strip */}
        {statsLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: "Points Issued",
                value: (stats?.total_issued ?? 0).toLocaleString(),
                color: "#C9A86C",
              },
              {
                label: "Points Redeemed",
                value: (stats?.total_redeemed ?? 0).toLocaleString(),
                color: "#4E9AF1",
              },
              {
                label: "Active Members",
                value: (stats?.active_contacts ?? 0).toLocaleString(),
                color: "#2D9CDB",
              },
              { label: "Tiers", value: String(tiers.length), color: "#9E9891" },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3"
              >
                <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
                  {kpi.label}
                </p>
                <p
                  className="font-display text-2xl font-light tabular-nums"
                  style={{ color: kpi.color }}
                >
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Tier distribution */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-brand-cream">
                Tier Distribution
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate("/loyalty/tiers")}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Tier
              </Button>
            </div>

            {statsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : !stats?.tier_distribution?.length ? (
              <div className="rounded-2xl border border-white/5 bg-brand-charcoal py-10 text-center">
                <Trophy className="mx-auto h-8 w-8 text-brand-smoke/30 mb-2" />
                <p className="text-sm text-brand-smoke">
                  No tiers configured yet
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate("/loyalty/tiers")}
                >
                  Create your first tier
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.tier_distribution.map((td) => {
                  const totalMembers = stats.tier_distribution.reduce(
                    (s, t) => s + t.member_count,
                    0,
                  );
                  const pct =
                    totalMembers > 0
                      ? (td.member_count / totalMembers) * 100
                      : 0;

                  return (
                    <div
                      key={td.tier_id}
                      className="flex items-center gap-4 rounded-xl border border-white/5 bg-brand-charcoal px-4 py-3"
                    >
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: td.colour }}
                      />
                      <p className="text-sm text-brand-cream flex-1">
                        {td.tier_name}
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-24 h-1.5 rounded-full bg-brand-graphite overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              backgroundColor: td.colour,
                              width: `${pct.toFixed(0)}%`,
                            }}
                          />
                        </div>
                        <p className="text-xs text-brand-smoke w-16 text-right tabular-nums">
                          {td.member_count.toLocaleString()} members
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Leaderboard */}
          <div className="space-y-4">
            <p className="text-sm font-semibold text-brand-cream">
              Top Members by Points
            </p>

            {leadLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="rounded-2xl border border-white/5 bg-brand-charcoal py-10 text-center">
                <p className="text-sm text-brand-smoke">
                  No loyalty members yet
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {leaderboard.slice(0, 15).map((row, i) => {
                  // Find their tier
                  const balance = row.balance;
                  const tier =
                    [...tiers]
                      .sort((a, b) => b.min_points - a.min_points)
                      .find(
                        (t) =>
                          t.min_points <= balance &&
                          (t.max_points === null || t.max_points >= balance),
                      ) ?? null;

                  return (
                    <button
                      key={row.contact_id}
                      onClick={() =>
                        navigate(`/loyalty/contact/${row.contact_id}`)
                      }
                      className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-brand-charcoal px-4 py-2.5 text-left hover:border-white/15 hover:bg-brand-graphite/20 transition-all"
                    >
                      {/* Rank */}
                      <span
                        className={cn(
                          "w-6 text-center text-xs font-bold tabular-nums shrink-0",
                          i === 0
                            ? "text-brand-accent"
                            : i === 1
                              ? "text-[#A8A9AD]"
                              : i === 2
                                ? "text-[#B87333]"
                                : "text-brand-smoke/50",
                        )}
                      >
                        {i + 1}
                      </span>

                      {/* Avatar */}
                      <div className="h-7 w-7 rounded-full bg-brand-graphite flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-semibold text-brand-cream">
                          {row.display_name.charAt(0).toUpperCase()}
                        </span>
                      </div>

                      {/* Name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-brand-cream truncate">
                          {row.display_name}
                        </p>
                        {row.primary_phone && (
                          <p className="text-[10px] text-brand-smoke">
                            {row.primary_phone}
                          </p>
                        )}
                      </div>

                      {/* Tier badge */}
                      {tier && <TierBadge tier={tier} size="xs" />}

                      {/* Balance */}
                      <p className="text-sm font-semibold tabular-nums text-brand-accent shrink-0">
                        {row.balance.toLocaleString()} pts
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
