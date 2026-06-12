import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Eye,
  Send,
  XCircle,
  BarChart2,
  Users,
  Inbox,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Tabs } from "@components/ui/Tabs";
import { Skeleton } from "@components/ui/Skeleton";
import {
  CampaignStatusBadge,
  CampaignTypePill,
} from "@components/campaigns/CampaignComponents";
import { listCampaigns, sendNow, cancelCampaign } from "@services/campaigns";
import { fmtDate } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import { Topbar } from "@/components/shell/Topbar";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "queued", label: "Scheduled" },
  { key: "sent", label: "Sent" },
  { key: "cancelled", label: "Cancelled" },
];

export default function CampaignsHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["campaigns", statusFilter, typeFilter],
    queryFn: () =>
      listCampaigns({
        status: statusFilter === "all" ? undefined : statusFilter,
        campaign_type: typeFilter === "all" ? undefined : typeFilter,
        limit: 100,
      }),
    refetchInterval: 30_000,
  });

  const campaigns = data?.data ?? [];

  // KPI strip
  const total = campaigns.length;
  const sent = campaigns.filter((c) => c.status === "sent").length;
  const drafts = campaigns.filter((c) => c.status === "draft").length;
  const queued = campaigns.filter((c) => c.status === "queued").length;
  const avgOpen = (() => {
    const sentCamps = campaigns.filter(
      (c) => c.status === "sent" && c.delivered_count > 0,
    );
    if (!sentCamps.length) return 0;
    const total = sentCamps.reduce(
      (s, c) => s + (c.opened_count / c.delivered_count) * 100,
      0,
    );
    return (total / sentCamps.length).toFixed(1);
  })();

  const sendMutation = useMutation({
    mutationFn: (id: string) => sendNow(id),
    onSuccess: (result, _id) => {
      showToast.success(`Campaign sent — ${result.sent} delivered`);
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setSendingId(null);
    },
    onError: (err) => {
      showToast.error(errMsg(err));
      setSendingId(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelCampaign(id),
    onSuccess: () => {
      showToast.success("Campaign cancelled");
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <>
      <Topbar title="Campaigns" subtitle="Marketing · Awareness" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Campaigns"
          subtitle="Email and WhatsApp campaigns. Reach the right customers with the right message."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Campaigns" }]}
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => navigate("/campaigns/subscribers")}
              >
                <Users className="h-4 w-4" />
                Subscribers
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate("/campaigns/enquiries")}
              >
                <Inbox className="h-4 w-4" />
                Enquiries
              </Button>
              <Button onClick={() => navigate("/campaigns/new")}>
                <Plus className="h-4 w-4" />
                New Campaign
              </Button>
            </>
          }
        />

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total", value: String(total), color: "#9E9891" },
            { label: "Drafts", value: String(drafts), color: "#4E9AF1" },
            { label: "Scheduled", value: String(queued), color: "#C9A86C" },
            { label: "Sent", value: String(sent), color: "#2D6A4F" },
            { label: "Avg Open Rate", value: `${avgOpen}%`, color: "#C9A86C" },
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

        {/* Tabs */}
        <div className="flex flex-wrap gap-4 items-center">
          <Tabs
            tabs={STATUS_TABS}
            active={statusFilter}
            onChange={setStatusFilter}
            surface="dark"
            variant="underline"
          />
          <div className="flex gap-2 ml-auto">
            {["all", "email", "whatsapp"].map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  typeFilter === t
                    ? "bg-brand-accent text-brand-black"
                    : "bg-brand-graphite text-brand-cloud hover:bg-brand-graphite/70",
                )}
              >
                {t === "all"
                  ? "All types"
                  : t === "email"
                    ? "📧 Email"
                    : "💬 WhatsApp"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="py-16 text-center rounded-2xl border border-white/5 bg-brand-charcoal">
            <BarChart2 className="mx-auto h-10 w-10 text-brand-smoke/30 mb-3" />
            <p className="text-sm text-brand-smoke">No campaigns yet</p>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => navigate("/campaigns/new")}
            >
              Create your first campaign
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-brand-charcoal">
                  {[
                    "Name",
                    "Type",
                    "Recipients",
                    "Delivered",
                    "Open Rate",
                    "Scheduled / Sent",
                    "Status",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-widest text-brand-smoke"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {campaigns.map((campaign) => {
                  const openRate =
                    campaign.delivered_count > 0
                      ? (
                          (campaign.opened_count / campaign.delivered_count) *
                          100
                        ).toFixed(1)
                      : "—";

                  return (
                    <tr
                      key={campaign.campaign_id}
                      className="bg-brand-charcoal hover:bg-brand-graphite/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            navigate(`/campaigns/${campaign.campaign_id}`)
                          }
                          className="font-medium text-brand-cream hover:text-brand-accent transition-colors text-left"
                        >
                          {campaign.campaign_name}
                        </button>
                        {campaign.subject_line && (
                          <p className="text-xs text-brand-smoke truncate max-w-[200px]">
                            {campaign.subject_line}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <CampaignTypePill type={campaign.campaign_type} />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-brand-smoke">
                        {campaign.recipient_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-brand-smoke">
                        {campaign.delivered_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-brand-cream">
                        {campaign.campaign_type === "email"
                          ? `${openRate}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-brand-smoke">
                        {campaign.sent_at
                          ? fmtDate(campaign.sent_at)
                          : campaign.scheduled_at
                            ? fmtDate(campaign.scheduled_at)
                            : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <CampaignStatusBadge
                          status={campaign.status}
                          size="xs"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              navigate(`/campaigns/${campaign.campaign_id}`)
                            }
                            title="View"
                            className="text-brand-smoke hover:text-brand-accent transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {campaign.status === "draft" &&
                            campaign.recipient_count > 0 && (
                              <button
                                onClick={() => {
                                  setSendingId(campaign.campaign_id);
                                  sendMutation.mutate(campaign.campaign_id);
                                }}
                                disabled={sendingId === campaign.campaign_id}
                                title="Send now"
                                className="text-brand-smoke hover:text-green-400 transition-colors disabled:opacity-40"
                              >
                                <Send className="h-4 w-4" />
                              </button>
                            )}
                          {["draft", "queued"].includes(campaign.status) && (
                            <button
                              onClick={() =>
                                cancelMutation.mutate(campaign.campaign_id)
                              }
                              title="Cancel"
                              className="text-brand-smoke hover:text-state-danger transition-colors"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
