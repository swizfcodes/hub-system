import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, ChevronRight } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { listSavedReports } from "@services/reports";
import { REPORT_FAMILIES } from "@lib/constants/reportsConstants";
import type { ReportFamilyKey } from "@lib/constants/reportsConstants";
import { fmtDate } from "@lib/format";
import { Topbar } from "@/components/shell/Topbar";

export default function ReportsHome() {
  const navigate = useNavigate();

  const { data: saved } = useQuery({
    queryKey: ["saved-reports"],
    queryFn: listSavedReports,
  });

  const savedList = saved?.data ?? [];
  const pinned = savedList.filter((r) => r.is_shared).slice(0, 4);

  return (
    <>
      <Topbar title="Reports" subtitle="Analysis · Reports" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-8">
        <PageHeader
          title="Reports"
          subtitle="Standard reports, custom analysis, and scheduled delivery."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Reports" }]}
        />

        {/* Pinned / shared saved reports */}
        {pinned.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
              Pinned Reports
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {pinned.map((r) => {
                const [family, type] = r.report_type.split(".");
                const familyDef = REPORT_FAMILIES[family as ReportFamilyKey];
                return (
                  <button
                    key={r.report_id}
                    onClick={() =>
                      navigate(
                        `/reports/${family}/${type}?saved=${r.report_id}`,
                      )
                    }
                    className="flex flex-col items-start gap-3 rounded-2xl border border-brand-accent/20 bg-brand-accent/5 px-4 py-4 text-left hover:bg-brand-accent/10 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{familyDef?.icon ?? "📊"}</span>
                      <Bookmark className="h-3.5 w-3.5 text-brand-accent" />
                    </div>
                    <p className="text-sm font-semibold text-brand-cream">
                      {r.report_name}
                    </p>
                    {r.last_run_at && (
                      <p className="text-[10px] text-brand-smoke">
                        Last run {fmtDate(r.last_run_at)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Report families */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
            All Reports
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(REPORT_FAMILIES).map(([key, family]) => (
              <div
                key={key}
                className="rounded-2xl border border-white/5 bg-brand-charcoal overflow-hidden"
              >
                {/* Family header */}
                <div
                  className="flex items-center gap-3 px-5 py-4 border-b border-white/5"
                  style={{ borderLeft: `4px solid ${family.color}` }}
                >
                  <span className="text-2xl">{family.icon}</span>
                  <div>
                    <p className="font-semibold text-brand-cream">
                      {family.label}
                    </p>
                    <p className="text-[10px] text-brand-smoke uppercase tracking-widest">
                      {family.types.length} report
                      {(family.types.length as number) !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>

                {/* Report types */}
                <div className="divide-y divide-white/5">
                  {family.types.map((type) => (
                    <button
                      key={type.key}
                      onClick={() => navigate(`/reports/${key}/${type.key}`)}
                      className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-brand-graphite/20 transition-colors group"
                    >
                      <p className="text-sm text-brand-cloud group-hover:text-brand-cream transition-colors">
                        {type.label}
                      </p>
                      <ChevronRight className="h-4 w-4 text-brand-smoke/40 group-hover:text-brand-smoke transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Saved reports shortcut */}
        <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-brand-charcoal px-5 py-4">
          <div className="flex items-center gap-3">
            <Bookmark className="h-5 w-5 text-brand-smoke" />
            <div>
              <p className="text-sm font-medium text-brand-cream">
                Saved Reports
              </p>
              <p className="text-xs text-brand-smoke">
                {savedList.length} saved · includes scheduled deliveries
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/reports/saved")}
            className="flex items-center gap-1.5 text-xs text-brand-accent hover:underline"
          >
            Manage all <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
