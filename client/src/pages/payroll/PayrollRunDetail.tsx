import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, DollarSign, Eye, Send } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import {
  RunStatusBadge,
  PayrollSummaryStrip,
  ComplianceOutputsPanel,
  PaymentMethodPicker,
} from "@components/payroll/PayrollComponents";
import {
  getRun,
  getPayslips,
  approveRun,
  markRunPaid,
  sendPayslip,
} from "@services/payroll";
import { formatPeriod } from "@lib/constants/payrollConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { PaymentMethod } from "@typedefs/payroll";

export default function PayrollRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("bulk");
  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data: run, isLoading: runLoading } = useQuery({
    queryKey: ["payroll-run", id],
    queryFn: () => getRun(id!),
    enabled: !!id,
  });

  // Mode is a persisted property of the run itself — not the global
  // localStorage toggle — so a simplified run always renders as
  // simplified (PAYE/pension/NHF hidden, no compliance outputs) even
  // when the picker on the home page is currently set to full PAYE.
  const mode = run?.mode ?? "full_paye";
  const isFull = mode === "full_paye";

  const { data: payslipsData, isLoading: slipsLoading } = useQuery({
    queryKey: ["payroll-payslips", id],
    queryFn: () => getPayslips(id!),
    enabled: !!id,
  });

  const payslips = payslipsData?.data ?? [];

  const approveMutation = useMutation({
    mutationFn: () => approveRun(id!),
    onSuccess: () => {
      showToast.success("Payroll approved — journals posted to accounting");
      qc.invalidateQueries({ queryKey: ["payroll-run", id] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const paidMutation = useMutation({
    mutationFn: () => markRunPaid(id!),
    onSuccess: () => {
      showToast.success("Payroll marked paid — advances settled");
      qc.invalidateQueries({ queryKey: ["payroll-run", id] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  async function handleSendAll() {
    let sent = 0;
    for (const slip of payslips) {
      try {
        setSendingId(slip.payslip_id);
        await sendPayslip(slip.payslip_id, "email");
        sent++;
      } catch {
        /* individual failures don't block others */
      }
    }
    setSendingId(null);
    showToast.success(`${sent} payslip${sent !== 1 ? "s" : ""} sent via email`);
  }

  if (runLoading) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-brand-smoke">Payroll run not found.</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate("/payroll")}
        >
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={run.run_number}
        subtitle={formatPeriod(run.period_month, run.period_year)}
        crumbs={[
          { label: "Payroll", to: "/payroll" },
          { label: run.run_number },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RunStatusBadge status={run.status} />
            {run.status === "draft" && (
              <Button
                size="sm"
                onClick={() => approveMutation.mutate()}
                loading={approveMutation.isPending}
              >
                <CheckCircle className="h-4 w-4" />
                Approve & Post Journals
              </Button>
            )}
            {run.status === "approved" && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSendAll}
                  disabled={!!sendingId}
                >
                  <Send className="h-4 w-4" />
                  {sendingId ? "Sending..." : "Email All Payslips"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => paidMutation.mutate()}
                  loading={paidMutation.isPending}
                >
                  <DollarSign className="h-4 w-4" />
                  Mark Paid
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Summary strip */}
      <PayrollSummaryStrip run={run} currency={currency} mode={mode} />

      {/* Payment method picker (for payment schedule download) */}
      <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />

      {/* Compliance outputs — only in full PAYE mode */}
      {isFull && run.status !== "draft" && (
        <ComplianceOutputsPanel
          runId={run.run_id}
          run={run}
          currency={currency}
        />
      )}

      {/* Payslips table */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
          Payslips — {payslips.length} staff
        </p>

        {slipsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-brand-charcoal">
                  {[
                    "Employee",
                    "Title",
                    "Gross",
                    ...(isFull ? ["PAYE", "Pension"] : []),
                    "Net",
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
                {payslips.map((slip) => (
                  <tr
                    key={slip.payslip_id}
                    className="bg-brand-charcoal hover:bg-brand-graphite/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-brand-cream">
                        {slip.display_name}
                      </p>
                      {slip.employee_number && (
                        <p className="text-xs text-brand-smoke">
                          {slip.employee_number}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-brand-smoke">
                      {slip.job_title ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-brand-cream">
                      {fmtMoney(slip.gross_salary, currency)}
                    </td>
                    {isFull && (
                      <>
                        <td className="px-4 py-3 tabular-nums text-red-400">
                          {fmtMoney(slip.paye_deduction, currency)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-brand-smoke">
                          {fmtMoney(slip.pension_employee, currency)}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 tabular-nums font-semibold text-green-400">
                      {fmtMoney(slip.net_salary, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            navigate(`/payroll/payslips/${slip.payslip_id}`)
                          }
                          title="View payslip"
                          className="text-brand-smoke hover:text-brand-accent transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {run.status !== "draft" && (
                          <button
                            onClick={async () => {
                              setSendingId(slip.payslip_id);
                              try {
                                await sendPayslip(slip.payslip_id, "email");
                                showToast.success("Payslip sent");
                              } catch (err) {
                                showToast.error(errMsg(err));
                              } finally {
                                setSendingId(null);
                              }
                            }}
                            disabled={sendingId === slip.payslip_id}
                            title="Email payslip"
                            className="text-brand-smoke hover:text-brand-accent transition-colors disabled:opacity-40"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
