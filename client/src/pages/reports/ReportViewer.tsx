import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Table2,
  BarChart2,
  Download,
  Bookmark,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Skeleton } from "@components/ui/Skeleton";
import { ReportTable } from "@components/reports/ReportTable";
import { ReportChart } from "@components/reports/ReportChart";
import { ReportFilters } from "@components/reports/ReportFilters";
import {
  generateReport,
  generateConsolidated,
  downloadReport,
  createSavedReport,
} from "@services/reports";
import {
  REPORT_FAMILIES,
  getPresetRange,
} from "@lib/constants/reportsConstants";
import type { ReportFamilyKey } from "@lib/constants/reportsConstants";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import type { ReportData, ReportFilters as Filters } from "@typedefs/reports";

type ViewMode = "table" | "chart";

export default function ReportViewer() {
  const { family = "", reportType = "" } = useParams<{
    family: string;
    reportType: string;
  }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const familyDef = REPORT_FAMILIES[family as ReportFamilyKey];
  const reportDef = familyDef?.types.find((t) => t.key === reportType);

  const defaultRange = getPresetRange("this_month");

  const [filters, setFilters] = useState<Filters>({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
    groupBy: "month",
    compareMode: "none",
  });
  const [report, setReport] = useState<ReportData | null>(null);
  const [compareReport, setCompareReport] = useState<ReportData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [isLoading, setIsLoading] = useState(false);
  const [isConsolidated, setIsConsolidated] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState(
    `${familyDef?.label} — ${reportDef?.label ?? ""}`,
  );
  const [saveShared, setSaveShared] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  async function runReport() {
    setIsLoading(true);
    setReport(null);
    setCompareReport(null);
    try {
      if (isConsolidated) {
        const data = await generateConsolidated(
          family,
          reportType,
          filters.startDate,
          filters.endDate,
        );
        setReport(data);
      } else {
        const data = await generateReport({
          family,
          reportType,
          startDate: filters.startDate,
          endDate: filters.endDate,
          groupBy: filters.groupBy,
        });
        setReport(data);

        // Run comparison if enabled
        if (
          filters.compareMode !== "none" &&
          filters.compareStart &&
          filters.compareEnd
        ) {
          const cData = await generateReport({
            family,
            reportType,
            startDate: filters.compareStart,
            endDate: filters.compareEnd,
            groupBy: filters.groupBy,
          });
          setCompareReport(cData);
        }
      }
    } catch (err) {
      showToast.error(errMsg(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExport(format: "pdf" | "csv" | "excel") {
    setIsExporting(format);
    try {
      const blob = await downloadReport({
        family,
        reportType,
        startDate: filters.startDate,
        endDate: filters.endDate,
        groupBy: filters.groupBy,
        format,
        archive: true,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${family}-${reportType}-${filters.startDate}.${format === "excel" ? "xlsx" : format}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast.success(`${format.toUpperCase()} downloaded`);
    } catch (err) {
      showToast.error(errMsg(err));
    } finally {
      setIsExporting(null);
    }
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      createSavedReport({
        report_name: saveName,
        report_type: `${family}.${reportType}`,
        filters: {
          startDate: filters.startDate,
          endDate: filters.endDate,
          groupBy: filters.groupBy,
        },
        is_shared: saveShared,
      }),
    onSuccess: () => {
      showToast.success("Report saved");
      qc.invalidateQueries({ queryKey: ["saved-reports"] });
      setShowSaveModal(false);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  if (!familyDef || !reportDef) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-brand-smoke">Report not found.</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate("/reports")}
        >
          Back
        </Button>
      </div>
    );
  }

  const isSensitive = familyDef.permission === "approve";

  return (
    <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title={reportDef.label}
        subtitle={familyDef.label}
        crumbs={[
          { label: "Reports", to: "/reports" },
          { label: familyDef.label },
          { label: reportDef.label },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Consolidated toggle (owner only) */}
            <button
              onClick={() => setIsConsolidated((c) => !c)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all",
                isConsolidated
                  ? "border-brand-accent/40 bg-brand-accent/10 text-brand-accent"
                  : "border-white/10 text-brand-smoke hover:border-white/20",
              )}
              title="Combine both brands"
            >
              <Building2 className="h-3.5 w-3.5" />
              {isConsolidated ? "Consolidated" : "Single brand"}
            </button>

            {report && (
              <>
                {/* View toggle */}
                <div className="flex rounded-xl border border-white/5 bg-brand-charcoal p-0.5">
                  {(["table", "chart"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setViewMode(m)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                        viewMode === m
                          ? "bg-brand-accent text-brand-black"
                          : "text-brand-smoke hover:text-brand-cream",
                      )}
                    >
                      {m === "table" ? (
                        <Table2 className="h-3.5 w-3.5" />
                      ) : (
                        <BarChart2 className="h-3.5 w-3.5" />
                      )}
                      {m === "table" ? "Table" : "Chart"}
                    </button>
                  ))}
                </div>

                {/* Export buttons */}
                {(["pdf", "excel", "csv"] as const).map((fmt) => (
                  <Button
                    key={fmt}
                    size="sm"
                    variant="secondary"
                    onClick={() => handleExport(fmt)}
                    loading={isExporting === fmt}
                  >
                    <Download className="h-3.5 w-3.5" />
                    {fmt.toUpperCase()}
                  </Button>
                ))}

                {/* Save */}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowSaveModal(true)}
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  Save
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Sensitive warning */}
      {isSensitive && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-900/10 px-4 py-2.5 text-xs text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          This report contains sensitive financial data. Every access is logged.
        </div>
      )}

      {/* Filters */}
      <ReportFilters
        family={family}
        reportType={reportType}
        filters={filters}
        onChange={setFilters}
        onRun={runReport}
        isLoading={isLoading}
      />

      {/* Report output */}
      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : report ? (
        <div className="space-y-4">
          {/* Generated timestamp */}
          <p className="text-xs text-brand-smoke">
            Generated{" "}
            {new Date(report.meta.generatedAt).toLocaleString("en-NG")}
            {isConsolidated && " · Consolidated view (both brands)"}
            {compareReport &&
              ` · Comparing ${filters.compareStart} → ${filters.compareEnd}`}
          </p>

          {viewMode === "table" ? (
            <ReportTable report={report} compareReport={compareReport} />
          ) : (
            <ReportChart
              report={report}
              familyKey={family}
              reportType={reportType}
            />
          )}
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-white/5 bg-brand-charcoal">
          <div className="text-center">
            <BarChart2 className="mx-auto h-10 w-10 text-brand-smoke/30 mb-3" />
            <p className="text-sm text-brand-smoke">
              Set your filters and click Run Report
            </p>
          </div>
        </div>
      )}

      {/* Save modal */}
      <Modal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title="Save Report"
        size="sm"
        surface="light"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowSaveModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
            >
              <Bookmark className="h-4 w-4" />
              Save Report
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Report Name *"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            surface="light"
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={saveShared}
              onChange={(e) => setSaveShared(e.target.checked)}
              className="rounded"
            />
            <span className="text-text-on-light-muted">
              Pin to home dashboard (visible to all staff)
            </span>
          </label>
        </div>
      </Modal>
    </div>
  );
}
