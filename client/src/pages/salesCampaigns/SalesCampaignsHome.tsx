import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  ExternalLink,
  BarChart2,
  Share2,
  MoreVertical,
  Play,
  XCircle,
  Copy,
  Eye,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { Modal } from "@components/ui/Modal";
import { Tabs } from "@components/ui/Tabs";
import { Skeleton } from "@components/ui/Skeleton";
import { showToast } from "@hooks/useToast";
import { fmtMoney, fmtDate } from "@lib/format";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import {
  listCampaigns,
  publishCampaign,
  expireCampaign,
} from "@services/salesCampaign";
import type { SalesCampaign } from "@typedefs/salesCampaign";
import { Topbar } from "@components/shell/Topbar";

const STATUS_BADGE: Record<
  string,
  "gold" | "sage" | "neutral" | "rose" | "warn" | "info"
> = {
  draft: "neutral",
  scheduled: "info",
  live: "sage",
  expired: "rose",
  archived: "neutral",
};

const TABS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "scheduled", label: "Scheduled" },
  { key: "draft", label: "Drafts" },
  { key: "expired", label: "Expired" },
];

export default function SalesCampaignsHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { active: business } = useActiveBusiness();
  const [activeTab, setActiveTab] = useState("all");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    action: "publish" | "expire";
    campaign: SalesCampaign;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-campaigns", activeTab],
    queryFn: () =>
      listCampaigns(activeTab === "all" ? undefined : { status: activeTab }),
  });
  const campaigns = data?.data ?? [];

  const publishMutation = useMutation({
    mutationFn: (id: string) => publishCampaign(id),
    onSuccess: (campaign) => {
      showToast.success(
        `Campaign is now ${campaign.status === "scheduled" ? "scheduled" : "live"}!`,
      );
      qc.invalidateQueries({ queryKey: ["sales-campaigns"] });
      setConfirmModal(null);
    },
    onError: (e: Error) => showToast.error(e.message),
  });

  const expireMutation = useMutation({
    mutationFn: (id: string) => expireCampaign(id),
    onSuccess: () => {
      showToast.success("Campaign expired");
      qc.invalidateQueries({ queryKey: ["sales-campaigns"] });
      setConfirmModal(null);
    },
    onError: (e: Error) => showToast.error(e.message),
  });

  function copyLink(campaign: SalesCampaign) {
    const url = `${window.location.origin}/c/${business}/${campaign.slug}`;
    navigator.clipboard
      .writeText(url)
      .then(() => showToast.success("Link copied!"));
  }

  return (
    <>
      <Topbar title="Sales Campaigns" subtitle="Landing pages · Storefronts" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Sales Campaigns"
          subtitle="Create shareable campaign pages that convert visitors into buyers."
          actions={
            <Button
              variant="primary"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => navigate("/sales-campaigns/new")}
            >
              New Campaign
            </Button>
          }
        />

        <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

        {isLoading ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState onNew={() => navigate("/sales-campaigns/new")} />
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.campaign_id}
                campaign={campaign}
                business={business ?? ""}
                menuOpen={menuOpen === campaign.campaign_id}
                onMenuToggle={() =>
                  setMenuOpen((m) =>
                    m === campaign.campaign_id ? null : campaign.campaign_id,
                  )
                }
                onEdit={() =>
                  navigate(`/sales-campaigns/${campaign.campaign_id}`)
                }
                onPublish={() =>
                  setConfirmModal({ action: "publish", campaign })
                }
                onExpire={() => setConfirmModal({ action: "expire", campaign })}
                onCopyLink={() => copyLink(campaign)}
                onViewOrders={() =>
                  navigate(
                    `/sales-campaigns/${campaign.campaign_id}?tab=orders`,
                  )
                }
                onAnalytics={() =>
                  navigate(
                    `/sales-campaigns/${campaign.campaign_id}?tab=analytics`,
                  )
                }
              />
            ))}
          </div>
        )}

        {/* Confirm modal */}
        <Modal
          open={!!confirmModal}
          onClose={() => setConfirmModal(null)}
          title={
            confirmModal?.action === "publish"
              ? "Publish Campaign"
              : "Expire Campaign"
          }
          size="sm"
          footer={
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setConfirmModal(null)}>
                Cancel
              </Button>
              <Button
                variant={
                  confirmModal?.action === "expire" ? "danger" : "primary"
                }
                loading={publishMutation.isPending || expireMutation.isPending}
                onClick={() => {
                  if (!confirmModal) return;
                  if (confirmModal.action === "publish")
                    publishMutation.mutate(confirmModal.campaign.campaign_id);
                  else expireMutation.mutate(confirmModal.campaign.campaign_id);
                }}
              >
                {confirmModal?.action === "publish"
                  ? "Yes, Publish"
                  : "Yes, Expire"}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-brand-cloud">
            {confirmModal?.action === "publish"
              ? `This will make "${confirmModal?.campaign.campaign_name}" publicly accessible${confirmModal?.campaign.start_date ? ` from ${fmtDate(confirmModal.campaign.start_date)}` : " immediately"}.`
              : `The campaign page will be taken offline and visitors will be redirected to your shop.`}
          </p>
        </Modal>
      </div>
    </>
  );
}

// ── Campaign Card ─────────────────────────────────────────────────────────────

interface CardProps {
  campaign: SalesCampaign;
  business: string;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onExpire: () => void;
  onCopyLink: () => void;
  onViewOrders: () => void;
  onAnalytics: () => void;
}

function CampaignCard({
  campaign,
  business,
  menuOpen,
  onMenuToggle,
  onEdit,
  onPublish,
  onExpire,
  onCopyLink,
  onViewOrders,
  onAnalytics,
}: CardProps) {
  const publicUrl = `/c/${business}/${campaign.slug}`;

  return (
    <div
      className="relative rounded-2xl border border-white/8 bg-brand-graphite overflow-hidden
                 hover:border-brand-accent/30 transition-all duration-200 cursor-pointer group"
      onClick={onEdit}
    >
      {/* Hero thumbnail */}
      <div className="relative h-32 bg-brand-charcoal overflow-hidden">
        {campaign.hero_image_url ? (
          <img
            src={campaign.hero_image_url}
            alt=""
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl opacity-20">✦</span>
          </div>
        )}
        {/* Status badge */}
        <div className="absolute top-3 left-3">
          <Badge
            tone={STATUS_BADGE[campaign.status] ?? "neutral"}
            size="xs"
            dot
          >
            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
          </Badge>
        </div>
        {/* Live indicator pulse */}
        {campaign.status === "live" && (
          <div className="absolute top-3 right-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-brand-cream truncate">
              {campaign.campaign_name}
            </p>
            <p className="text-xs text-brand-smoke mt-0.5 truncate">
              /{campaign.slug}
            </p>
          </div>
          {/* Menu */}
          <div
            className="relative shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onMenuToggle}
              className="p-1.5 rounded-lg text-brand-smoke hover:text-brand-cream hover:bg-white/5 transition-colors"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 min-w-[160px] rounded-xl border border-white/10 bg-brand-charcoal shadow-2xl py-1">
                {["draft", "scheduled", "expired"].includes(
                  campaign.status,
                ) && (
                  <MenuItem
                    icon={<Play className="h-3.5 w-3.5 text-green-400" />}
                    label={
                      campaign.status === "expired" ? "Re-publish" : "Publish"
                    }
                    onClick={onPublish}
                  />
                )}
                {campaign.status === "live" && (
                  <MenuItem
                    icon={<XCircle className="h-3.5 w-3.5 text-rose-400" />}
                    label="Expire"
                    onClick={onExpire}
                  />
                )}
                <MenuItem
                  icon={<Copy className="h-3.5 w-3.5" />}
                  label="Copy link"
                  onClick={onCopyLink}
                />
                <MenuItem
                  icon={<Eye className="h-3.5 w-3.5" />}
                  label="View orders"
                  onClick={onViewOrders}
                />
                <MenuItem
                  icon={<BarChart2 className="h-3.5 w-3.5" />}
                  label="Analytics"
                  onClick={onAnalytics}
                />
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-xs text-brand-smoke hover:text-brand-cream hover:bg-white/5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open page
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/5">
          <Stat label="Orders" value={campaign.order_count ?? 0} />
          <Stat
            label="Revenue"
            value={fmtMoney(campaign.confirmed_revenue ?? 0)}
          />
          <Stat label="Products" value={campaign.product_count ?? 0} />
        </div>

        {/* Dates */}
        {(campaign.start_date || campaign.end_date) && (
          <p className="text-xs text-brand-smoke/60">
            {campaign.start_date && `From ${fmtDate(campaign.start_date)}`}
            {campaign.start_date && campaign.end_date && " → "}
            {campaign.end_date && fmtDate(campaign.end_date)}
          </p>
        )}
        {campaign.is_evergreen && (
          <p className="text-xs text-brand-accent/60">Evergreen — no expiry</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-sm font-semibold text-brand-cream">{value}</p>
      <p className="text-[10px] text-brand-smoke/60 uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-brand-smoke hover:text-brand-cream hover:bg-white/5 text-left"
    >
      {icon} {label}
    </button>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="h-16 w-16 rounded-2xl bg-brand-graphite border border-white/8 flex items-center justify-center mb-4">
        <Share2 className="h-7 w-7 text-brand-accent/50" />
      </div>
      <p className="font-semibold text-brand-cream mb-1">No campaigns yet</p>
      <p className="text-sm text-brand-smoke max-w-sm mb-6">
        Create a shareable campaign page in minutes. Add products, set a
        deadline, and share the link.
      </p>
      <Button
        variant="primary"
        leftIcon={<Plus className="h-4 w-4" />}
        onClick={onNew}
      >
        Create First Campaign
      </Button>
    </div>
  );
}
