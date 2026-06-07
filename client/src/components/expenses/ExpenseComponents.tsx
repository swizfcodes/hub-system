/**
 * ExpenseComponents.tsx
 * Exports: ExpenseStatusBadge, AdvanceStatusBadge, ExpenseKpiStrip,
 *          SpendingInsightsChart, RejectModal, AdvanceFormModal,
 *          ApproveAdvanceModal
 */
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  TrendingUp,
  Clock,
  RefreshCcw,
  Banknote,
} from "lucide-react";
import { Badge } from "@components/ui/Badge";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Skeleton } from "@components/ui/Skeleton";
import {
  EXPENSE_STATUS_META,
  ADVANCE_STATUS_META,
  CATEGORY_OPTIONS,
} from "@lib/constants/expensesConstants";
import {
  rejectExpenseSchema,
  type RejectExpenseValues,
  createAdvanceSchema,
  type CreateAdvanceValues,
  approveAdvanceSchema,
  type ApproveAdvanceValues,
} from "@lib/schemas/expenses";
import {
  rejectExpense,
  getExpenseKpis,
  createAdvance,
  approveAdvance,
} from "@services/expenses";
import { fmtMoney } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type {
  ExpenseStatus,
  AdvanceStatus,
  ExpenseKpis,
} from "@typedefs/expenses";

// ── Badges ────────────────────────────────────────────────────────────────────

export function ExpenseStatusBadge({
  status,
  size = "sm",
}: {
  status: ExpenseStatus;
  size?: "xs" | "sm";
}) {
  const meta = EXPENSE_STATUS_META[status];
  return (
    <Badge tone={meta.tone} size={size} dot={meta.dot}>
      {meta.label}
    </Badge>
  );
}

export function AdvanceStatusBadge({
  status,
  size = "sm",
}: {
  status: AdvanceStatus;
  size?: "xs" | "sm";
}) {
  const meta = ADVANCE_STATUS_META[status];
  return (
    <Badge tone={meta.tone} size={size}>
      {meta.label}
    </Badge>
  );
}

// ── ExpenseKpiStrip ───────────────────────────────────────────────────────────

export function ExpenseKpiStrip({ currency = "NGN" }: { currency?: string }) {
  const { data: kpis, isLoading } = useQuery({
    queryKey: ["expense-kpis"],
    queryFn: getExpenseKpis,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Spent This Month",
      value: fmtMoney(kpis?.paid_this_month ?? 0, currency),
      icon: TrendingUp,
      color: "#C9A86C",
    },
    {
      label: "Pending Approval",
      value: `${kpis?.pending_count ?? 0} claims`,
      sub: fmtMoney(kpis?.pending_amount ?? 0, currency),
      icon: Clock,
      color: "#F59E0B",
    },
    {
      label: "Reimbursements Due",
      value: fmtMoney(kpis?.reimbursements_outstanding ?? 0, currency),
      icon: RefreshCcw,
      color: "#4E9AF1",
    },
    {
      label: "Top Category",
      value: kpis?.top_category_this_month
        ? (CATEGORY_OPTIONS.find(
            (c) => c.value === kpis.top_category_this_month,
          )?.label ?? kpis.top_category_this_month)
        : "—",
      icon: Banknote,
      color: "#9E9891",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-2xl border border-white/5 bg-orika-charcoal px-5 py-4"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className="h-3.5 w-3.5" style={{ color: card.color }} />
              <p className="text-[0.65rem] uppercase tracking-widest text-orika-smoke">
                {card.label}
              </p>
            </div>
            <p
              className="font-display text-xl font-light tabular-nums"
              style={{ color: card.color }}
            >
              {card.value}
            </p>
            {card.sub && (
              <p className="text-xs text-orika-smoke mt-0.5 tabular-nums">
                {card.sub}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── SpendingInsightsChart ─────────────────────────────────────────────────────
// Simple horizontal bar chart — no external chart library needed.

export function SpendingInsightsChart({
  kpis,
  currency = "NGN",
}: {
  kpis?: ExpenseKpis | null;
  currency?: string;
}) {
  const categories = kpis?.spend_by_category ?? [];
  if (!categories.length) return null;

  const max = Math.max(...categories.map((c) => c.total), 1);

  return (
    <div className="rounded-2xl border border-white/5 bg-orika-charcoal p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-orika-smoke">
        Spending by Category — This Month
      </p>
      <div className="space-y-3">
        {categories.map((cat) => {
          const label =
            CATEGORY_OPTIONS.find((c) => c.value === cat.category)?.label ??
            cat.category;
          const pct = Math.round((cat.total / max) * 100);
          return (
            <div key={cat.category} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-orika-cloud">{label}</span>
                <span className="tabular-nums text-orika-smoke">
                  {fmtMoney(cat.total, currency)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-orika-graphite overflow-hidden">
                <div
                  className="h-full rounded-full bg-orika-gold transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── RejectModal ───────────────────────────────────────────────────────────────

interface RejectModalProps {
  open: boolean;
  onClose: () => void;
  expenseId: string;
  expenseNum: string;
}

export function RejectModal({
  open,
  onClose,
  expenseId,
  expenseNum,
}: RejectModalProps) {
  const qc = useQueryClient();
  const form = useForm<RejectExpenseValues>({
    resolver: zodResolver(rejectExpenseSchema),
    defaultValues: { rejection_reason: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: RejectExpenseValues) =>
      rejectExpense(expenseId, values),
    onSuccess: () => {
      showToast.success(`${expenseNum} rejected`);
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expense", expenseId] });
      qc.invalidateQueries({ queryKey: ["expense-kpis"] });
      form.reset();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reject Expense"
      size="sm"
      surface="light"
      footer={
        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={form.handleSubmit((v) => mutation.mutate(v))}
            loading={mutation.isPending}
          >
            <AlertTriangle className="h-4 w-4" />
            Reject
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-text-on-light-muted">
          The claimant will be notified with your reason.
        </p>
        <Controller
          name="rejection_reason"
          control={form.control}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              label="Reason *"
              placeholder="e.g. Receipt missing, category incorrect, not a business expense"
              surface="light"
              error={fieldState.error?.message}
            />
          )}
        />
      </div>
    </Modal>
  );
}

// ── AdvanceFormModal ──────────────────────────────────────────────────────────

interface AdvanceFormModalProps {
  open: boolean;
  onClose: () => void;
  currency?: string;
}

export function AdvanceFormModal({
  open,
  onClose,
  currency: _currency = "NGN",
}: AdvanceFormModalProps) {
  const qc = useQueryClient();
  const form = useForm<CreateAdvanceValues>({
    resolver: zodResolver(createAdvanceSchema),
    defaultValues: { purpose: "", amount_requested: 0, reason: "" },
  });

  const mutation = useMutation({
    mutationFn: createAdvance,
    onSuccess: () => {
      showToast.success("Cash advance request submitted");
      qc.invalidateQueries({ queryKey: ["advances"] });
      form.reset();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request Cash Advance"
      size="sm"
      surface="light"
      footer={
        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit((v) => mutation.mutate(v))}
            loading={mutation.isPending}
          >
            Submit Request
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-text-on-light-muted">
          Your manager will review and approve the advance amount. Once
          disbursed, submit expense claims against it.
        </p>
        <Controller
          name="purpose"
          control={form.control}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              label="Purpose *"
              placeholder="e.g. Client site visit — Abuja"
              surface="light"
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          name="amount_requested"
          control={form.control}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              label="Amount Requested (₦) *"
              type="number"
              step="500"
              min={0}
              surface="light"
              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          name="reason"
          control={form.control}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              label="Justification *"
              placeholder="Why is this advance needed?"
              surface="light"
              error={fieldState.error?.message}
            />
          )}
        />
      </div>
    </Modal>
  );
}

// ── ApproveAdvanceModal ───────────────────────────────────────────────────────

interface ApproveAdvanceModalProps {
  open: boolean;
  onClose: () => void;
  advanceId: string;
  requested: number;
  currency?: string;
}

export function ApproveAdvanceModal({
  open,
  onClose,
  advanceId,
  requested,
  currency = "NGN",
}: ApproveAdvanceModalProps) {
  const qc = useQueryClient();
  const form = useForm<ApproveAdvanceValues>({
    resolver: zodResolver(approveAdvanceSchema),
    defaultValues: { amount_approved: requested },
  });

  const mutation = useMutation({
    mutationFn: (values: ApproveAdvanceValues) =>
      approveAdvance(advanceId, values),
    onSuccess: () => {
      showToast.success("Advance approved and disbursed");
      qc.invalidateQueries({ queryKey: ["advances"] });
      form.reset();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Approve Cash Advance"
      size="sm"
      surface="light"
      footer={
        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit((v) => mutation.mutate(v))}
            loading={mutation.isPending}
          >
            Approve & Disburse
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-orika-cloud/20 px-4 py-3 text-sm flex justify-between">
          <span className="text-text-on-light-muted">Requested</span>
          <span className="font-semibold text-orika-black">
            {fmtMoney(requested, currency)}
          </span>
        </div>
        <Controller
          name="amount_approved"
          control={form.control}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              label="Amount to Approve (₦) *"
              type="number"
              step="500"
              min={0}
              surface="light"
              hint={`Max ${fmtMoney(requested, currency)}. You can approve less if needed.`}
              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
              error={fieldState.error?.message}
            />
          )}
        />
      </div>
    </Modal>
  );
}
