import { Link } from "react-router-dom";
import { Sparkles, TrendingUp, AlertCircle, ArrowRight } from "lucide-react";
import { useGreeting } from "@hooks/useGreeting";
import { useAuthStore } from "@stores/useAuthStore";
import { useQuery } from "@tanstack/react-query";
import { getSalesData, getFinanceData } from "@services/dashboard/dashboard";
import { getPeriodParams } from "@lib/constants/dashboardConstants";
import { getMyAuditFeed } from "@services/audit";
import { formatAuditEntry, auditActionColor } from "@lib/formatAuditEntry";
import { fmtRelative } from "@lib/format";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { useBusinessStore } from "@stores/useBusinessStore";
import { PriorityAppGrid } from "@components/hub/PriorityAppGrid";
import { Topbar } from "@components/shell/Topbar";
import { useUnreadTotal } from "@hooks/useUnreadTotal";
import {
  unreadTone,
  formatUnread,
  type UnreadTone,
} from "@lib/constants/unread";

export default function HubHome() {
  const { time, greeting } = useGreeting();
  const user = useAuthStore((s) => s.user);
  const active = useBusinessStore((s) => s.active);

  // Prefer the first token of the real display name. Only fall back to the
  // email local-part (capitalised) when no name is set, so we never greet
  // someone as "orikaliving".
  const rawFirst =
    (user?.display_name?.trim()?.split(/\s+/)[0] ||
      user?.email?.split("@")[0] ||
      "") ?? "";
  const firstName = user?.display_name?.trim()
    ? rawFirst
    : rawFirst
      ? rawFirst.charAt(0).toUpperCase() + rawFirst.slice(1)
      : "";
  const { active: business } = useActiveBusiness();

  // Live KPIs from the dashboards module — current month range
  const params = getPeriodParams("this_month");
  const { data: salesData } = useQuery({
    queryKey: ["dashboard", "sales", business, params.start_date],
    queryFn: () => getSalesData(params),
    enabled: !!business,
    staleTime: 5 * 60_000,
  });
  const { data: financeData } = useQuery({
    queryKey: ["dashboard", "finance", business, params.start_date],
    queryFn: () => getFinanceData(params),
    enabled: !!business,
    staleTime: 5 * 60_000,
  });

  const { data: auditResult } = useQuery({
    queryKey: ["audit", "my-feed", business],
    queryFn: () =>
      getMyAuditFeed({ business: business ?? undefined, limit: 20 }),
    staleTime: 60_000,
  });
  const auditFeed = auditResult?.data ?? [];
  const auditWindow = auditResult?.window ?? "24h";

  // Derived KPI values — show real data when available, fallback to "—"
  const todayRevenue = salesData?.revenue?.total_amount;
  const overdueCount = financeData?.ar_ageing?.invoice_count;
  const overdueAmount = financeData?.ar_ageing?.total;

  // Live unread chat total — real-time via socket, urgency-coloured
  // (green 1-10 / amber 11-30 / red 31+).
  // TODO: the remaining counts come from a single dashboard endpoint once
  // the dashboards module ships.
  const unreadTotal = useUnreadTotal();
  const badges: Record<string, number | string | undefined> = {
    new_leads: undefined,
    in_transit: undefined,
    pending_pos: undefined,
    overdue: undefined,
    awaiting_approval: undefined,
    unread: unreadTotal > 0 ? formatUnread(unreadTotal) : undefined,
    today: undefined,
    open: undefined,
  };
  const badgeTones: Record<string, UnreadTone | undefined> = {
    unread: unreadTone(unreadTotal) ?? undefined,
  };

  return (
    <>
      <Topbar title="Hub" subtitle="Your command center" />

      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-7xl mx-auto">
        {/* Editorial hero */}
        <section className="mb-10 sm:mb-12 animate-app-in">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <p className="text-[0.7rem] tracking-[0.18em] uppercase text-brand-accent mb-2">
                {greeting.primary}
                {firstName && `, ${firstName}`}
              </p>
              <h1 className="font-display font-light text-3xl sm:text-5xl lg:text-6xl leading-tight text-brand-cream">
                What would you like
                <br className="hidden sm:block" /> to{" "}
                <span className="italic text-brand-accent">craft</span> today?
              </h1>
              <p className="mt-3 text-sm sm:text-base text-brand-cloud max-w-xl">
                {greeting.secondary}
              </p>
            </div>
            <div className="text-left md:text-right shrink-0">
              <div className="font-mono text-2xl sm:text-3xl text-brand-accent tabular-nums tracking-wide leading-none">
                {time.toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              <div className="text-[0.65rem] tracking-widest uppercase text-brand-smoke mt-1.5">
                {time.toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </div>
              {active && (
                <div className="mt-3 inline-flex items-center gap-1.5 text-[0.65rem] tracking-widest uppercase text-brand-accent">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" />
                  {active}
                </div>
              )}
            </div>
          </div>

          {/* What's hot — critical alert tiles */}
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              to="/invoicing"
              className="group p-4 sm:p-5 rounded-2xl border border-brand-graphite bg-gradient-to-br from-brand-accent/[0.04] to-transparent hover:border-brand-accent/40 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-accent/15 text-brand-accent flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.65rem] tracking-widest uppercase text-brand-smoke">
                    Invoices · Overdue
                  </div>
                  <div className="font-display text-2xl text-brand-cream mt-0.5">
                    {overdueCount !== undefined ? overdueCount : "—"}
                  </div>
                  <div className="text-xs text-brand-cloud mt-1 truncate">
                    {overdueAmount !== undefined
                      ? `₦${overdueAmount.toLocaleString()} outstanding`
                      : "Loading..."}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-brand-smoke group-hover:text-brand-accent group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
            <Link
              to="/sales"
              className="group p-4 sm:p-5 rounded-2xl border border-brand-graphite bg-gradient-to-br from-accent2/[0.04] to-transparent hover:border-accent2/40 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent2/15 text-accent2 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.65rem] tracking-widest uppercase text-brand-smoke">
                    Today's Revenue
                  </div>
                  <div className="font-display text-2xl text-brand-cream mt-0.5">
                    {todayRevenue !== undefined
                      ? todayRevenue.toLocaleString("en-NG", {
                          style: "currency",
                          currency: "NGN",
                          maximumFractionDigits: 0,
                        })
                      : "—"}
                  </div>
                  <div className="text-xs text-brand-cloud mt-1 truncate">
                    Across active business
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-brand-smoke group-hover:text-accent2 group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
            <Link
              to="/crm"
              className="group p-4 sm:p-5 rounded-2xl border border-brand-graphite bg-gradient-to-br from-accent3/[0.04] to-transparent hover:border-accent3/40 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent3/15 text-accent3 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[0.65rem] tracking-widest uppercase text-brand-smoke">
                    New Leads
                  </div>
                  <div className="font-display text-2xl text-brand-cream mt-0.5">
                    —
                  </div>
                  <div className="text-xs text-brand-cloud mt-1 truncate">
                    Past 24 hours
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-brand-smoke group-hover:text-accent3 group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          </div>
        </section>

        {/* App Menu */}
        <section className="mb-12">
          <div className="flex items-center gap-4 mb-5">
            <div className="text-[0.65rem] tracking-[0.18em] uppercase text-brand-accent">
              App Menu
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-brand-accent/30 to-transparent" />
          </div>
          <PriorityAppGrid badges={badges} badgeTones={badgeTones} />
        </section>

        {/* Recent activity strip */}
        <section>
          <div className="flex items-center gap-4 mb-5">
            <div className="text-[0.65rem] tracking-[0.18em] uppercase text-brand-smoke">
              Recent Activity
            </div>
            <span className="text-[0.6rem] text-brand-smoke/60">
              {auditWindow === "24h" ? "Last 24 hours" : "All time"}
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-brand-graphite to-transparent" />
          </div>
          {auditFeed.length === 0 ? (
            <div className="rounded-2xl border border-brand-graphite bg-brand-charcoal/40 p-6 text-center">
              <p className="text-sm text-brand-smoke">
                No recent activity yet.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-brand-graphite bg-brand-charcoal/40 divide-y divide-brand-graphite/50">
              {auditFeed.map((entry) => (
                <div
                  key={entry.log_id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${auditActionColor(entry.action).replace("text-", "bg-")}`}
                  />
                  <span className="text-xs text-brand-cream truncate flex-1">
                    {formatAuditEntry(entry)}
                  </span>
                  <span className="text-[0.65rem] text-brand-smoke shrink-0">
                    {fmtRelative(entry.occurred_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
