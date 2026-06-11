import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  XCircle,
  DollarSign,
  FileText,
  Receipt,
  Download,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import {
  ExpenseStatusBadge,
  RejectModal,
  RecordPaymentModal,
} from "@components/expenses/ExpenseComponents";
import {
  getExpense,
  approveExpense,
  uploadExpenseReceipt,
} from "@services/expenses";
import { api } from "@services/api";
import {
  CATEGORY_OPTIONS,
  EXPENSE_TYPE_LABEL,
  PAYMENT_METHOD_OPTIONS,
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
  const [showPayment, setShowPayment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const receiptMutation = useMutation({
    mutationFn: (file: File) => uploadExpenseReceipt(id!, file),
    onSuccess: () => {
      showToast.success("Receipt attached");
      qc.invalidateQueries({ queryKey: ["expense", id] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  function handleReceiptFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) receiptMutation.mutate(file);
    e.target.value = "";
  }

  async function downloadReceipt(documentId: string, fileName?: string) {
    try {
      const res = await api.get(`/documents/${documentId}/download`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "receipt";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast.error(errMsg(err));
    }
  }

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
        <p className="text-brand-smoke">Expense not found.</p>
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
  const amountPaid = Number(expense.amount_paid ?? 0);
  const balance = Number(expense.balance ?? expense.amount) - 0;
  const isPayable =
    expense.status === "approved" || expense.status === "partially_paid";
  const payments = expense.payments ?? [];

  return (
    <div className="px-4 sm:px-8 py-6 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title={expense.expense_number}
        subtitle={`${expense.staff_name ?? expense.vendor_name ?? "—"} · ${fmtDate(expense.expense_date)}`}
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
            {isPayable && (
              <Button size="sm" onClick={() => setShowPayment(true)}>
                <DollarSign className="h-4 w-4" />
                Record Payment
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

      {/* Payment progress */}
      <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
          <div>
            <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
              Total
            </p>
            <p className="font-display text-2xl font-light text-brand-cream tabular-nums">
              {fmtMoney(expense.amount, currency)}
            </p>
          </div>
          <div>
            <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
              Paid
            </p>
            <p className="font-display text-2xl font-light text-green-400 tabular-nums">
              {fmtMoney(amountPaid, currency)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
              Balance
            </p>
            <p
              className={cn(
                "font-display text-2xl font-light tabular-nums",
                balance > 0 ? "text-amber-400" : "text-green-400",
              )}
            >
              {fmtMoney(balance, currency)}
            </p>
          </div>
        </div>
        <div className="h-2 rounded-full bg-brand-graphite overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-accent transition-all duration-500"
            style={{
              width: `${Math.min(
                Math.round((amountPaid / Number(expense.amount || 1)) * 100),
                100,
              )}%`,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Expense details */}
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-4">
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
              label="Fully Paid"
              value={fmtDateTime(expense.paid_at)}
              highlight="success"
            />
          )}
        </div>

        {/* Accounting preview */}
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-4">
            Accounting Entry
          </p>

          <div className="space-y-2 font-mono text-xs">
            <div className="flex items-center justify-between rounded-lg bg-brand-graphite/30 px-3 py-2.5">
              <span className="text-brand-smoke">DR {expenseCode}</span>
              <span className="text-brand-cream">
                {fmtMoney(expense.amount, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-brand-graphite/30 px-3 py-2.5">
              <span className="text-brand-smoke">CR Cash / Bank</span>
              <span className="text-brand-cream">
                {fmtMoney(expense.amount, currency)}
              </span>
            </div>
          </div>

          <p className="text-xs text-brand-smoke/60">
            {expense.status === "paid"
              ? "Journal entries posted for every payment."
              : expense.status === "partially_paid"
                ? "Journals post per payment — balance still outstanding."
                : expense.status === "approved"
                  ? "Journal posts as payments are recorded."
                  : "Journal will post once approved and paid."}
          </p>

          {expense.expense_type === "reimbursement" &&
            isPayable &&
            balance > 0 && (
              <div className="rounded-lg border border-brand-accent/20 bg-brand-accent/5 px-3 py-2 text-xs text-brand-accent/80">
                Reimbursement — staff is owed {fmtMoney(balance, currency)}.
                Record the payment once the transfer is made.
              </div>
            )}
        </div>
      </div>

      {/* Payments history */}
      <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
            Payments
          </p>
          {isPayable && (
            <Button
              variant="ghost"
              size="sm"
              className="text-brand-smoke"
              onClick={() => setShowPayment(true)}
            >
              <DollarSign className="h-4 w-4" />
              Record Payment
            </Button>
          )}
        </div>

        {payments.length > 0 ? (
          <div className="space-y-2">
            {payments.map((p) => (
              <div
                key={p.payment_id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-brand-graphite/30 px-4 py-3"
              >
                <DollarSign className="h-4 w-4 text-green-400 shrink-0" />
                <span className="text-sm font-medium text-brand-cream tabular-nums">
                  {fmtMoney(p.amount, currency)}
                </span>
                <span className="text-xs text-brand-smoke">
                  {PAYMENT_METHOD_OPTIONS.find((m) => m.value === p.method)
                    ?.label ?? p.method}
                </span>
                {p.reference && (
                  <span className="text-xs text-brand-smoke font-mono">
                    {p.reference}
                  </span>
                )}
                <span className="ml-auto text-xs text-brand-smoke">
                  {fmtDate(p.payment_date)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-brand-smoke">
            No payments recorded yet.
            {isPayable && " Use “Record Payment” to log full or part payments."}
          </p>
        )}
      </div>

      {/* Receipts */}
      <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
            Receipts & Invoices
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={handleReceiptFile}
          />
          <Button
            variant="ghost"
            size="sm"
            className="text-brand-smoke"
            loading={receiptMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Receipt className="h-4 w-4" />
            Upload Receipt
          </Button>
        </div>

        {expense.receipts && expense.receipts.length > 0 ? (
          <div className="space-y-2">
            {expense.receipts.map((r) => (
              <div
                key={r.receipt_id}
                className="flex items-center gap-3 rounded-lg border border-white/5 bg-brand-graphite/30 px-4 py-3"
              >
                <FileText className="h-4 w-4 text-brand-smoke shrink-0" />
                <span className="text-sm text-brand-cloud truncate">
                  {r.file_name ?? "Receipt attached"}
                </span>
                {r.merchant_name && (
                  <span className="text-xs text-brand-smoke">
                    {r.merchant_name}
                  </span>
                )}
                <span className="ml-auto text-xs text-brand-smoke shrink-0">
                  {r.uploaded_at ? fmtDate(r.uploaded_at) : ""}
                </span>
                <button
                  onClick={() => downloadReceipt(r.document_id, r.file_name)}
                  title="Download"
                  className="text-brand-smoke hover:text-brand-accent transition-colors shrink-0"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-brand-smoke">
            No receipt attached.
            {Number(expense.amount) > 10_000 && (
              <span className="ml-1 text-amber-400 font-medium">
                Required for this amount.
              </span>
            )}
          </p>
        )}
      </div>

      {/* Modals */}
      <RejectModal
        open={showReject}
        onClose={() => setShowReject(false)}
        expenseId={expense.expense_id}
        expenseNum={expense.expense_number}
      />
      <RecordPaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        expenseId={expense.expense_id}
        expenseNum={expense.expense_number}
        balance={balance}
        currency={currency}
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
      <span className="text-brand-smoke shrink-0">{label}</span>
      <span
        className={cn(
          "text-right",
          bold ? "font-semibold text-brand-cream" : "text-brand-cloud",
          highlight === "success" && "text-green-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}
