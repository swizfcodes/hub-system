import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { Select } from "@components/ui/Select";
import { ContactSearchInput } from "@components/shared/ContactSearchInput";
import { createExpense } from "@services/expenses";
import {
  createExpenseSchema,
  type CreateExpenseValues,
} from "@lib/schemas/expenses";
import {
  CATEGORY_OPTIONS,
  EXPENSE_TYPE_OPTIONS,
  EXPENSE_TYPE_CR_ACCOUNT,
  CATEGORY_COA,
  AUTO_APPROVE_THRESHOLD_NGN,
} from "@lib/constants/expensesConstants";
import { fmtMoney } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import type { Contact } from "@typedefs/contacts";
import { useState } from "react";
import { cn } from "@lib/cn";

interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (expenseId: string, autoApproved: boolean) => void;
  /** Pre-fill from an advance */
  linkedAdvanceId?: string;
}

export function ExpenseFormModal({
  open,
  onClose,
  onCreated,
  linkedAdvanceId: _linkedAdvanceId,
}: ExpenseFormModalProps) {
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();
  const [vendorContact, setVendorContact] = useState<Contact | null>(null);

  const form = useForm<CreateExpenseValues>({
    resolver: zodResolver(createExpenseSchema),
    defaultValues: {
      category: undefined,
      expense_type: "reimbursement",
      amount: 0,
      description: "",
      expense_date: new Date().toISOString().split("T")[0],
      vendor_name: "",
      vendor_contact_id: "",
      currency: currency,
    },
  });

  const watchedAmount = form.watch("amount");
  const watchedType = form.watch("expense_type");
  const watchedCat = form.watch("category");
  const isAutoApprove =
    watchedAmount > 0 && watchedAmount <= AUTO_APPROVE_THRESHOLD_NGN;

  const mutation = useMutation({
    mutationFn: createExpense,
    onSuccess: (expense) => {
      showToast.success(
        expense.auto_approved
          ? `${expense.expense_number} submitted and auto-approved`
          : `${expense.expense_number} submitted — awaiting approval`,
      );
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["expense-kpis"] });
      form.reset();
      setVendorContact(null);
      onCreated(expense.expense_id, !!expense.auto_approved);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  function handleVendorContactChange(contact: Contact | null) {
    setVendorContact(contact);
    form.setValue("vendor_contact_id", contact?.contact_id ?? "");
    if (contact && !form.getValues("vendor_name")) {
      form.setValue("vendor_name", contact.display_name);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Expense Claim"
      size="lg"
      surface="light"
      footer={
        <div className="flex items-center justify-between gap-3">
          {/* Accounting preview */}
          {watchedCat && watchedType && watchedAmount > 0 && (
            <p className="text-xs text-text-on-light-muted font-mono">
              DR {CATEGORY_COA[watchedCat]} / CR{" "}
              {EXPENSE_TYPE_CR_ACCOUNT[watchedType]}
            </p>
          )}
          <div className="flex gap-3 ml-auto">
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
              Submit Claim
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Auto-approve hint */}
        {isAutoApprove && (
          <div className="flex items-start gap-2 rounded-xl border border-green-500/30 bg-green-900/10 px-4 py-3">
            <Info className="h-4 w-4 shrink-0 text-green-400 mt-0.5" />
            <p className="text-xs text-green-400">
              Amounts up to {fmtMoney(AUTO_APPROVE_THRESHOLD_NGN, currency)} are
              auto-approved. This claim will be approved immediately on
              submission.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Controller
            name="category"
            control={form.control}
            render={({ field, fieldState }) => (
              <Select
                label="Category *"
                options={CATEGORY_OPTIONS}
                placeholder="Select category..."
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value)}
                surface="light"
                error={fieldState.error?.message}
              />
            )}
          />

          <Controller
            name="expense_type"
            control={form.control}
            render={({ field }) => (
              <Select
                label="Payment Method *"
                options={EXPENSE_TYPE_OPTIONS}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                surface="light"
              />
            )}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Controller
            name="amount"
            control={form.control}
            render={({ field, fieldState }) => (
              <NumberField
                decimal
                label="Amount (₦) *"
                placeholder="0.00"
                surface="light"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />

          <Controller
            name="expense_date"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input
                {...field}
                label="Date *"
                type="date"
                surface="light"
                error={fieldState.error?.message}
              />
            )}
          />
        </div>

        <Controller
          name="description"
          control={form.control}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              label="Description *"
              placeholder="What was this expense for?"
              surface="light"
              error={fieldState.error?.message}
            />
          )}
        />

        {/* Vendor — CRM linked or free text */}
        <div className="space-y-3">
          <p className="text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted">
            Vendor (optional)
          </p>
          <ContactSearchInput
            value={vendorContact}
            onChange={handleVendorContactChange}
            label="Vendor Contact (CRM)"
          />
          <Controller
            name="vendor_name"
            control={form.control}
            render={({ field }) => (
              <Input
                {...field}
                label="Or free-text vendor name"
                placeholder="e.g. Total Energies, Mr Biggs, DHL"
                surface="light"
              />
            )}
          />
        </div>

        {/* Receipt upload hint */}
        <div
          className={cn(
            "rounded-xl border px-4 py-3 text-xs",
            watchedAmount > 10_000
              ? "border-amber-500/30 bg-amber-900/10 text-amber-300"
              : "border-brand-cloud/30 text-text-on-light-muted",
          )}
        >
          {watchedAmount > 10_000 ? (
            <span className="font-medium">
              Receipt required for amounts above {fmtMoney(10_000, currency)}.
            </span>
          ) : (
            <span>Attaching a receipt is optional but recommended.</span>
          )}{" "}
          Upload the receipt after submitting via the expense detail page.
        </div>
      </div>
    </Modal>
  );
}
