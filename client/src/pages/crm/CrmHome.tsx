// CRM home — clients first.
//
// Luxury retail runs on relationships: staff look a customer up
// before, during and after almost every sale. So the CRM opens on
// the client workspace — search, smart segments and the Today work
// feed — while the B2B pipeline (banks, hotels, bulk orders) lives
// one tab over, simplified to board + table.

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { usePermissions } from "@hooks/usePermissions";
import { Plus, LayoutGrid, Rows3, Users, Handshake } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Tabs } from "@components/ui/Tabs";
import { ForecastStrip } from "@components/crm/shared/ForecastStrip";
import { PipelineBoard } from "@components/crm/pipeline/PipelineBoard";
import { PipelineTable } from "@components/crm/pipeline/PipelineTable";
import { NewDealModal } from "@components/crm/modals/NewDealModal";
import { TodayStrip } from "@components/crm/clients/TodayStrip";
import { ClientsList } from "@components/crm/clients/ClientsList";
import { SegmentSettingsModal } from "@components/crm/clients/SegmentSettingsModal";
import { getPipeline } from "@services/crm/pipeline";
import { getClientsToday } from "@services/crm/clients";
import { cn } from "@lib/cn";

type Workspace = "clients" | "deals";
type DealsView = "table" | "board";

export default function CrmHome() {
  const { active: business } = useActiveBusiness();
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [workspace, setWorkspace] = useState<Workspace>(
    () =>
      (searchParams.get("tab") as Workspace) ||
      (localStorage.getItem("orika_crm_tab") as Workspace) ||
      "clients",
  );
  const [dealsView, setDealsView] = useState<DealsView>(
    () => (localStorage.getItem("orika_crm_deals_view") as DealsView) || "board",
  );
  const [creating, setCreating] = useState(false);
  const [stageForNew, setStageForNew] = useState<string | undefined>();
  const [tuning, setTuning] = useState(false);

  useEffect(() => {
    localStorage.setItem("orika_crm_tab", workspace);
    const next = new URLSearchParams(searchParams);
    if (workspace !== "clients") next.set("tab", workspace);
    else next.delete("tab");
    setSearchParams(next, { replace: true });
  }, [workspace]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    localStorage.setItem("orika_crm_deals_view", dealsView);
  }, [dealsView]);

  const { data: today, isLoading: todayLoading } = useQuery({
    queryKey: ["crm", "today", business],
    queryFn: getClientsToday,
    enabled: workspace === "clients",
    refetchOnWindowFocus: true,
  });

  const { data: pipeline, isLoading: pipelineLoading } = useQuery({
    queryKey: ["crm", "pipeline", business],
    queryFn: () => getPipeline(),
    enabled: workspace === "deals",
    refetchOnWindowFocus: true,
  });

  return (
    <>
      <Topbar title="CRM" subtitle="Clients · Relationships · B2B deals" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-[1500px] mx-auto">
        <PageHeader
          title="Clients"
          subtitle="Know every client — what they buy, what they love, when to call."
          crumbs={[{ label: "Hub", to: "/" }, { label: "CRM" }]}
          actions={
            <>
              <Tabs
                variant="pill"
                tabs={[
                  {
                    key: "clients",
                    label: "Clients",
                    icon: <Users className="w-3.5 h-3.5" />,
                  },
                  {
                    key: "deals",
                    label: "B2B deals",
                    icon: <Handshake className="w-3.5 h-3.5" />,
                  },
                ]}
                active={workspace}
                onChange={(k) => setWorkspace(k as Workspace)}
              />
              {workspace === "deals" && (
                <>
                  <div className="inline-flex p-0.5 rounded-xl bg-brand-charcoal border border-brand-graphite">
                    {(
                      [
                        { key: "board", label: "Board", icon: LayoutGrid },
                        { key: "table", label: "Table", icon: Rows3 },
                      ] as const
                    ).map((v) => {
                      const Icon = v.icon;
                      return (
                        <button
                          key={v.key}
                          onClick={() => setDealsView(v.key)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.65rem] font-semibold uppercase tracking-wide transition-all",
                            dealsView === v.key
                              ? "bg-brand-graphite text-brand-cream"
                              : "text-brand-smoke hover:text-brand-cream",
                          )}
                          title={v.label}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{v.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    variant="gold"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={() => {
                      setStageForNew(undefined);
                      setCreating(true);
                    }}
                  >
                    New deal
                  </Button>
                </>
              )}
            </>
          }
        />

        {workspace === "clients" && (
          <div className="animate-fade-in">
            <TodayStrip feed={today} loading={todayLoading} />
            <ClientsList
              canEditSettings={hasPermission("crm", "edit")}
              onOpenSettings={() => setTuning(true)}
            />
          </div>
        )}

        {workspace === "deals" && (
          <div className="animate-fade-in">
            <ForecastStrip pipeline={pipeline?.pipeline} loading={pipelineLoading} />
            {dealsView === "board" ? (
              <PipelineBoard
                pipeline={pipeline?.pipeline}
                loading={pipelineLoading}
                onNewDeal={(s) => {
                  setStageForNew(s);
                  setCreating(true);
                }}
              />
            ) : (
              <PipelineTable
                pipeline={pipeline?.pipeline}
                loading={pipelineLoading}
              />
            )}
          </div>
        )}
      </div>

      <NewDealModal
        open={creating}
        onClose={() => setCreating(false)}
        defaultStage={stageForNew}
        onCreated={(id) => navigate(`/crm/${id}`)}
      />
      <SegmentSettingsModal open={tuning} onClose={() => setTuning(false)} />
    </>
  );
}
