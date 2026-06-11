import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Send } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import {
  EarningsRow,
  DeductionRow,
} from "@components/payroll/PayrollComponents";
import { getPayslip, openPayslipPdf, sendPayslip } from "@services/payroll";
import { formatPeriod } from "@lib/constants/payrollConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { PayrollMode } from "@typedefs/payroll";

export default function PayslipDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currency } = useActiveBusiness();
  const mode =
    (localStorage.getItem("payrollMode") as PayrollMode) || "full_paye";
  const isFull = mode === "full_paye";

  const [sending, setSending] = useState(false);

  const { data: payslip, isLoading } = useQuery({
    queryKey: ["payslip", id],
    queryFn: () => getPayslip(id!),
    enabled: !!id,
  });

  async function handleSend() {
    setSending(true);
    try {
      await sendPayslip(id!, "email");
      showToast.success("Payslip emailed successfully");
    } catch (err) {
      showToast.error(errMsg(err));
    } finally {
      setSending(false);
    }
  }

  if (isLoading) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (!payslip) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-brand-smoke">Payslip not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>
    );
  }

  const period = formatPeriod(
    payslip.period_month ?? 0,
    payslip.period_year ?? 0,
  );

  return (
    <div className="px-4 sm:px-8 py-6 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title={payslip.display_name}
        subtitle={`${payslip.employee_number ?? ""} · ${payslip.job_title ?? ""} · ${period}`}
        crumbs={[
          { label: "Payroll", to: "/payroll" },
          {
            label: payslip.run_number ?? "Run",
            to: `/payroll/runs/${payslip.run_id}`,
          },
          { label: "Payslip" },
        ]}
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openPayslipPdf(id!)}
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            {payslip.email && (
              <Button size="sm" onClick={handleSend} loading={sending}>
                <Send className="h-4 w-4" />
                Email Payslip
              </Button>
            )}
          </div>
        }
      />

      {/* Payslip card */}
      <div className="rounded-2xl border border-white/5 bg-brand-charcoal overflow-hidden">
        {/* Header */}
        <div className="bg-brand-graphite/40 px-6 py-4 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-xl font-light text-brand-cream">
                {payslip.display_name}
              </p>
              <p className="text-sm text-brand-smoke">{payslip.job_title}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-widest text-brand-smoke">
                Period
              </p>
              <p className="font-semibold text-brand-cream">{period}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Earnings */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-3">
              Earnings
            </p>
            <div className="space-y-2">
              <EarningsRow
                label="Basic Salary"
                value={payslip.basic_salary}
                currency={currency}
              />
              {isFull && (
                <>
                  <EarningsRow
                    label="Housing Allowance"
                    value={payslip.housing_allowance}
                    currency={currency}
                    muted
                  />
                  <EarningsRow
                    label="Transport Allowance"
                    value={payslip.transport_allowance}
                    currency={currency}
                    muted
                  />
                </>
              )}
              {payslip.commission_amount > 0 && (
                <EarningsRow
                  label="Commission"
                  value={payslip.commission_amount}
                  currency={currency}
                />
              )}
              <div className="border-t border-white/10 pt-2">
                <EarningsRow
                  label="Gross Salary"
                  value={payslip.gross_salary}
                  currency={currency}
                  bold
                />
              </div>
            </div>
          </div>

          {/* Deductions — only in full PAYE mode */}
          {isFull && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-3">
                Deductions
              </p>
              <div className="space-y-2">
                <DeductionRow
                  label="PAYE Tax"
                  value={payslip.paye_deduction}
                  currency={currency}
                  highlight
                />
                <DeductionRow
                  label="Pension (Employee 8%)"
                  value={payslip.pension_employee}
                  currency={currency}
                />
                <DeductionRow
                  label="NHF (2.5% of Basic)"
                  value={payslip.nhf_deduction}
                  currency={currency}
                />
                {payslip.advance_recovery > 0 && (
                  <DeductionRow
                    label="Advance Recovery"
                    value={payslip.advance_recovery}
                    currency={currency}
                  />
                )}
                {payslip.other_deductions > 0 && (
                  <DeductionRow
                    label={`Absence (${payslip.days_absent}d)`}
                    value={payslip.other_deductions}
                    currency={currency}
                  />
                )}
                <div className="border-t border-white/10 pt-2">
                  <DeductionRow
                    label="Total Deductions"
                    value={payslip.total_deductions}
                    currency={currency}
                    highlight
                  />
                </div>
              </div>
            </div>
          )}

          {/* Employer contributions (shown separately — not deducted from staff) */}
          {isFull && payslip.pension_employer > 0 && (
            <div className="rounded-xl border border-white/5 bg-brand-graphite/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-2">
                Employer Contributions (not deducted from you)
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-brand-smoke">Pension (Employer 10%)</span>
                <span className="tabular-nums text-brand-cloud">
                  {fmtMoney(payslip.pension_employer, currency)}
                </span>
              </div>
            </div>
          )}

          {/* Net pay — the most prominent figure */}
          <div className="rounded-2xl border border-green-500/30 bg-green-900/10 px-6 py-5 text-center">
            <p className="text-xs uppercase tracking-widest text-green-400 mb-1">
              Net Pay
            </p>
            <p className="font-display text-4xl font-light text-green-300">
              {fmtMoney(payslip.net_salary, currency)}
            </p>
          </div>

          {/* Bank details */}
          {(payslip.bank_name || payslip.bank_account_number) && (
            <div className="text-sm space-y-1 border-t border-white/10 pt-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-2">
                Payment To
              </p>
              {payslip.bank_name && (
                <div className="flex justify-between">
                  <span className="text-brand-smoke">Bank</span>
                  <span className="text-brand-cloud">{payslip.bank_name}</span>
                </div>
              )}
              {payslip.bank_account_number && (
                <div className="flex justify-between">
                  <span className="text-brand-smoke">Account</span>
                  <span className="font-mono text-brand-cloud">
                    {payslip.bank_account_number}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
