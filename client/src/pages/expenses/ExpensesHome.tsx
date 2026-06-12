import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Eye, CheckCircle, XCircle, DollarSign } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Tabs } from "@components/ui/Tabs";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import {
  ExpenseStatusBadge,
  AdvanceStatusBadge,
  ExpenseKpiStrip,
  SpendingInsightsChart,
  RejectModal,
  AdvanceFormModal,
  ApproveAdvanceModal,
} from "@components/expenses/ExpenseComponents";
import { ExpenseFormModal } from "@components/expenses/ExpenseFormModal";
import {
  listExpenses,
  listAdvances,
  approveExpense,
  markExpensePaid,
  getExpenseKpis,
} from "@services/expenses";
import {
  EXPENSE_STATUS_TABS,
  EXPENSE_TYPE_LABEL,
  CATEGORY_OPTIONS,
} from "@lib/constants/expensesConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney, fmtDate } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import type { Expense, CashAdvance } from "@typedefs/expenses";
import { Topbar } from "@/components/shell/Topbar";

const MAIN_TABS = [
  { key: "expenses", label: "Expenses" },
  { key: "pending", label: "Pending Approval" },
  { key: "advances", label: "Cash Advances" },
];

export default function ExpensesHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();

  const [mainTab, setMainTab] = useState("expenses");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Expense | null>(null);
  const [approveAdv, setApproveAdv] = useState<CashAdvance | null>(null);

  // Fetch expenses
  const { data: expenseData, isLoading: expLoading } = useQuery({
    queryKey: ["expenses", statusFilter, mainTab],
    queryFn: () =>
      listExpenses({
        status:
          mainTab === "pending"
            ? "pending"
            : statusFilter === "all"
              ? undefined
              : statusFilter,
        limit: 100,
      }),
    enabled: mainTab !== "advances",
  });

  // Fetch advances
  const { data: advanceData, isLoading: advLoading } = useQuery({
    queryKey: ["advances"],
    queryFn: () => listAdvances(),
    enabled: mainTab === "advances",
  });

  // Fetch KPIs for chart
  const { data: kpis } = useQuery({
    queryKey: ["expense-kpis"],
    queryFn: getExpenseKpis,
    refetchInterval: 60_000,
  });

  const expenses = expenseData?.data ?? [];
  const advances = advanceData?.data ?? [];

  const approveMutation = useMutation({
    mutationFn: approveExpense,
    onSuccess: () => {
      showToast.success("Expense approved");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expense-kpis"] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const paidMutation = useMutation({
    mutationFn: markExpensePaid,
    onSuccess: () => {
      showToast.success("Expense marked as paid — journal posted");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expense-kpis"] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const pendingCount =
    expenseData?.data.filter((e) => e.status === "pending").length ?? 0;

  return (
    <>
      <Topbar title="Expenses" subtitle="Expenses · Approval" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Expenses"
          subtitle="Track every expense and ensure it posts to accounting on approval."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Expenses" }]}
          actions={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowAdvance(true)}>
                Cash Advance
              </Button>
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                New Expense
              </Button>
            </div>
          }
        />

        {/* KPI strip */}
        <ExpenseKpiStrip currency={currency} />

        {/* Spending insights chart */}
        <SpendingInsightsChart kpis={kpis} currency={currency} />

        {/* Main tabs */}
        <Tabs
          tabs={MAIN_TABS.map((t) => ({
            ...t,
            badge:
              t.key === "pending" && pendingCount > 0
                ? pendingCount
                : undefined,
          }))}
          active={mainTab}
          onChange={(key) => {
            setMainTab(key);
            setStatusFilter("all");
          }}
          surface="dark"
          variant="underline"
        />

        {/* Status sub-tabs (expenses tab only) */}
        {mainTab === "expenses" && (
          <div className="flex gap-2 flex-wrap">
            {EXPENSE_STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  statusFilter === tab.key
                    ? "bg-brand-accent text-brand-black"
                    : "bg-brand-graphite text-brand-cloud hover:bg-brand-graphite/70",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Expenses table */}
        {(mainTab === "expenses" || mainTab === "pending") &&
          (expLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-brand-smoke">
                {mainTab === "pending"
                  ? "No expenses awaiting approval."
                  : "No expenses in this filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/5">
              <table className="w-full min-w-[700px] text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-brand-charcoal">
                    {[
                      "#",
                      "Payee",
                      "Category",
                      "Type",
                      "Amount",
                      "Balance",
                      "Date",
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
                  {expenses.map((expense) => (
                    <tr
                      key={expense.expense_id}
                      className="bg-brand-charcoal hover:bg-brand-graphite/20 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            navigate(`/expenses/${expense.expense_id}`)
                          }
                          className="font-mono text-xs text-brand-accent hover:underline"
                        >
                          {expense.expense_number}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-brand-cream font-medium">
                        {expense.staff_name ?? expense.vendor_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-brand-cloud">
                        {CATEGORY_OPTIONS.find(
                          (c) => c.value === expense.category,
                        )?.label ?? expense.category}
                      </td>
                      <td className="px-4 py-3 text-brand-smoke text-xs">
                        {EXPENSE_TYPE_LABEL[expense.expense_type]}
                      </td>
                      <td className="px-4 py-3 tabular-nums font-medium text-brand-cream">
                        {fmtMoney(expense.amount, currency)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 tabular-nums",
                          Number(expense.balance ?? 0) > 0 &&
                            expense.status !== "pending" &&
                            expense.status !== "rejected"
                            ? "text-amber-400 font-medium"
                            : "text-brand-smoke",
                        )}
                      >
                        {expense.status === "rejected"
                          ? "—"
                          : fmtMoney(
                              Number(expense.balance ?? expense.amount),
                              currency,
                            )}
                      </td>
                      <td className="px-4 py-3 text-brand-smoke">
                        {fmtDate(expense.expense_date)}
                      </td>
                      <td className="px-4 py-3">
                        <ExpenseStatusBadge status={expense.status} size="xs" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              navigate(`/expenses/${expense.expense_id}`)
                            }
                            title="View"
                            className="text-brand-smoke hover:text-brand-accent transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {expense.status === "pending" && (
                            <>
                              <button
                                onClick={() =>
                                  approveMutation.mutate(expense.expense_id)
                                }
                                title="Approve"
                                className="text-brand-smoke hover:text-green-400 transition-colors"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setRejectTarget(expense)}
                                title="Reject"
                                className="text-brand-smoke hover:text-red-400 transition-colors"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          {(expense.status === "approved" ||
                            expense.status === "partially_paid") && (
                            <button
                              onClick={() =>
                                paidMutation.mutate(expense.expense_id)
                              }
                              title="Pay Remaining Balance"
                              className="text-brand-smoke hover:text-brand-accent transition-colors"
                            >
                              <DollarSign className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {/* Advances table */}
        {mainTab === "advances" &&
          (advLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/5">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-brand-charcoal">
                    {[
                      "Staff",
                      "Purpose",
                      "Requested",
                      "Approved",
                      "Outstanding",
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
                  {advances.map((adv) => (
                    <tr key={adv.advance_id} className="bg-brand-charcoal">
                      <td className="px-4 py-3 text-brand-cream">
                        {adv.staff_name}
                      </td>
                      <td className="px-4 py-3 text-brand-cloud max-w-[200px] truncate">
                        {adv.purpose}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-brand-smoke">
                        {fmtMoney(adv.amount_requested, currency)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-brand-smoke">
                        {adv.amount_approved
                          ? fmtMoney(adv.amount_approved, currency)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums font-medium text-brand-cream">
                        {fmtMoney(adv.outstanding_balance, currency)}
                      </td>
                      <td className="px-4 py-3">
                        <AdvanceStatusBadge status={adv.status} size="xs" />
                      </td>
                      <td className="px-4 py-3">
                        {adv.status === "pending" && (
                          <button
                            onClick={() => setApproveAdv(adv)}
                            className="text-xs text-brand-accent hover:underline"
                          >
                            Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {advances.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-sm text-brand-smoke"
                      >
                        No cash advances yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}

        {/* Modals */}
        <ExpenseFormModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            navigate(`/expenses/${id}`);
          }}
        />

        <AdvanceFormModal
          open={showAdvance}
          onClose={() => setShowAdvance(false)}
          currency={currency}
        />

        {rejectTarget && (
          <RejectModal
            open={!!rejectTarget}
            onClose={() => setRejectTarget(null)}
            expenseId={rejectTarget.expense_id}
            expenseNum={rejectTarget.expense_number}
          />
        )}

        {approveAdv && (
          <ApproveAdvanceModal
            open={!!approveAdv}
            onClose={() => setApproveAdv(null)}
            advanceId={approveAdv.advance_id}
            requested={approveAdv.amount_requested}
            currency={currency}
          />
        )}
      </div>
    </>
  );
}
