import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Archive } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Tabs } from "@components/ui/Tabs";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import { ConfirmationModal } from "@components/ui/ConfirmationModal";
import { ProfileTab } from "@components/settings/business-setup/tabs/ProfileTab";
import { BrandingTab } from "@components/settings/business-setup/tabs/BrandingTab";
import { FinancialTab } from "@components/settings/business-setup/tabs/FinancialTab";
import { AdvancedTab } from "@components/settings/business-setup/tabs/AdvancedTab";
import {
  getBusiness,
  deactivateBusiness,
  updateBusiness,
} from "@services/settings/businesses";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "branding", label: "Branding" },
  { key: "financial", label: "Financial" },
  { key: "advanced", label: "Advanced" },
];

export default function BusinessSetupDetail() {
  const { key } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState("profile");
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data: business, isLoading } = useQuery({
    queryKey: ["settings", "businesses", key],
    queryFn: () => getBusiness(key!),
    enabled: !!key,
  });

  const archiveMutation = useMutation({
    mutationFn: () =>
      business?.is_active
        ? deactivateBusiness(business.business_key)
        : updateBusiness(business!.business_key, { is_active: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "businesses"] });
      showToast.success(
        business?.is_active ? "Business archived" : "Business restored",
      );
      setArchiveOpen(false);
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <>
      <Topbar
        title={business?.display_name || "Business"}
        subtitle="Edit business configuration"
      />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Settings", to: "/settings" },
              { label: "Business Setup", to: "/settings/business-setup" },
              { label: business?.display_name ?? "…" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ChevronLeft className="w-4 h-4" />}
            onClick={() => navigate("/settings/business-setup")}
          >
            Back to list
          </Button>
        </div>

        {isLoading || !business ? (
          <div className="space-y-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-96" />
          </div>
        ) : (
          <>
            {/* Header with accent stripe */}
            <header className="relative mb-8 rounded-3xl overflow-hidden bg-brand-charcoal border border-brand-graphite">
              <div
                className="absolute top-0 inset-x-0 h-1.5"
                style={{ background: business.accent_colour }}
              />
              <div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-brand-cream border border-brand-cloud/40 p-2 flex items-center justify-center">
                  {business.logo_path ? (
                    <img
                      src={business.logo_path}
                      alt="logo"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <span className="font-display text-4xl text-brand-black/70">
                      {business.display_name[0]}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="font-display font-light text-3xl sm:text-4xl text-brand-cream truncate">
                      {business.display_name}
                    </h1>
                    {business.is_active ? (
                      <Badge tone="sage" dot>
                        Active
                      </Badge>
                    ) : (
                      <Badge tone="danger" dot>
                        Archived
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-brand-smoke truncate mt-1">
                    {business.legal_name}
                  </p>
                  <p className="text-xs text-brand-smoke mt-0.5 font-mono">
                    {business.business_key}
                  </p>
                </div>
                <Button
                  variant={business.is_active ? "danger" : "secondary"}
                  size="sm"
                  leftIcon={<Archive className="w-4 h-4" />}
                  onClick={() => setArchiveOpen(true)}
                >
                  {business.is_active ? "Archive" : "Restore"}
                </Button>
              </div>
            </header>

            {/* Tabs */}
            <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-6" />

            {/* Tab body — on cream surface */}
            <div className="bg-surface-light surface-light rounded-3xl p-6 sm:p-8 border border-brand-cloud/30 shadow-lift">
              {tab === "profile" && <ProfileTab business={business} />}
              {tab === "branding" && <BrandingTab business={business} />}
              {tab === "financial" && <FinancialTab business={business} />}
              {tab === "advanced" && <AdvancedTab business={business} />}
            </div>
          </>
        )}
      </div>

      <ConfirmationModal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => {
          archiveMutation.mutateAsync();
        }}
        title={
          business?.is_active
            ? `Archive “${business?.display_name}”?`
            : `Restore “${business?.display_name}”?`
        }
        message={
          business?.is_active ? (
            <div className="space-y-3">
              <p>
                This deactivates <strong>{business.display_name}</strong>. Users
                currently signed in will lose access on their next request.
              </p>
              <p className="text-text-on-light-muted">
                Postgres data is preserved; you can restore later.
              </p>
            </div>
          ) : (
            <p>
              Re-activate <strong>{business?.display_name}</strong>. Users with
              permission regain access immediately.
            </p>
          )
        }
        tone={business?.is_active ? "danger" : "warn"}
        confirmPhrase={business?.is_active ? business?.business_key : undefined}
        confirmLabel={business?.is_active ? "Archive" : "Restore"}
        loading={archiveMutation.isPending}
      />
    </>
  );
}
