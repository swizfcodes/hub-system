import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, XCircle, BarChart2, GitBranch } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Tabs } from "@components/ui/Tabs";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import {
  CampaignStatusBadge,
  CampaignTypePill,
  CampaignStatsPanel,
  FollowUpList,
} from "@components/campaigns/CampaignComponents";
import {
  getCampaign,
  getCampaignStats,
  getRecipientActivity,
  getFollowUpSuggestions,
  getABResults,
  sendNow,
  cancelCampaign,
} from "@services/campaigns";
import { RECIPIENT_STATUS_META } from "@lib/constants/campaignsConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtDate, fmtDateTime } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import type { RecipientStatus } from "@typedefs/campaigns";

const DETAIL_TABS = [
  { key: "stats", label: "Stats" },
  { key: "recipients", label: "Recipients" },
  { key: "followup", label: "Follow-up" },
  { key: "ab", label: "A/B Results" },
];

const RECIPIENT_STATUS_FILTERS = [
  "all",
  "opened",
  "clicked",
  "sent",
  "bounced",
  "unsubscribed",
] as const;

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();

  const [activeTab, setActiveTab] = useState("stats");
  const [recipientFilter, setRecipientFilter] = useState("all");

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => getCampaign(id!),
    enabled: !!id,
    refetchInterval: 10_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["campaign-stats", id],
    queryFn: () => getCampaignStats(id!),
    enabled: !!id && campaign?.status === "sent",
  });

  const { data: recipients = [] } = useQuery({
    queryKey: ["campaign-recipients", id, recipientFilter],
    queryFn: () =>
      getRecipientActivity(
        id!,
        recipientFilter === "all" ? undefined : recipientFilter,
      ),
    enabled: !!id && activeTab === "recipients",
  });

  const { data: suggestions = [] } = useQuery({
    queryKey: ["campaign-followup", id],
    queryFn: () => getFollowUpSuggestions(id!),
    enabled: !!id && activeTab === "followup",
  });

  const { data: abResults } = useQuery({
    queryKey: ["campaign-ab", id],
    queryFn: () => getABResults(id!),
    enabled: !!id && activeTab === "ab",
  });

  const sendMutation = useMutation({
    mutationFn: () => sendNow(id!),
    onSuccess: (result) => {
      showToast.success(`Sent to ${result.sent} contacts`);
      qc.invalidateQueries({ queryKey: ["campaign", id] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelCampaign(id!),
    onSuccess: () => {
      showToast.success("Campaign cancelled");
      qc.invalidateQueries({ queryKey: ["campaign", id] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  if (isLoading) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-brand-smoke">Campaign not found.</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate("/campaigns")}
        >
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={campaign.campaign_name}
        subtitle={campaign.subject_line ?? ""}
        crumbs={[
          { label: "Campaigns", to: "/campaigns" },
          { label: campaign.campaign_name },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CampaignTypePill type={campaign.campaign_type} />
            <CampaignStatusBadge status={campaign.status} />
            {["draft", "queued"].includes(campaign.status) &&
              campaign.recipient_count > 0 && (
                <Button
                  size="sm"
                  onClick={() => sendMutation.mutate()}
                  loading={sendMutation.isPending}
                >
                  <Send className="h-4 w-4" />
                  Send Now
                </Button>
              )}
            {["draft", "queued"].includes(campaign.status) && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                <XCircle className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {/* Campaign meta */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InfoCard
          label="Recipients"
          value={campaign.recipient_count.toLocaleString()}
        />
        <InfoCard
          label="Delivered"
          value={campaign.delivered_count.toLocaleString()}
        />
        <InfoCard
          label="Sent"
          value={campaign.sent_at ? fmtDate(campaign.sent_at) : "—"}
        />
        <InfoCard
          label="Scheduled"
          value={
            campaign.scheduled_at ? fmtDateTime(campaign.scheduled_at) : "—"
          }
        />
      </div>

      {/* Tabs */}
      <Tabs
        tabs={DETAIL_TABS}
        active={activeTab}
        onChange={setActiveTab}
        surface="dark"
        variant="underline"
      />

      {/* Stats tab */}
      {activeTab === "stats" &&
        (campaign.status !== "sent" ? (
          <div className="py-12 text-center rounded-2xl border border-white/5 bg-brand-charcoal">
            <BarChart2 className="mx-auto h-10 w-10 text-brand-smoke/30 mb-3" />
            <p className="text-sm text-brand-smoke">
              Stats will appear once the campaign has been sent.
            </p>
          </div>
        ) : stats ? (
          <CampaignStatsPanel
            stats={stats}
            type={campaign.campaign_type}
            currency={currency}
          />
        ) : (
          <Skeleton className="h-24 rounded-2xl" />
        ))}

      {/* Recipients tab */}
      {activeTab === "recipients" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {RECIPIENT_STATUS_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setRecipientFilter(f)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize",
                  recipientFilter === f
                    ? "bg-brand-accent text-brand-black"
                    : "bg-brand-graphite text-brand-cloud hover:bg-brand-graphite/70",
                )}
              >
                {f === "all"
                  ? "All"
                  : (RECIPIENT_STATUS_META[f as RecipientStatus]?.label ?? f)}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full min-w-[500px] text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-brand-charcoal">
                  {[
                    "Name",
                    "Channel",
                    "Status",
                    "Sent",
                    "Opened",
                    "Clicked",
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
                {recipients.map((r: any) => (
                  <tr key={r.recipient_id} className="bg-brand-charcoal">
                    <td className="px-4 py-3 font-medium text-brand-cream">
                      {r.display_name}
                    </td>
                    <td className="px-4 py-3 text-brand-smoke text-xs">
                      {r.email || r.whatsapp_number || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          RECIPIENT_STATUS_META[r.status as RecipientStatus]
                            ?.tone ?? "neutral"
                        }
                        size="xs"
                      >
                        {RECIPIENT_STATUS_META[r.status as RecipientStatus]
                          ?.label ?? r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-brand-smoke text-xs">
                      {r.sent_at ? fmtDate(r.sent_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-brand-smoke text-xs">
                      {r.opened_at ? fmtDate(r.opened_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-brand-smoke text-xs">
                      {r.clicked_at ? fmtDate(r.clicked_at) : "—"}
                    </td>
                  </tr>
                ))}
                {recipients.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-brand-smoke"
                    >
                      No recipients in this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Follow-up tab */}
      {activeTab === "followup" && <FollowUpList suggestions={suggestions} />}

      {/* A/B tab */}
      {activeTab === "ab" && abResults && (
        <div className="space-y-4">
          {abResults.winner && (
            <div className="flex items-center gap-2 rounded-xl border border-brand-accent/30 bg-brand-accent/5 px-4 py-3">
              <GitBranch className="h-4 w-4 text-brand-accent" />
              <p className="text-sm text-brand-accent">
                Winner:{" "}
                <strong>
                  {
                    abResults.variants.find(
                      (v) => v.campaign_id === abResults.winner,
                    )?.campaign_name
                  }
                </strong>{" "}
                — highest open rate
              </p>
            </div>
          )}
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-brand-charcoal">
                  {[
                    "Variant",
                    "Subject Line",
                    "Recipients",
                    "Delivered",
                    "Open Rate",
                    "Click Rate",
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
                {abResults.variants.map((v) => (
                  <tr
                    key={v.campaign_id}
                    className={cn(
                      "bg-brand-charcoal",
                      v.campaign_id === abResults.winner && "bg-brand-accent/5",
                    )}
                  >
                    <td className="px-4 py-3 text-brand-cream font-medium">
                      {v.campaign_name}
                      {v.campaign_id === abResults.winner && (
                        <Badge tone="gold" size="xs" className="ml-2">
                          Winner
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-brand-smoke">
                      {v.subject_line ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-brand-smoke">
                      {v.recipient_count}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-brand-smoke">
                      {v.delivered_count}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-brand-cream">
                      {v.open_rate_pct}%
                    </td>
                    <td className="px-4 py-3 tabular-nums text-brand-smoke">
                      {v.click_rate_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-brand-charcoal px-4 py-3">
      <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
        {label}
      </p>
      <p className="text-sm font-semibold text-brand-cream">{value}</p>
    </div>
  );
}
