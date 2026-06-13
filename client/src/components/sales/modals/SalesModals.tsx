// ── SendQuoteModal ─────────────────────────────────────────────────────────────
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, MessageCircle } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { sendQuotation } from "@services/sales/quotations";
import {
  sendQuotationSchema,
  type SendQuotationValues,
} from "@lib/schemas/sales";
import { cn } from "@lib/cn";

interface SendQuoteModalProps {
  open: boolean;
  onClose: () => void;
  quotationId: string;
  quotationNumber: string;
  hasEmail: boolean;
  hasWhatsApp: boolean;
}

export function SendQuoteModal({
  open,
  onClose,
  quotationId,
  quotationNumber,
  hasEmail,
  hasWhatsApp,
}: SendQuoteModalProps) {
  const qc = useQueryClient();

  const form = useForm<SendQuotationValues>({
    resolver: zodResolver(sendQuotationSchema),
    defaultValues: { channel: hasEmail ? "email" : "whatsapp" },
  });

  const mutation = useMutation({
    mutationFn: (values: SendQuotationValues) =>
      sendQuotation(quotationId, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotation", quotationId] });
      qc.invalidateQueries({ queryKey: ["quotations"] });
      showToast.success(`Quotation ${quotationNumber} sent`);
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const channels = [
    { value: "email", label: "Email", icon: Mail, disabled: !hasEmail },
    {
      value: "whatsapp",
      label: "WhatsApp",
      icon: MessageCircle,
      disabled: !hasWhatsApp,
    },
  ] as const;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Send ${quotationNumber}`}
      size="md"
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
            Send Quote
          </Button>
        </div>
      }
    >
      <p className="mb-5 text-sm text-brand-smoke/80">
        Choose how to deliver this quotation to the customer.
      </p>

      <Controller
        name="channel"
        control={form.control}
        render={({ field }) => (
          <div className="grid grid-cols-2 gap-3">
            {channels.map(({ value, label, icon: Icon, disabled }) => (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => field.onChange(value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border px-4 py-5 transition-all",
                  disabled && "cursor-not-allowed opacity-40",
                  field.value === value && !disabled
                    ? "border-brand-accent/60 bg-brand-accent/5 text-brand-accent"
                    : "border-black/10 text-brand-smoke hover:border-black/20",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{label}</span>
                {disabled && (
                  <span className="text-[10px] text-brand-smoke">
                    Not on file
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      />

      <p className="mt-4 text-xs text-brand-smoke/60">
        A branded PDF will be attached. The quote will be marked as "Sent" upon
        delivery.
      </p>
    </Modal>
  );
}

// ── ConfirmQuoteModal ──────────────────────────────────────────────────────────

import {
  useForm as useFormConfirm,
  Controller as ControllerConfirm,
} from "react-hook-form";
import { zodResolver as zodResolverConfirm } from "@hookform/resolvers/zod";
import { AlertTriangle, Truck, ShoppingBag } from "lucide-react";
import { confirmQuotation } from "@services/sales/quotations";
import {
  confirmQuotationSchema,
  type ConfirmQuotationValues,
} from "@lib/schemas/sales";
import { Input } from "@components/ui/Input";
import { Textarea } from "@components/ui/Textarea";

interface ConfirmQuoteModalProps {
  open: boolean;
  onClose: () => void;
  quotationId: string;
  quotationNumber: string;
  stockWarning?: string | null;
  onConfirmed: (orderId: string) => void;
}

export function ConfirmQuoteModal({
  open,
  onClose,
  quotationId,
  quotationNumber,
  stockWarning,
  onConfirmed,
}: ConfirmQuoteModalProps) {
  const qc = useQueryClient();

  const form = useFormConfirm<ConfirmQuotationValues>({
    resolver: zodResolverConfirm(confirmQuotationSchema),
    defaultValues: {
      fulfilment_type: "walk_in",
      delivery_address: "",
      delivery_notes: "",
    },
  });

  const fulfilmentType = form.watch("fulfilment_type");

  const mutation = useMutation({
    mutationFn: (values: ConfirmQuotationValues) =>
      confirmQuotation(quotationId, values),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ["quotation", quotationId] });
      qc.invalidateQueries({ queryKey: ["quotations"] });
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      showToast.success(`Order ${order.order_number} created`);
      onConfirmed(order.order_id);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const fulfilmentOptions = [
    {
      value: "walk_in",
      label: "Walk-In",
      icon: ShoppingBag,
      desc: "Customer collects in store",
    },
    {
      value: "delivery",
      label: "Delivery",
      icon: Truck,
      desc: "Item will be dispatched",
    },
  ] as const;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Confirm ${quotationNumber}`}
      size="md"
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
            Confirm & Create Order
          </Button>
        </div>
      }
    >
      {stockWarning && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-300">{stockWarning}</p>
        </div>
      )}

      <p className="mb-5 text-sm text-brand-smoke/80">
        How will the customer receive the items?
      </p>

      <ControllerConfirm
        name="fulfilment_type"
        control={form.control}
        render={({ field }) => (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {fulfilmentOptions.map(({ value, label, icon: Icon, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => field.onChange(value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border px-4 py-4 text-center transition-all",
                  field.value === value
                    ? "border-brand-accent/60 bg-brand-accent/5 text-brand-accent"
                    : "border-black/10 text-brand-smoke hover:border-black/20",
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{label}</span>
                <span className="text-[10px]">{desc}</span>
              </button>
            ))}
          </div>
        )}
      />

      {fulfilmentType === "delivery" && (
        <div className="space-y-3 border-t border-black/10 pt-4">
          <ControllerConfirm
            name="delivery_address"
            control={form.control}
            render={({ field, fieldState }) => (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                  Delivery Address *
                </label>
                <Textarea
                  {...field}
                  rows={2}
                  placeholder="Full delivery address"
                  error={fieldState.error?.message}
                />
              </div>
            )}
          />
          <ControllerConfirm
            name="delivery_notes"
            control={form.control}
            render={({ field }) => (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                  Delivery Notes
                </label>
                <Input
                  {...field}
                  placeholder="Landmark, access instructions, etc."
                />
              </div>
            )}
          />
        </div>
      )}
    </Modal>
  );
}

// ── RecordPaymentModal ─────────────────────────────────────────────────────────

import {
  useForm as useFormPay,
  Controller as ControllerPay,
} from "react-hook-form";
import { zodResolver as zodResolverPay } from "@hookform/resolvers/zod";
import { recordPayment } from "@services/sales/invoices";
import {
  recordPaymentSchema,
  type RecordPaymentValues,
} from "@lib/schemas/sales";
import { PAYMENT_METHOD_META } from "@lib/constants/salesConstants";
import { fmtMoney } from "@lib/format";
import type { PaymentMethod } from "@typedefs/sales";
import { Select } from "@components/ui/Select";
import { NumberField } from "@components/ui/NumberField";

interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  invoiceNumber: string;
  amountOutstanding: number;
  currency?: string;
  onRecorded: () => void;
}

export function RecordPaymentModal({
  open,
  onClose,
  invoiceId,
  invoiceNumber,
  amountOutstanding,
  currency = "NGN",
  onRecorded,
}: RecordPaymentModalProps) {
  const qc = useQueryClient();

  const form = useFormPay<RecordPaymentValues>({
    resolver: zodResolverPay(recordPaymentSchema),
    defaultValues: {
      amount: amountOutstanding,
      payment_method: "bank_transfer",
      payment_date: "",
      reference: "",
      paystack_reference: "",
      notes: "",
    },
  });

  const paymentMethod = form.watch("payment_method") as PaymentMethod;

  const mutation = useMutation({
    mutationFn: (values: RecordPaymentValues) =>
      recordPayment(invoiceId, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({
        queryKey: ["receipts", { invoice_id: invoiceId }],
      });
      qc.invalidateQueries({ queryKey: ["sales-kpis"] });
      showToast.success("Payment recorded and receipt generated");
      onRecorded();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Record Payment — ${invoiceNumber}`}
      size="md"
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
            Record Payment
          </Button>
        </div>
      }
    >
      <p className="mb-5 text-sm text-brand-smoke/80">
        Outstanding:{" "}
        <span className="font-semibold text-brand-accent">
          {fmtMoney(amountOutstanding, currency)}
        </span>
      </p>

      <div className="space-y-4">
        <ControllerPay
          name="amount"
          control={form.control}
          render={({ field, fieldState }) => (
            <NumberField
              surface="light"
              decimal
              label="Amount *"
              placeholder="0.00"
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />

        <ControllerPay
          name="payment_method"
          control={form.control}
          render={({ field }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Payment Method *
              </label>
              <Select
                {...field}
                options={(
                  Object.keys(PAYMENT_METHOD_META) as PaymentMethod[]
                ).map((m) => ({
                  value: m,
                  label: PAYMENT_METHOD_META[m].label,
                }))}
              />
            </div>
          )}
        />

        <ControllerPay
          name="payment_date"
          control={form.control}
          render={({ field }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Payment Date
              </label>
              <Input {...field} type="date" placeholder="Defaults to today" />
            </div>
          )}
        />

        <ControllerPay
          name="reference"
          control={form.control}
          render={({ field }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Reference{" "}
                {paymentMethod === "bank_transfer"
                  ? "(bank ref / teller number)"
                  : ""}
                {paymentMethod === "pos_card"
                  ? "(terminal receipt number)"
                  : ""}
              </label>
              <Input {...field} placeholder="Optional reference" />
            </div>
          )}
        />

        {paymentMethod === "paystack" && (
          <ControllerPay
            name="paystack_reference"
            control={form.control}
            render={({ field }) => (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                  Paystack Reference
                </label>
                <Input {...field} placeholder="PSK_xxx..." />
              </div>
            )}
          />
        )}

        <ControllerPay
          name="notes"
          control={form.control}
          render={({ field }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Notes
              </label>
              <Input {...field} placeholder="Optional payment notes" />
            </div>
          )}
        />
      </div>

      <p className="mt-4 text-xs text-brand-smoke/60">
        A receipt will be generated automatically and linked to this payment.
      </p>
    </Modal>
  );
}

// ── HandToLogisticsModal ──────────────────────────────────────────────────────

import {
  useForm as useFormLogistics,
  Controller as ControllerLogistics,
} from "react-hook-form";
import { zodResolver as zodResolverLogistics } from "@hookform/resolvers/zod";
import { handToLogistics } from "@services/sales/orders";
import {
  handToLogisticsSchema,
  type HandToLogisticsValues,
} from "@lib/schemas/sales";
import { Textarea as TextareaLog } from "@components/ui/Textarea";

interface HandToLogisticsModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  contactPhone?: string;
  deliveryAddress?: string;
  onDispatched: () => void;
}

export function HandToLogisticsModal({
  open,
  onClose,
  orderId,
  orderNumber,
  contactPhone = "",
  deliveryAddress = "",
  onDispatched,
}: HandToLogisticsModalProps) {
  const qc = useQueryClient();

  const form = useFormLogistics<HandToLogisticsValues>({
    resolver: zodResolverLogistics(handToLogisticsSchema),
    defaultValues: {
      delivery_address: deliveryAddress,
      delivery_notes: "",
      // Sales never picks the 3PL — the delivery lands in Logistics as
      // pending (manual) and they assign the courier on dispatch.
      courier_preference: "manual",
      contact_phone: contactPhone,
      delivery_fee: 0,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: HandToLogisticsValues) =>
      handToLogistics(orderId, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      showToast.success(`Order ${orderNumber} handed to Logistics`);
      onDispatched();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Hand to Logistics"
      size="md"
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
            onClick={form.handleSubmit((v) => mutation.mutate(v as HandToLogisticsValues))}
            loading={mutation.isPending}
          >
            Confirm Dispatch
          </Button>
        </div>
      }
    >
      <p className="mb-5 text-sm text-brand-smoke/80">
        This will create a Logistics record for order{" "}
        <span className="font-medium text-brand-accent">{orderNumber}</span> and
        mark it <span className="font-medium">Awaiting Dispatch</span>.
      </p>

      <div className="space-y-4">
        <div className="rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2.5">
          <p className="text-[11px] text-brand-smoke">
            Logistics assigns the courier (3PL) when they dispatch — this order
            lands in their queue as pending.
          </p>
        </div>

        <ControllerLogistics
          name="contact_phone"
          control={form.control}
          render={({ field, fieldState }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Contact Phone *
              </label>
              <Input
                {...field}
                placeholder="+234..."
                error={fieldState.error?.message}
              />
            </div>
          )}
        />

        <ControllerLogistics
          name="delivery_address"
          control={form.control}
          render={({ field, fieldState }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Delivery Address *
              </label>
              <TextareaLog
                {...field}
                rows={3}
                placeholder="Full address including area and city"
                error={fieldState.error?.message}
              />
            </div>
          )}
        />

        <ControllerLogistics
          name="delivery_fee"
          control={form.control}
          render={({ field, fieldState }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Delivery Fee
              </label>
              <Input
                {...field}
                type="number"
                min="0"
                step="100"
                placeholder="0"
                onChange={(e) => field.onChange(Number(e.target.value))}
                error={fieldState.error?.message}
              />
              <p className="mt-1 text-[10px] text-brand-smoke/60">
                Enter the delivery cost charged to the client (₦). Leave 0 if unknown.
              </p>
            </div>
          )}
        />

        <ControllerLogistics
          name="delivery_notes"
          control={form.control}
          render={({ field }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Delivery Notes
              </label>
              <Input
                {...field}
                placeholder="Landmark, gate code, preferred time, etc."
              />
            </div>
          )}
        />
      </div>
    </Modal>
  );
}

// ── DiscountApprovalModal ──────────────────────────────────────────────────────

import { api, errMsg as errMsgApproval } from "@services/api";
import type { DiscountApproval } from "@typedefs/sales";
import { fmtMoney as fmtMoneyApproval } from "@lib/format";
import { CheckCircle, XCircle } from "lucide-react";

interface DiscountApprovalModalProps {
  open: boolean;
  onClose: () => void;
  approval: DiscountApproval;
  currency?: string;
  onReviewed: () => void;
}

export function DiscountApprovalModal({
  open,
  onClose,
  approval,
  currency = "NGN",
  onReviewed,
}: DiscountApprovalModalProps) {
  const qc = useQueryClient();
  const form = useForm<{ notes: string }>({ defaultValues: { notes: "" } });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(
        `/sales/discount-approvals/${approval.approval_id}/approve`,
        { notes: form.getValues("notes") },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discount-approvals"] });
      showToast.success("Discount approved");
      onReviewed();
      onClose();
    },
    onError: (err) => showToast.error(errMsgApproval(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const notes = form.getValues("notes");
      if (!notes.trim()) throw new Error("Please add a reason for rejection");
      const { data } = await api.post(
        `/sales/discount-approvals/${approval.approval_id}/reject`,
        { notes },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discount-approvals"] });
      showToast.info("Discount rejected");
      onReviewed();
      onClose();
    },
    onError: (err) => showToast.error(errMsgApproval(err)),
  });

  const isPending = approveMutation.isPending || rejectMutation.isPending;
  const discount = approval.min_price - approval.requested_price;
  const pct =
    approval.min_price > 0
      ? ((discount / approval.min_price) * 100).toFixed(1)
      : "0";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Discount Approval Required"
      size="md"
      surface="light"
      footer={
        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={() => rejectMutation.mutate()}
            loading={rejectMutation.isPending}
            disabled={isPending}
            className="text-red-500 hover:text-red-600"
          >
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
          <Button
            onClick={() => approveMutation.mutate()}
            loading={approveMutation.isPending}
            disabled={isPending}
          >
            <CheckCircle className="h-4 w-4" />
            Approve
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-sm text-amber-300">
            A discount of{" "}
            <span className="font-semibold">
              {fmtMoneyApproval(discount, currency)} ({pct}%)
            </span>{" "}
            was requested — below the configured margin floor.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-brand-smoke">Requested Price</dt>
            <dd className="font-semibold text-brand-cream">
              {fmtMoneyApproval(approval.requested_price, currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-brand-smoke">Floor Price</dt>
            <dd className="font-semibold text-brand-cream">
              {fmtMoneyApproval(approval.min_price, currency)}
            </dd>
          </div>
        </dl>

        <Controller
          name="notes"
          control={form.control}
          render={({ field }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Notes{" "}
                {rejectMutation.isPending
                  ? "(required for rejection)"
                  : "(optional)"}
              </label>
              <Input {...field} placeholder="Reason for decision..." />
            </div>
          )}
        />
      </div>
    </Modal>
  );
}
