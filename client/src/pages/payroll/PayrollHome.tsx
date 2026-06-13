import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Play } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Select } from "@components/ui/Select";
import { Skeleton } from "@components/ui/Skeleton";
import {
  RunStatusBadge,
  PayrollModePicker,
  PaymentMethodPicker,
} from "@components/payroll/PayrollComponents";
import { listRuns, initiateRun } from "@services/payroll";
import { MONTH_NAMES, formatPeriod } from "@lib/constants/payrollConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { PayrollMode, PaymentMethod } from "@typedefs/payroll";
import type { SelectOption } from "@components/ui/Select";
import { Topbar } from "@components/shell/Topbar";

// Build month/year options
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS: SelectOption[] = [
  currentYear - 1,
  currentYear,
  currentYear + 1,
].map((y) => ({ value: String(y), label: String(y) }));
const MONTH_OPTIONS: SelectOption[] = MONTH_NAMES.slice(1).map((m, i) => ({
  value: String(i + 1),
  label: m,
}));

export default function PayrollHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();

  // Payroll mode — persisted in localStorage for convenience
  const [mode, setMode] = useState<PayrollMode>(
    () => (localStorage.getItem("payrollMode") as PayrollMode) || "full_paye",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bulk");
  const [showInitiate, setShowInitiate] = useState(false);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(currentYear));

  function handleModeChange(m: PayrollMode) {
    setMode(m);
    localStorage.setItem("payrollMode", m);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["payroll-runs"],
    queryFn: listRuns,
    refetchInterval: 60_000,
  });
  const runs = data?.data ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      initiateRun({
        period_month: parseInt(month),
        period_year: parseInt(year),
        mode,
      }),
    onSuccess: (run) => {
      showToast.success(`Payroll run ${run.run_number} initiated`);
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      setShowInitiate(false);
      navigate(`/payroll/runs/${run.run_id}`);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <>
      <Topbar title="Payroll" subtitle="Salary processing · Compliance" />
      <div className="px-4 sm:px-8 py-6 max-w-6xl mx-auto space-y-8">
        <PageHeader
          title="Payroll"
          subtitle="Run payroll, view payslips, and generate compliance schedules."
          crumbs={[{ label: "Payroll" }]}
          actions={
            <Button onClick={() => setShowInitiate(true)}>
              <Play className="h-4 w-4" />
              Initiate Payroll Run
            </Button>
          }
        />

        {/* Payroll mode selector — visible and prominent */}
        <PayrollModePicker value={mode} onChange={handleModeChange} />

        {/* Runs list */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
            Payroll Runs
          </p>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-2xl" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className="py-12 text-center rounded-2xl border border-white/5 bg-brand-charcoal">
              <p className="text-sm text-brand-smoke mb-3">
                No payroll runs yet.
              </p>
              <Button variant="ghost" onClick={() => setShowInitiate(true)}>
                Start your first payroll run
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/5">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-brand-charcoal">
                    {[
                      "Run #",
                      "Period",
                      "Headcount",
                      "Total Gross",
                      "Total Net",
                      "PAYE",
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
                  {runs.map((run) => (
                    <tr
                      key={run.run_id}
                      className="bg-brand-charcoal hover:bg-brand-graphite/20 transition-colors cursor-pointer"
                      onClick={() => navigate(`/payroll/runs/${run.run_id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-brand-accent">
                        {run.run_number}
                      </td>
                      <td className="px-4 py-3 font-medium text-brand-cream">
                        {formatPeriod(run.period_month, run.period_year)}
                      </td>
                      <td className="px-4 py-3 text-brand-smoke">
                        {run.payslip_count ?? "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-brand-cream">
                        {fmtMoney(run.total_gross, currency)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-green-400">
                        {fmtMoney(run.total_net, currency)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-brand-smoke">
                        {run.mode === "simplified"
                          ? "—"
                          : fmtMoney(run.total_paye, currency)}
                      </td>
                      <td className="px-4 py-3">
                        <RunStatusBadge status={run.status} size="xs" />
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="h-4 w-4 text-brand-smoke" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Initiate run modal */}
        <Modal
          open={showInitiate}
          onClose={() => setShowInitiate(false)}
          title="Initiate Payroll Run"
          size="md"
          surface="light"
          footer={
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setShowInitiate(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => mutation.mutate()}
                loading={mutation.isPending}
              >
                <Play className="h-4 w-4" />
                Initiate Run
              </Button>
            </div>
          }
        >
          <div className="space-y-5">
            {/* Mode reminder */}
            <div
              className="rounded-xl border px-4 py-3 text-sm"
              style={{
                borderColor:
                  mode === "full_paye" ? "#C9A86C40" : "rgba(255,255,255,0.05)",
                backgroundColor:
                  mode === "full_paye" ? "#C9A86C08" : "transparent",
              }}
            >
              <p
                className="font-medium"
                style={{ color: mode === "full_paye" ? "#C9A86C" : "#9E9891" }}
              >
                {mode === "full_paye"
                  ? "Full PAYE Mode"
                  : "Simplified Salary Mode"}
              </p>
              <p className="text-xs text-text-on-light-muted mt-0.5">
                {mode === "full_paye"
                  ? "PAYE, pension, and NHF will be calculated automatically."
                  : "No PAYE, pension, or NHF. Outstanding advances and unpaid leave are still recovered."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Month *"
                options={MONTH_OPTIONS}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                surface="light"
              />
              <Select
                label="Year *"
                options={YEAR_OPTIONS}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                surface="light"
              />
            </div>

            <PaymentMethodPicker
              value={paymentMethod}
              onChange={setPaymentMethod}
            />

            <p className="text-xs text-text-on-light-muted">
              The run will calculate payslips for all active staff. You can
              review before approving. Once approved, journals post to
              accounting automatically.
            </p>
          </div>
        </Modal>
      </div>
    </>
  );
}
