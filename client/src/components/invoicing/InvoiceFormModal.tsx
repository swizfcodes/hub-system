/**
 * InvoiceFormModal — New Invoice wizard
 *
 * FIX: All step sub-components are defined at MODULE LEVEL. Original code
 * defined StepCustomer / StepLines / StepReview inside InvoiceFormModal,
 * causing React to remount them on every parent re-render (e.g. typing
 * in the product search). That reset all inputs and closed dropdowns.
 *
 * FIX: ProductAddRow manages its own isolated query state per usage instance.
 * Selecting a product appends a new line — it does NOT overwrite an existing
 * line's field, which was the previous behaviour.
 */
import { useState } from "react";
import {
  useForm,
  useFieldArray,
  Controller,
  type UseFormReturn,
  type FieldArrayWithId,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { Select } from "@components/ui/Select";
import { ContactSearchInput } from "@components/shared/ContactSearchInput";
import { createInvoice } from "@services/invoicing/invoices";
import {
  createInvoiceSchema,
  type CreateInvoiceValues,
} from "@lib/schemas/invoicing";
import { INVOICE_TYPE_OPTIONS } from "@lib/constants/invoicingConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { CatalogueSearchInput } from "@components/shared/CatalogueSearchInput";
import type { Contact } from "@typedefs/contacts";
import { cn } from "@lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

const DEFAULT_LINE = {
  product_id: "",
  description: "",
  quantity: undefined,
  unit_price: undefined,
  discount_amount: undefined,
} as unknown as CreateInvoiceValues["lines"][number];

const STEPS = [
  { key: "customer", label: "Customer" },
  { key: "lines", label: "Items" },
  { key: "review", label: "Review" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (invoiceId: string) => void;
  prefill?: {
    contact_id: string;
    contact_name: string;
    order_id?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE-LEVEL STEP COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// ProductAddRow removed — replaced by shared CatalogueSearchInput (surface="light")

// ── Step: Customer ────────────────────────────────────────────────────────────

interface StepCustomerProps {
  form: UseFormReturn<CreateInvoiceValues>;
  contact: Contact | null;
  setContact: (c: Contact | null) => void;
}

function StepCustomer({ form, contact, setContact }: StepCustomerProps) {
  return (
    <div className="space-y-5">
      <ContactSearchInput
        value={contact}
        onChange={(c) => {
          setContact(c);
          form.setValue("contact_id", c?.contact_id ?? "");
        }}
        label="Customer"
        required
      />
      {form.formState.errors.contact_id && (
        <p className="text-xs text-state-danger">
          {form.formState.errors.contact_id.message}
        </p>
      )}
      <Controller
        name="invoice_type"
        control={form.control}
        render={({ field }) => (
          <Select
            label="Invoice Type"
            options={INVOICE_TYPE_OPTIONS}
            value={field.value}
            onChange={(e) => field.onChange(e.target.value)}
            surface="light"
          />
        )}
      />
      <Controller
        name="due_date"
        control={form.control}
        render={({ field, fieldState }) => (
          <Input
            {...field}
            label="Due Date"
            type="date"
            surface="light"
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        name="payment_instructions"
        control={form.control}
        render={({ field }) => (
          <Input
            {...field}
            label="Payment Instructions / Link (optional)"
            placeholder="Bank account details or Paystack link"
            surface="light"
          />
        )}
      />
      <Controller
        name="notes"
        control={form.control}
        render={({ field }) => (
          <Input
            {...field}
            label="Notes (optional)"
            placeholder="Any additional notes for the customer"
            surface="light"
          />
        )}
      />
    </div>
  );
}

// ── Step: Lines ───────────────────────────────────────────────────────────────

interface StepLinesProps {
  form: UseFormReturn<CreateInvoiceValues>;
  fields: FieldArrayWithId<CreateInvoiceValues, "lines">[];
  append: (v: typeof DEFAULT_LINE) => void;
  remove: (i: number) => void;
  watchedLines: CreateInvoiceValues["lines"];
  currency: string;
}

function StepLines({
  form,
  fields,
  append,
  remove,
  watchedLines,
  currency,
}: StepLinesProps) {
  return (
    <div className="space-y-4">
      {/* Product search — appends a new line when a product is selected */}
      <CatalogueSearchInput
        surface="light"
        currency={currency}
        label="Add from Catalogue"
        onSelect={(p) =>
          append({
            product_id: p.product_id,
            description: p.name,
            quantity: 1,
            unit_price: parseFloat(String(p.selling_price)) || 0,
            discount_amount: 0,
          })
        }
      />

      {/* Line items */}
      <div className="space-y-3">
        {fields.map((field, i) => (
          <div
            key={field.id}
            className="rounded-xl border border-brand-cloud/30 bg-brand-cloud/10 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-on-light-muted">
                Line {i + 1}
              </span>
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-text-on-light-muted hover:text-state-danger transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <Controller
              name={`lines.${i}.description`}
              control={form.control}
              render={({ field: f, fieldState }) => (
                <Input
                  {...f}
                  label="Description"
                  placeholder="Product or service"
                  surface="light"
                  error={fieldState.error?.message}
                />
              )}
            />
            <div className="grid grid-cols-3 gap-3">
              <Controller
                name={`lines.${i}.quantity`}
                control={form.control}
                render={({ field: f, fieldState }) => (
                  <NumberField
                    surface="light"
                    label="Qty"
                    placeholder="1"
                    value={f.value}
                    onValueChange={f.onChange}
                    onBlur={f.onBlur}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                name={`lines.${i}.unit_price`}
                control={form.control}
                render={({ field: f, fieldState }) => (
                  <NumberField
                    surface="light"
                    decimal
                    label="Unit Price"
                    placeholder="0.00"
                    value={f.value}
                    onValueChange={f.onChange}
                    onBlur={f.onBlur}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                name={`lines.${i}.discount_amount`}
                control={form.control}
                render={({ field: f }) => (
                  <NumberField
                    surface="light"
                    decimal
                    label="Discount"
                    placeholder="0.00"
                    value={f.value}
                    onValueChange={f.onChange}
                    onBlur={f.onBlur}
                  />
                )}
              />
            </div>
            <p className="text-right text-xs text-text-on-light-muted">
              Line total:{" "}
              <span className="font-semibold text-brand-black">
                {fmtMoney(
                  (watchedLines[i]?.unit_price ?? 0) *
                    (watchedLines[i]?.quantity ?? 1) -
                    (watchedLines[i]?.discount_amount ?? 0),
                  currency,
                )}
              </span>
            </p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => append(DEFAULT_LINE)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-cloud/50 py-3 text-sm text-text-on-light-muted hover:border-brand-black hover:text-brand-black transition-colors"
      >
        <Plus className="h-4 w-4" /> Add Line
      </button>
    </div>
  );
}

// ── Step: Review ──────────────────────────────────────────────────────────────

interface StepReviewProps {
  form: UseFormReturn<CreateInvoiceValues>;
  contact: Contact | null;
  watchedLines: CreateInvoiceValues["lines"];
  lineSubtotal: number;
  vatTotal: number;
  discTotal: number;
  grandTotal: number;
  vatRateNum: number;
  currency: string;
}

function StepReview({
  form,
  contact,
  watchedLines,
  lineSubtotal,
  vatTotal,
  discTotal,
  grandTotal,
  vatRateNum,
  currency,
}: StepReviewProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-brand-cloud/30 bg-brand-cloud/10 p-4 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-text-on-light-muted">Customer</span>
          <span className="font-medium text-brand-black">
            {contact?.display_name ?? "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-on-light-muted">Type</span>
          <span className="font-medium text-brand-black capitalize">
            {form.watch("invoice_type").replace("_", " ")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-on-light-muted">Due</span>
          <span className="font-medium text-brand-black">
            {form.watch("due_date")}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        {watchedLines.map((l, i) => (
          <div key={i} className="flex justify-between text-sm py-1">
            <span className="text-text-on-light-muted truncate max-w-[60%]">
              {l.description || `Line ${i + 1}`} x {l.quantity ?? 0}
            </span>
            <span className="tabular-nums text-brand-black">
              {fmtMoney(
                (l.unit_price ?? 0) * (l.quantity ?? 0) -
                  (l.discount_amount ?? 0),
                currency,
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="space-y-1 border-t border-brand-cloud/30 pt-3 text-sm">
        <ReviewRow label="Subtotal" value={lineSubtotal} currency={currency} />
        {discTotal > 0 && (
          <ReviewRow
            label="Order Discount"
            value={-discTotal}
            currency={currency}
            muted
          />
        )}
        <ReviewRow
          label={`VAT (${(vatRateNum * 100).toFixed(1)}%)`}
          value={vatTotal}
          currency={currency}
          muted
        />
        <div className="border-t border-brand-cloud/30 pt-2">
          <ReviewRow
            label="Total"
            value={grandTotal}
            currency={currency}
            bold
          />
        </div>
      </div>

      <Controller
        name="discount_total"
        control={form.control}
        render={({ field }) => (
          <NumberField
            surface="light"
            decimal
            label="Order Discount (optional)"
            placeholder="0.00"
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
    </div>
  );
}

function ReviewRow({
  label,
  value,
  currency,
  muted = false,
  bold = false,
}: {
  label: string;
  value: number;
  currency: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={muted ? "text-text-on-light-muted" : "text-brand-black"}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          bold
            ? "font-semibold text-brand-black"
            : muted
              ? "text-text-on-light-muted"
              : "text-brand-black",
        )}
      >
        {fmtMoney(value, currency)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function InvoiceFormModal({ open, onClose, onCreated, prefill }: Props) {
  const qc = useQueryClient();
  const { currency, vatRate } = useActiveBusiness();

  const [step, setStep] = useState<StepKey>("customer");
  const [contact, setContact] = useState<Contact | null>(null);

  const form = useForm<CreateInvoiceValues>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      contact_id: prefill?.contact_id ?? "",
      invoice_type: "standard",
      due_date: "",
      discount_total: undefined,
      currency: currency,
      notes: "",
      payment_instructions: "",
      lines: [DEFAULT_LINE],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  const watchedLines = form.watch("lines");
  const vatRateNum = vatRate ?? 0.075;
  const lineSubtotal = watchedLines.reduce(
    (sum, l) =>
      sum + (l.unit_price ?? 0) * (l.quantity ?? 0) - (l.discount_amount ?? 0),
    0,
  );
  const vatTotal = lineSubtotal * vatRateNum;
  const discTotal = form.watch("discount_total") ?? 0;
  const grandTotal = lineSubtotal + vatTotal - discTotal;

  const mutation = useMutation({
    mutationFn: createInvoice,
    onSuccess: (inv) => {
      showToast.success(`Invoice ${inv.invoice_number} created`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice-kpis"] });
      onCreated(inv.invoice_id);
      form.reset();
      setStep("customer");
      setContact(null);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  async function handleNext() {
    if (step === "customer") {
      const ok = await form.trigger(["contact_id", "invoice_type", "due_date"]);
      if (ok) setStep("lines");
    } else if (step === "lines") {
      const ok = await form.trigger("lines");
      if (ok) setStep("review");
    }
  }

  function handleBack() {
    if (step === "lines") setStep("customer");
    if (step === "review") setStep("lines");
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const isLastStep = step === "review";

  const stepLinesProps: StepLinesProps = {
    form,
    fields,
    append,
    remove,
    watchedLines,
    currency: currency ?? "NGN",
  };

  const stepReviewProps: StepReviewProps = {
    form,
    contact,
    watchedLines,
    lineSubtotal,
    vatTotal,
    discTotal,
    grandTotal,
    vatRateNum,
    currency: currency ?? "NGN",
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Invoice"
      size="lg"
      surface="light"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s.key}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i <= stepIndex
                    ? "w-8 bg-brand-black"
                    : "w-4 bg-brand-cloud/50",
                )}
              />
            ))}
          </div>
          <div className="flex gap-3">
            {stepIndex > 0 && (
              <Button variant="ghost" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            )}
            {!isLastStep ? (
              <Button onClick={handleNext}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={form.handleSubmit((v) => mutation.mutate(v))}
                loading={mutation.isPending}
              >
                Create Invoice
              </Button>
            )}
          </div>
        </div>
      }
    >
      {step === "customer" && (
        <StepCustomer form={form} contact={contact} setContact={setContact} />
      )}
      {step === "lines" && <StepLines {...stepLinesProps} />}
      {step === "review" && <StepReview {...stepReviewProps} />}
    </Modal>
  );
}
