/**
 * SubscribersHome — newsletter subscribers collected from the storefront.
 * Route: /campaigns/subscribers
 * View, search, filter by status, and export to CSV. Read-only — the
 * storefront owns subscribe/unsubscribe; this is the ERP window into it.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { Topbar } from "@/components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Badge } from "@components/ui/Badge";
import { EmptyState } from "@components/ui/EmptyState";
import { api } from "@services/api";
import {
  listSubscribers,
  subscribersExportUrl,
} from "@services/campaigns/campaigns";

type StatusFilter = "" | "active" | "unsubscribed";

export default function SubscribersHome() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");

  const { data, isLoading } = useQuery({
    queryKey: ["campaigns", "subscribers", search, status],
    queryFn: () =>
      listSubscribers({
        search: search || undefined,
        status: (status || undefined) as "active" | "unsubscribed" | undefined,
      }),
  });

  const subscribers = data?.data ?? [];
  const counts = data?.counts ?? { total: 0, active: 0, unsubscribed: 0 };

  async function exportCsv() {
    // Go through the api client so auth headers are attached, then trigger
    // a browser download from the returned blob.
    const res = await api.get(
      subscribersExportUrl({ search: search || undefined, status }),
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "newsletter-subscribers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Topbar title="Subscribers" subtitle="Marketing · Newsletter" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Newsletter Subscribers"
          subtitle="People who opted in from the storefront. Target them from any campaign's audience step."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Campaigns", to: "/campaigns" },
            { label: "Subscribers" },
          ]}
          actions={
            <Button
              variant="secondary"
              onClick={exportCsv}
              disabled={!subscribers.length}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          }
        />

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: counts.total, color: "#9E9891" },
            { label: "Active", value: counts.active, color: "#2D6A4F" },
            {
              label: "Unsubscribed",
              value: counts.unsubscribed,
              color: "#9E9891",
            },
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

        {/* Controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-smoke" />
            <Input
              className="pl-9"
              placeholder="Search by email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {(
              [
                { v: "active", label: "Active" },
                { v: "unsubscribed", label: "Unsubscribed" },
                { v: "", label: "All" },
              ] as { v: StatusFilter; label: string }[]
            ).map((opt) => (
              <button
                key={opt.v || "all"}
                type="button"
                onClick={() => setStatus(opt.v)}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium transition-all " +
                  (status === opt.v
                    ? "border-brand-accent bg-brand-accent/10 text-brand-accent"
                    : "border-white/10 text-brand-smoke hover:border-white/25")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="text-sm text-brand-smoke py-12 text-center">Loading…</p>
        ) : subscribers.length === 0 ? (
          <EmptyState
            title="No subscribers yet"
            description="Subscribers who opt in from the storefront newsletter will appear here."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-[0.65rem] uppercase tracking-widest text-brand-smoke">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Subscribed</th>
                </tr>
              </thead>
              <tbody>
                {subscribers.map((s) => (
                  <tr
                    key={s.email}
                    className="border-b border-white/5 last:border-0"
                  >
                    <td className="px-4 py-3">{s.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone={s.is_active ? "sage" : "neutral"}>
                        {s.is_active ? "Active" : "Unsubscribed"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-brand-smoke">
                      {s.source || "—"}
                    </td>
                    <td className="px-4 py-3 text-brand-smoke tabular-nums">
                      {new Date(s.subscribed_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
