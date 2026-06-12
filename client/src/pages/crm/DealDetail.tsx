import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { Button } from "@components/ui/Button";
import { Tabs } from "@components/ui/Tabs";
import { DealSidebar } from "@components/crm/detail/DealSidebar";
import { DealActivityFeed } from "@components/crm/detail/DealActivityFeed";
import { DealNotes } from "@components/crm/detail/DealNotes";
import { DealItems } from "@components/crm/detail/DealItems";
import { LogActivityFab } from "@components/crm/detail/LogActivityFab";
import { getDeal } from "@services/crm/deals";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { useState } from "react";
import { TrendingUp } from "lucide-react";

const TABS = [
  { key: "timeline", label: "Timeline" },
  { key: "notes", label: "Notes" },
  { key: "items", label: "Items & Quotes" },
];

export default function DealDetail() {
  const { active: business } = useActiveBusiness();
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("timeline");

  const {
    data: deal,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["crm", "deal", id, business],
    queryFn: () => getDeal(id!),
    enabled: !!id,
  });

  return (
    <>
      <Topbar title={deal?.title || "Deal"} subtitle={deal?.contact_name} />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "CRM", to: "/crm" },
              { label: deal?.title ?? "…" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate("/crm")}
          >
            Back to pipeline
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
            <Skeleton className="h-[600px]" />
            <Skeleton className="h-[600px]" />
          </div>
        ) : error || !deal ? (
          <EmptyState
            icon={<TrendingUp className="w-7 h-7" />}
            title="Deal not found"
            description="It may have been archived."
          />
        ) : (
          <>
            <header className="mb-6">
              <h1 className="font-display font-light text-3xl sm:text-4xl text-brand-cream">
                {deal.title}
              </h1>
              {deal.contact_name && (
                <p className="text-sm text-brand-smoke mt-1">
                  for {deal.contact_name}
                </p>
              )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 lg:gap-8 items-start">
              <main className="space-y-6 min-w-0">
                <Tabs tabs={TABS} active={tab} onChange={setTab} />
                <div className="animate-fade-in">
                  {tab === "timeline" && (
                    <DealActivityFeed activities={deal.activities} />
                  )}
                  {tab === "notes" && <DealNotes dealId={deal.deal_id} />}
                  {tab === "items" && (
                    <DealItems
                      dealId={deal.deal_id}
                      contactId={deal.contact_id}
                      contactName={deal.contact_name}
                    />
                  )}
                </div>
              </main>

              <DealSidebar deal={deal} />
            </div>

            <LogActivityFab dealId={deal.deal_id} />
          </>
        )}
      </div>
    </>
  );
}
