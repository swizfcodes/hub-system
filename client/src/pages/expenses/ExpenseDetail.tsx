import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  XCircle,
  DollarSign,
  FileText,
  Receipt,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { ExpenseStatusBadge } from "@components/expenses/ExpenseComponents";
import { RejectModal } from "@components/expenses/ExpenseComponents";
import {
  getExpense,
  approveExpense,
  markExpensePaid,
} from "@services/expenses";
import {
  CATEGORY_OPTIONS,
  EXPENSE_TYPE_LABEL,
  EXPENSE_TYPE_CR_ACCOUNT,
  CATEGORY_COA,
} from "@lib/constants/expensesConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney, fmtDate, fmtDateTime } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";

export default function ExpenseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();

  const [showReject, setShowReject] = useState(false);

  const { data: expense, isLoading } = useQuery({
    queryKey: ["expense", id],
    queryFn: () => getExpense(id!),
    enabled: !!id,
  });

  const approveMutation = useMutation({
    mutationFn: () => approveExpense(id!),
    onSuccess: () => {
      showToast.success("Expense approved");
      qc.invalidateQueries({ queryKey: ["expense", id] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expense-kpis"] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const paidMutation = useMutation({
    mutationFn: () => markExpensePaid(id!),
    onSuccess: () => {
      showToast.success("Marked paid — journal entry posted to accounting");
      qc.invalidateQueries({ queryKey: ["expense", id] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expense-kpis"] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  if (isLoading) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-orika-smoke">Expense not found.</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate("/expenses")}
        >
          Back
        </Button>
      </div>
    );
  }

  const categoryLabel =
    CATEGORY_OPTIONS.find((c) => c.value === expense.category)?.label ??
    expense.category;
  const expenseCode = CATEGORY_COA[expense.category];
  const creditAccount = EXPENSE_TYPE_CR_ACCOUNT[expense.expense_type];

  return (
    <div className="px-4 sm:px-8 py-6 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title={expense.expense_number}
        subtitle={`${expense.staff_name} · ${fmtDate(expense.expense_date)}`}
        crumbs={[
          { label: "Expenses", to: "/expenses" },
          { label: expense.expense_number },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExpenseStatusBadge status={expense.status} />
            {expense.status === "pending" && (
              <>
                <Button
                  size="sm"
                  onClick={() => approveMutation.mutate()}
                  loading={approveMutation.isPending}
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setShowReject(true)}
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
              </>
            )}
            {expense.status === "approved" && (
              <Button
                size="sm"
                onClick={() => paidMutation.mutate()}
                loading={paidMutation.isPending}
              >
                <DollarSign className="h-4 w-4" />
                Mark Paid
              </Button>
            )}
          </div>
        }
      />

      {/* Rejection reason banner */}
      {expense.status === "rejected" && expense.rejection_reason && (
        <div className="rounded-2xl border border-state-danger/30 bg-state-danger/5 px-5 py-4 text-sm text-state-danger">
          <p className="font-semibold mb-1">Rejected</p>
          <p>{expense.rejection_reason}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Expense details */}
        <div className="rounded-2xl border border-white/5 bg-orika-charcoal p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-orika-smoke mb-4">
            Details
          </p>

          <DetailRow label="Category" value={categoryLabel} />
          <DetailRow
            label="Type"
            value={EXPENSE_TYPE_LABEL[expense.expense_type]}
          />
          <DetailRow
            label="Amount"
            value={fmtMoney(expense.amount, currency)}
            bold
          />
          <DetailRow label="Date" value={fmtDate(expense.expense_date)} />
          <DetailRow label="Description" value={expense.description} />

          {expense.vendor_name && (
            <DetailRow label="Vendor" value={expense.vendor_name} />
          )}

          {expense.approved_at && (
            <DetailRow
              label="Approved"
              value={fmtDateTime(expense.approved_at)}
            />
          )}
          {expense.paid_at && (
            <DetailRow
              label="Paid"
              value={fmtDateTime(expense.paid_at)}
              highlight="success"
            />
          )}
        </div>

        {/* Accounting preview */}
        <div className="rounded-2xl border border-white/5 bg-orika-charcoal p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-orika-smoke mb-4">
            Accounting Entry
          </p>

          <div className="space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between rounded-lg bg-orika-graphite/30 px-3 py-2.5">
              <span className="text-orika-smoke">DR {expenseCode}</span>
              <span className="text-orika-cream">
                {fmtMoney(expense.amount, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-orika-graphite/30 px-3 py-2.5">
              <span className="text-orika-smoke">CR {creditAccount}</span>
              <span className="text-orika-cream">
                {fmtMoney(expense.amount, currency)}
              </span>
            </div>
          </div>

          <p className="text-xs text-orika-smoke/60">
            {expense.status === "paid"
              ? "Journal entry posted to accounting."
              : expense.status === "approved"
                ? "Journal will post when marked paid."
                : "Journal will post on approval + payment."}
          </p>

          {/* Reimbursement note */}
          {expense.expense_type === "reimbursement" &&
            expense.status !== "paid" && (
              <div className="rounded-lg border border-orika-gold/20 bg-orika-gold/5 px-3 py-2 text-xs text-orika-gold/80">
                Reimbursement — staff is owed{" "}
                {fmtMoney(expense.amount, currency)}. Mark paid once the
                transfer is made.
              </div>
            )}
        </div>
      </div>

      {/* Receipts */}
      <div className="rounded-2xl border border-white/5 bg-orika-charcoal p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-orika-smoke">
            Receipts
          </p>
          <Button variant="ghost" size="sm" className="text-orika-smoke">
            <Receipt className="h-4 w-4" />
            Upload Receipt
          </Button>
        </div>

        {expense.receipts && expense.receipts.length > 0 ? (
          <div className="space-y-2">
            {expense.receipts.map((r) => (
              <div
                key={r.receipt_id}
                className="flex items-center gap-3 rounded-lg border border-white/5 bg-orika-graphite/30 px-4 py-3"
              >
                <FileText className="h-4 w-4 text-orika-smoke" />
                <span className="text-sm text-orika-cloud">
                  Receipt attached
                </span>
                <span className="ml-auto text-xs text-orika-smoke">
                  {fmtDate(r.uploaded_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-orika-smoke">
            No receipt attached.
            {expense.amount > 10_000 && (
              <span className="ml-1 text-amber-400 font-medium">
                Required for this amount.
              </span>
            )}
          </p>
        )}
      </div>

      {/* Reject modal */}
      <RejectModal
        open={showReject}
        onClose={() => setShowReject(false)}
        expenseId={expense.expense_id}
        expenseNum={expense.expense_number}
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  bold = false,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: "success";
}) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-orika-smoke shrink-0">{label}</span>
      <span
        className={cn(
          "text-right",
          bold ? "font-semibold text-orika-cream" : "text-orika-cloud",
          highlight === "success" && "text-green-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}
