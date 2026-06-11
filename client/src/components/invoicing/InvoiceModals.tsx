import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Send, FileX, AlertTriangle } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { Select } from "@components/ui/Select";
import {
  recordPayment,
  sendInvoice,
  writeOffInvoice,
} from "@services/invoicing/invoices";
import { createCreditNote } from "@services/invoicing/creditNotes";
import {
  recordPaymentSchema,
  type RecordPaymentValues,
  sendInvoiceSchema,
  type SendInvoiceValues,
  createCreditNoteSchema,
  type CreateCreditNoteValues,
  writeOffSchema,
  type WriteOffValues,
} from "@lib/schemas/invoicing";
import {
  PAYMENT_METHOD_OPTIONS,
  SEND_CHANNEL_OPTIONS,
} from "@lib/constants/invoicingConstants";
import { fmtMoney } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { Invoice } from "@typedefs/invoicing";
//import { cn } from '@lib/cn';

// ── RecordPaymentModal ─────────────────────────────────────────────────────────

interface RecordPaymentProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  currency?: string;
}

export function RecordPaymentModal({
  open,
  onClose,
  invoice,
  currency = "NGN",
}: RecordPaymentProps) {
  const qc = useQueryClient();

  const form = useForm<RecordPaymentValues>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      amount: invoice.amount_outstanding,
      payment_method: "bank_transfer",
      payment_date: new Date().toISOString().split("T")[0],
      reference: "",
      notes: "",
      is_confirmed: true,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: RecordPaymentValues) =>
      recordPayment(invoice.invoice_id, values),
    onSuccess: () => {
      showToast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["invoice", invoice.invoice_id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice-kpis"] });
      form.reset();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const amount = form.watch("amount");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record Payment"
      size="sm"
      surface="light"
      footer={
        <div className="flex gap-3 justify-end">
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
            <DollarSign className="h-4 w-4" />
            Record
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Outstanding balance */}
        <div className="rounded-xl bg-brand-cloud/20 px-4 py-3 flex justify-between items-center">
          <span className="text-sm text-text-on-light-muted">Outstanding</span>
          <span className="font-display text-xl font-light text-brand-black">
            {fmtMoney(invoice.amount_outstanding, currency)}
          </span>
        </div>

        <Controller
          name="amount"
          control={form.control}
          render={({ field, fieldState }) => (
            <NumberField
              surface="light"
              decimal
              label="Amount Received *"
              placeholder="0.00"
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />

        {(amount ?? 0) > 0 && (amount ?? 0) > invoice.amount_outstanding && (
          <p className="text-xs text-amber-600">
            Amount exceeds outstanding balance — this will fully settle the
            invoice.
          </p>
        )}

        <Controller
          name="payment_method"
          control={form.control}
          render={({ field }) => (
            <Select
              label="Payment Method *"
              options={PAYMENT_METHOD_OPTIONS}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              surface="light"
            />
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="payment_date"
            control={form.control}
            render={({ field }) => (
              <Input
                {...field}
                label="Payment Date"
                type="date"
                surface="light"
              />
            )}
          />
          <Controller
            name="reference"
            control={form.control}
            render={({ field }) => (
              <Input
                {...field}
                label="Reference / Transfer ID"
                placeholder="Optional"
                surface="light"
              />
            )}
          />
        </div>

        <Controller
          name="notes"
          control={form.control}
          render={({ field }) => (
            <Input
              {...field}
              label="Notes"
              placeholder="Optional"
              surface="light"
            />
          )}
        />
      </div>
    </Modal>
  );
}

// ── SendInvoiceModal ───────────────────────────────────────────────────────────

interface SendInvoiceProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
}

export function SendInvoiceModal({ open, onClose, invoice }: SendInvoiceProps) {
  const qc = useQueryClient();

  const form = useForm<SendInvoiceValues>({
    resolver: zodResolver(sendInvoiceSchema),
    defaultValues: { channel: invoice.email ? "email" : "whatsapp" },
  });

  const mutation = useMutation({
    mutationFn: (values: SendInvoiceValues) =>
      sendInvoice(invoice.invoice_id, values),
    onSuccess: () => {
      showToast.success("Invoice sent");
      qc.invalidateQueries({ queryKey: ["invoice", invoice.invoice_id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const channel = form.watch("channel");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send Invoice"
      size="sm"
      surface="light"
      footer={
        <div className="flex gap-3 justify-end">
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
            <Send className="h-4 w-4" />
            Send Now
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-cloud/20 px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-text-on-light-muted">To</span>
            <span className="font-medium text-brand-black">
              {invoice.contact_name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-on-light-muted">Invoice</span>
            <span className="font-medium text-brand-black">
              {invoice.invoice_number}
            </span>
          </div>
        </div>

        <Controller
          name="channel"
          control={form.control}
          render={({ field }) => (
            <Select
              label="Send Via"
              options={SEND_CHANNEL_OPTIONS}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              surface="light"
            />
          )}
        />

        {/* Warn if channel has no address */}
        {channel === "email" && !invoice.email && (
          <p className="text-xs text-state-danger">
            No email address on file for {invoice.contact_name}. Update the
            contact first.
          </p>
        )}
        {channel === "whatsapp" && !invoice.whatsapp_number && (
          <p className="text-xs text-state-danger">
            No WhatsApp number on file for {invoice.contact_name}. Update the
            contact first.
          </p>
        )}

        <p className="text-xs text-text-on-light-muted">
          {channel === "email"
            ? "The invoice PDF will be sent as an email attachment."
            : "A payment summary message will be sent to their WhatsApp number."}
        </p>
      </div>
    </Modal>
  );
}

// ── CreditNoteModal ────────────────────────────────────────────────────────────

interface CreditNoteProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  currency?: string;
}

export function CreditNoteModal({
  open,
  onClose,
  invoice,
  currency = "NGN",
}: CreditNoteProps) {
  const qc = useQueryClient();

  const form = useForm<CreateCreditNoteValues>({
    resolver: zodResolver(createCreditNoteSchema),
    defaultValues: {
      reason: "",
      lines: invoice.lines?.map((l) => ({
        product_id: l.product_id ?? "",
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
      })) ?? [{ product_id: "", description: "", quantity: 1, unit_price: 0 }],
    },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateCreditNoteValues) =>
      createCreditNote(invoice.invoice_id, values),
    onSuccess: (cn) => {
      showToast.success(`Credit note ${cn.credit_note_number} created`);
      qc.invalidateQueries({ queryKey: ["invoice", invoice.invoice_id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      form.reset();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const watchedLines = form.watch("lines");
  const creditTotal = watchedLines.reduce(
    (s, l) => s + l.unit_price * l.quantity,
    0,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Credit Note"
      size="md"
      surface="light"
      description={`Against invoice ${invoice.invoice_number}`}
      footer={
        <div className="flex gap-3 justify-end">
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
            Create Credit Note
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {creditTotal > invoice.total_amount && (
          <div className="rounded-xl border border-state-danger/30 bg-state-danger/5 px-4 py-3 text-xs text-state-danger flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Credit note total ({fmtMoney(creditTotal, currency)}) exceeds
            invoice total ({fmtMoney(invoice.total_amount, currency)}).
          </div>
        )}

        <Controller
          name="reason"
          control={form.control}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              label="Reason *"
              placeholder="e.g. Customer returned item, overpayment, price adjustment"
              surface="light"
              error={fieldState.error?.message}
            />
          )}
        />

        {/* Lines from original invoice — editable qty and price */}
        <div className="space-y-3">
          <p className="text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted">
            Items to Credit
          </p>
          {form.watch("lines").map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-brand-cloud/30 bg-brand-cloud/10 p-3 space-y-2"
            >
              <Controller
                name={`lines.${i}.description`}
                control={form.control}
                render={({ field: f, fieldState }) => (
                  <Input
                    {...f}
                    label="Description"
                    surface="light"
                    error={fieldState.error?.message}
                  />
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <Controller
                  name={`lines.${i}.quantity`}
                  control={form.control}
                  render={({ field: f, fieldState }) => (
                    <NumberField
                      surface="light"
                      label="Qty"
                      placeholder="0"
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
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end text-sm font-semibold text-brand-black">
          Credit Total: {fmtMoney(creditTotal, currency)}
        </div>
      </div>
    </Modal>
  );
}

// ── WriteOffModal ──────────────────────────────────────────────────────────────

interface WriteOffProps {
  open: boolean;
  onClose: () => void;
  invoice: Invoice;
  currency?: string;
}

export function WriteOffModal({
  open,
  onClose,
  invoice,
  currency = "NGN",
}: WriteOffProps) {
  const qc = useQueryClient();

  const form = useForm<WriteOffValues>({
    resolver: zodResolver(writeOffSchema),
    defaultValues: { reason: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: WriteOffValues) =>
      writeOffInvoice(invoice.invoice_id, values),
    onSuccess: () => {
      showToast.success(`Invoice ${invoice.invoice_number} written off`);
      qc.invalidateQueries({ queryKey: ["invoice", invoice.invoice_id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice-kpis"] });
      form.reset();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Write Off Invoice"
      size="sm"
      surface="light"
      footer={
        <div className="flex gap-3 justify-end">
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
            className="bg-state-danger hover:bg-state-danger/90"
          >
            <FileX className="h-4 w-4" />
            Write Off
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-state-danger/30 bg-state-danger/5 px-4 py-3 text-sm text-state-danger">
          <p className="font-semibold">This action cannot be undone.</p>
          <p className="mt-1 text-xs">
            Writing off {invoice.invoice_number} will void the invoice and post
            a bad debt journal entry for{" "}
            <strong>{fmtMoney(invoice.amount_outstanding, currency)}</strong>.
          </p>
        </div>

        <Controller
          name="reason"
          control={form.control}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              label="Reason for Write-off *"
              placeholder="e.g. Customer uncontactable, liquidated, unrecoverable debt"
              surface="light"
              error={fieldState.error?.message}
            />
          )}
        />
      </div>
    </Modal>
  );
}
