import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  Download,
  CheckCircle2,
  Send,
  Banknote,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { showToast } from "@hooks/useToast";
import { fmtMoney } from "@lib/format";
import { cn } from "@lib/cn";
import {
  getTaxDashboard,
  previewTax,
  saveFilingDraft,
  confirmFiling,
  markFiled,
  settleFiling,
  exportFiling,
  type TaxType,
  type TaxWorkpaper,
  type TaxFiling,
} from "@services/tax/tax";

const TAX_TABS: { type: TaxType; label: string; cadence: "month" | "year" }[] =
  [
    { type: "VAT", label: "VAT", cadence: "month" },
    { type: "WHT", label: "WHT", cadence: "month" },
    { type: "PAYE", label: "PAYE", cadence: "month" },
    { type: "CIT", label: "Company Income Tax", cadence: "year" },
  ];

function priorMonth(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const STATUS_TONE: Record<string, string> = {
  draft: "bg-white/10 text-brand-cloud",
  reviewed: "bg-blue-500/15 text-blue-300",
  filed: "bg-amber-500/15 text-amber-300",
  paid: "bg-green-500/15 text-green-300",
  exempt: "bg-purple-500/15 text-purple-300",
};

export default function TaxCenter() {
  const qc = useQueryClient();
  const [taxType, setTaxType] = useState<TaxType>("VAT");
  const cadence = TAX_TABS.find((t) => t.type === taxType)!.cadence;
  const [period, setPeriod] = useState<string>(priorMonth());
  const [wp, setWp] = useState<TaxWorkpaper | null>(null);
  const [filing, setFiling] = useState<TaxFiling | null>(null);

  const { data: dash } = useQuery({
    queryKey: ["tax-dashboard"],
    queryFn: getTaxDashboard,
  });

  // Keep the period sensible when switching cadence (year vs month).
  function switchTax(t: TaxType) {
    setTaxType(t);
    setWp(null);
    setFiling(null);
    const c = TAX_TABS.find((x) => x.type === t)!.cadence;
    setPeriod(
      c === "year" ? String(new Date().getUTCFullYear()) : priorMonth(),
    );
  }

  const verify = useMutation({
    mutationFn: () => previewTax(taxType, period),
    onSuccess: (data) => {
      setWp(data);
      setFiling(null);
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message ?? "Could not compute"),
  });

  const save = useMutation({
    mutationFn: () => saveFilingDraft(taxType, period),
    onSuccess: (f) => {
      setFiling(f);
      if (f.workpaper) setWp(f.workpaper);
      qc.invalidateQueries({ queryKey: ["tax-dashboard"] });
      showToast.success("Saved as draft");
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message ?? "Save failed"),
  });

  const act = useMutation({
    mutationFn: async (kind: "confirm" | "file" | "settle") => {
      if (!filing) throw new Error("Save the return first");
      if (kind === "confirm") return confirmFiling(filing.filing_id);
      if (kind === "file") {
        const ref =
          window.prompt("NRS/LIRS filing reference (optional):") ?? undefined;
        return markFiled(filing.filing_id, ref);
      }
      const bank =
        window.prompt("Bank account code to pay from:", "1210") ?? "1210";
      return settleFiling(filing.filing_id, bank);
    },
    onSuccess: (f) => {
      setFiling((prev) => ({ ...(prev as TaxFiling), ...f }));
      qc.invalidateQueries({ queryKey: ["tax-dashboard"] });
      showToast.success("Done");
    },
    onError: (e: any) =>
      showToast.error(e?.response?.data?.message ?? "Action failed"),
  });

  const profile = dash?.profile;
  const headerSubtitle = profile
    ? `${profile.legal_name ?? "Entity"}${profile.tin ? ` · TIN ${profile.tin}` : " · TIN not set"} · ${profile.tax_state}`
    : "Compute, verify, export and file";

  return (
    <div className="px-4 sm:px-8 py-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Tax Center"
        subtitle={headerSubtitle}
        crumbs={[{ label: "Tax" }]}
        actions={
          profile && (
            <span
              className={cn(
                "text-xs px-3 py-1 rounded-full",
                profile.is_small_company
                  ? "bg-green-500/15 text-green-300"
                  : "bg-white/10 text-brand-cloud",
              )}
            >
              {profile.is_small_company
                ? "Small company — CIT exempt"
                : "Standard company"}
            </span>
          )
        }
      />

      {/* Deadlines */}
      {dash?.deadlines?.length ? (
        <div className="grid sm:grid-cols-3 gap-3">
          {dash.deadlines.map((d) => (
            <div
              key={d.tax_type}
              className="rounded-2xl border border-white/8 bg-brand-graphite px-4 py-3"
            >
              <p className="text-xs text-brand-smoke">
                {d.tax_type} · {d.period_label}
              </p>
              <p className="text-sm font-semibold text-brand-cream mt-0.5">
                Due {d.due}
              </p>
              <p className="text-[11px] text-brand-smoke/70">{d.authority}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Controls */}
      <div className="rounded-2xl border border-white/8 bg-brand-graphite p-5 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {TAX_TABS.map((t) => (
            <button
              key={t.type}
              onClick={() => switchTax(t.type)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-medium transition-colors",
                taxType === t.type
                  ? "bg-brand-accent/15 text-brand-accent border border-brand-accent/30"
                  : "text-brand-cloud hover:bg-white/5 border border-transparent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-brand-smoke mb-1">
              {cadence === "year" ? "Year (YYYY)" : "Period (YYYY-MM)"}
            </label>
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value.trim())}
              placeholder={cadence === "year" ? "2026" : "2026-05"}
              className="rounded-xl border border-white/10 bg-brand-charcoal px-3 py-2 text-sm text-brand-cream focus:outline-none focus:border-brand-accent/40 w-36"
            />
          </div>
          <Button
            variant="primary"
            loading={verify.isPending}
            leftIcon={<Calculator className="h-4 w-4" />}
            onClick={() => verify.mutate()}
          >
            Verify figure
          </Button>
          {wp && !filing && (
            <Button
              variant="secondary"
              loading={save.isPending}
              leftIcon={<FileText className="h-4 w-4" />}
              onClick={() => save.mutate()}
            >
              Save as draft
            </Button>
          )}
        </div>
      </div>

      {/* Workpaper */}
      {wp && (
        <div className="rounded-2xl border border-white/8 bg-brand-graphite p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-brand-smoke uppercase tracking-wide">
                {wp.tax_type} · {wp.period_label}
              </p>
              <p className="text-3xl font-bold text-brand-cream mt-1">
                {fmtMoney(filing?.final_amount ?? wp.computed_amount)}
              </p>
              {wp.meta?.deadline ? (
                <p className="text-xs text-brand-smoke mt-1">
                  Due: {String(wp.meta.deadline)}
                </p>
              ) : null}
            </div>
            {filing && (
              <span
                className={cn(
                  "text-xs px-3 py-1 rounded-full capitalize",
                  STATUS_TONE[filing.status] ?? "bg-white/10",
                )}
              >
                {filing.status}
              </span>
            )}
          </div>

          {/* Warnings */}
          {wp.warnings?.length > 0 && (
            <div className="space-y-2">
              {wp.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-200">{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5">
            {Object.entries(wp.summary || {})
              .filter(([, v]) => v !== null && v !== undefined)
              .map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between border-b border-white/5 py-1.5"
                >
                  <span className="text-xs text-brand-smoke capitalize">
                    {k.replace(/_/g, " ")}
                  </span>
                  <span className="text-sm text-brand-cream text-right">
                    {fmtSummary(v)}
                  </span>
                </div>
              ))}
          </div>

          {/* Drill-down */}
          {wp.lines?.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-white/8">
              <table className="w-full text-xs">
                <thead className="bg-white/5 text-brand-smoke">
                  <tr>
                    {(wp.tax_type === "CIT"
                      ? ["Line", "Code", "Type", "Amount"]
                      : [
                          "Date",
                          "Entry",
                          "Description",
                          "Account",
                          "Debit",
                          "Credit",
                        ]
                    ).map((h) => (
                      <th key={h} className="text-left font-medium px-3 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-brand-cloud">
                  {wp.lines.slice(0, 200).map((l: any, i: number) => (
                    <tr key={i} className="border-t border-white/5">
                      {wp.tax_type === "CIT" ? (
                        <>
                          <td className="px-3 py-1.5">{l.name}</td>
                          <td className="px-3 py-1.5">{l.code}</td>
                          <td className="px-3 py-1.5">{l.type}</td>
                          <td className="px-3 py-1.5 text-right">
                            {fmtMoney(l.amount)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {l.date}
                          </td>
                          <td className="px-3 py-1.5">{l.entry}</td>
                          <td className="px-3 py-1.5">{l.description}</td>
                          <td className="px-3 py-1.5">{l.account}</td>
                          <td className="px-3 py-1.5 text-right">
                            {l.debit ? fmtMoney(l.debit) : ""}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {l.credit ? fmtMoney(l.credit) : ""}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Filing actions */}
          {filing && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<Download className="h-3.5 w-3.5" />}
                onClick={() =>
                  exportFiling(
                    filing.filing_id,
                    `${filing.tax_type}-${filing.period_label}.csv`,
                  )
                }
              >
                Export CSV
              </Button>
              {filing.status === "draft" && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={act.isPending}
                  leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  onClick={() => act.mutate("confirm")}
                >
                  Confirm reviewed
                </Button>
              )}
              {["draft", "reviewed", "exempt"].includes(filing.status) && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={act.isPending}
                  leftIcon={<Send className="h-3.5 w-3.5" />}
                  onClick={() => act.mutate("file")}
                >
                  Mark filed
                </Button>
              )}
              {["reviewed", "filed"].includes(filing.status) &&
                filing.tax_type !== "CIT" && (
                  <Button
                    size="sm"
                    variant="gold"
                    loading={act.isPending}
                    leftIcon={<Banknote className="h-3.5 w-3.5" />}
                    onClick={() => act.mutate("settle")}
                  >
                    Settle &amp; post remittance
                  </Button>
                )}
            </div>
          )}
        </div>
      )}

      {/* Filing history */}
      {dash?.filings?.length ? (
        <div className="rounded-2xl border border-white/8 bg-brand-graphite p-5">
          <p className="text-sm font-semibold text-brand-cream mb-3">
            Recent returns
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-brand-smoke">
                <tr>
                  {["Type", "Period", "Amount", "Status", "Reference"].map(
                    (h) => (
                      <th key={h} className="text-left font-medium px-3 py-2">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="text-brand-cloud">
                {dash.filings.map((f) => (
                  <tr key={f.filing_id} className="border-t border-white/5">
                    <td className="px-3 py-2 font-medium text-brand-cream">
                      {f.tax_type}
                    </td>
                    <td className="px-3 py-2">{f.period_label}</td>
                    <td className="px-3 py-2">{fmtMoney(f.final_amount)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full capitalize",
                          STATUS_TONE[f.status] ?? "bg-white/10",
                        )}
                      >
                        {f.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-brand-smoke">
                      {f.filing_reference ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function fmtSummary(v: unknown): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") {
    // Rates (0–1) shown as %, money shown as currency.
    if (v > 0 && v < 1) return `${(v * 100).toFixed(2).replace(/\.00$/, "")}%`;
    return fmtMoney(v);
  }
  return String(v);
}
