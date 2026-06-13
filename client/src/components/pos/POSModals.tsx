/**
 * POSModals.tsx — all POS overlay components in one file.
 *
 * Components:
 *   ReceiptModal       — post-payment options (WhatsApp / email / invoice)
 *   SessionCloseModal  — cash count + session close
 *   ParkedDrawer       — parked transaction management
 *   DiscountGate       — manager credential gate for below-minimum pricing
 *   ReturnModal        — post-session return with manager approval
 *   XZReportView       — X/Z report display (inline, not a modal)
 *
 * IMPORTANT: ReturnModal uses DiscountGate directly (same file — no import
 * needed). Do NOT add `import { DiscountGate } from './POSModals'` — that
 * is a circular self-import and will break at runtime.
 */
import { useState, useEffect } from "react";
import {
  MessageCircle,
  Mail,
  FileText,
  RotateCcw,
  Clock,
  Play,
  Trash2,
  Shield,
  CheckCircle2,
  CreditCard,
  Building2,
  Copy,
} from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { Textarea } from "@components/ui/Textarea";
import { Select } from "@components/ui/Select";
import { usePOSStore } from "@stores/posStore";
import {
  sendReceipt,
  generateInvoiceFromTransaction,
  confirmTransactionPayment,
  verifyManager,
  createReturn,
} from "@services/pos/transactions";
import type { PosInvoiceResult } from "@services/pos/transactions";
import { closeSession } from "@services/pos/sessions";
import {
  closeSessionSchema,
  managerVerifySchema,
  returnSchema,
  type CloseSessionValues,
  type ManagerVerifyValues,
  type ReturnValues,
} from "@lib/schemas/pos";
import { VARIANCE_STATUS_META } from "@lib/constants/posConstants";
import { fmtMoney, fmtDateTime } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type {
  PosTransaction,
  XReport,
  ZReport,
  ParkedTransaction,
  ForeignTenderLine,
} from "@typedefs/pos";

// ── ReceiptModal ───────────────────────────────────────────────────────────────
// 3-state flow:
//   'default'  → post-payment options (WhatsApp / Email / Generate Invoice)
//   'invoice'  → bank transfer details + Confirm Payment Received button
//   'confirmed'→ payment confirmed, receipt emailed, ready for new sale

type ReceiptView = "default" | "invoice" | "confirmed";

interface ReceiptModalProps {
  open: boolean;
  transaction: PosTransaction;
  currency?: string;
  onNewSale: () => void;
  onClose: () => void;
  onInvoice?: (invoiceId: string) => void;
}

export function ReceiptModal({
  open,
  transaction,
  currency = "NGN",
  onNewSale,
  onClose,
  onInvoice,
}: ReceiptModalProps) {
  const [view, setView] = useState<ReceiptView>("default");
  const [sending, setSending] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [invoiceData, setInvoiceData] = useState<PosInvoiceResult | null>(null);
  const [reference, setReference] = useState("");
  const [confirmResult, setConfirmResult] = useState<{
    receipt_sent: boolean;
    receipt_error: string | null;
    invoice_number: string;
  } | null>(null);

  // Reset to default view whenever a new transaction comes through
  useEffect(() => {
    setView("default");
    setInvoiceData(null);
    setReference("");
    setConfirmResult(null);
  }, [transaction.transaction_id]);

  // Reset view state when modal closes / reopens
  function handleNewSale() {
    setView("default");
    setInvoiceData(null);
    setReference("");
    setConfirmResult(null);
    onNewSale();
  }

  async function handleSend(channel: "whatsapp" | "email") {
    setSending(true);
    try {
      await sendReceipt(transaction.transaction_id, { channel });
      showToast.success(
        channel === "whatsapp"
          ? "Receipt sent via WhatsApp"
          : "Receipt sent via email",
      );
    } catch (err) {
      showToast.error(errMsg(err));
    } finally {
      setSending(false);
    }
  }

  async function handleInvoice() {
    setInvoicing(true);
    try {
      const result = await generateInvoiceFromTransaction(
        transaction.transaction_id,
      );
      setInvoiceData(result);
      setView("invoice");
      onInvoice?.(result.invoice_id);
    } catch (err) {
      showToast.error(errMsg(err));
    } finally {
      setInvoicing(false);
    }
  }

  async function handleConfirmPayment() {
    setConfirming(true);
    try {
      const result = await confirmTransactionPayment(
        transaction.transaction_id,
        { reference: reference.trim() || undefined },
      );
      setConfirmResult(result);
      setView("confirmed");
    } catch (err) {
      showToast.error(errMsg(err));
    } finally {
      setConfirming(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      showToast.success(`${label} copied`);
    });
  }

  const hasPhone = !!transaction.primary_phone;
  const hasEmail = !!transaction.contact_id;

  // ── View: default ─────────────────────────────────────────────────────────────
  const defaultBody = (
    <div className="space-y-5">
      {/* Summary */}
      <div className="rounded-xl border border-green-500/30 bg-green-900/10 px-4 py-4 text-center">
        <p className="text-xs text-green-300 uppercase tracking-widest">Paid</p>
        <p className="font-display text-2xl font-extrabold text-green-300">
          {fmtMoney(transaction.total_amount, currency)}
        </p>
        <p className="mt-1 text-xs text-green-400/70">
          {transaction.transaction_number}
        </p>
        {parseFloat(String(transaction.change_given)) > 0 && (
          <p className="mt-2 text-sm font-medium text-green-300">
            Change: {fmtMoney(transaction.change_given, currency)}
          </p>
        )}
      </div>

      {/* Receipt delivery */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-widest text-brand-smoke">
          Send Receipt
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => handleSend("whatsapp")}
            disabled={!hasPhone || sending}
            loading={sending}
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSend("email")}
            disabled={!hasEmail || sending}
            loading={sending}
          >
            <Mail className="h-4 w-4" />
            Email
          </Button>
        </div>
        {!hasPhone && !hasEmail && (
          <p className="text-xs text-brand-smoke/60">
            No contact method on file — link a customer to send digital
            receipts.
          </p>
        )}
      </div>

      {/* Invoice option */}
      <Button
        variant="ghost"
        className="w-full justify-start text-brand-smoke"
        onClick={handleInvoice}
        loading={invoicing}
      >
        <FileText className="h-4 w-4" />
        Generate Invoice (Bank Transfer)
      </Button>
    </div>
  );

  // ── View: invoice ─────────────────────────────────────────────────────────────
  const invoiceBody = invoiceData && (
    <div className="space-y-5">
      {/* Invoice reference */}
      <div className="rounded-xl border border-brand-accent/20 bg-brand-accent/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-brand-smoke uppercase tracking-widest">
              Invoice
            </p>
            <p className="text-base font-semibold text-brand-cream">
              {invoiceData.invoice_number}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-brand-smoke">Amount Due</p>
            <p className="text-lg font-extrabold text-brand-accent">
              {fmtMoney(invoiceData.total_amount, currency)}
            </p>
          </div>
        </div>
      </div>

      {/* Bank account details */}
      {invoiceData.bank_account ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-brand-smoke flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Transfer To
          </p>
          <div className="rounded-xl border border-white/5 bg-brand-charcoal divide-y divide-white/5">
            <BankDetailRow
              label="Bank"
              value={invoiceData.bank_account.bank_name}
            />
            <BankDetailRow
              label="Account Name"
              value={invoiceData.bank_account.account_name}
            />
            <BankDetailRow
              label="Account Number"
              value={invoiceData.bank_account.account_number}
              onCopy={() =>
                copyToClipboard(
                  invoiceData.bank_account!.account_number,
                  "Account number",
                )
              }
            />
            {invoiceData.bank_account.sort_code && (
              <BankDetailRow
                label="Sort Code"
                value={invoiceData.bank_account.sort_code}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-500/20 bg-amber-900/10 px-4 py-3 text-xs text-amber-300">
          No bank account configured — add one in Settings → Bank Accounts.
        </div>
      )}

      {/* Reference input */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
          Transfer Reference <span className="text-brand-smoke/50">(optional)</span>
        </label>
        <Input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. ORI-20240607-001"
        />
        <p className="mt-1 text-xs text-brand-smoke/50">
          Enter the reference from the bank alert once payment arrives.
        </p>
      </div>
    </div>
  );

  // ── View: confirmed ───────────────────────────────────────────────────────────
  const confirmedBody = confirmResult && (
    <div className="space-y-5">
      <div className="rounded-xl border border-green-500/30 bg-green-900/10 px-4 py-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-400" />
        <p className="text-sm font-semibold text-green-300">
          Payment Confirmed
        </p>
        <p className="mt-1 text-xs text-green-400/70">
          Invoice {confirmResult.invoice_number} marked as paid
        </p>
      </div>

      {confirmResult.receipt_sent ? (
        <div className="rounded-lg border border-white/5 bg-brand-charcoal px-4 py-3 flex items-center gap-3">
          <Mail className="h-4 w-4 text-brand-smoke shrink-0" />
          <p className="text-sm text-brand-smoke">
            Receipt emailed to customer
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-500/20 bg-amber-900/10 px-4 py-3 text-xs text-amber-300">
          {confirmResult.receipt_error
            ? `Receipt not sent: ${confirmResult.receipt_error}`
            : "No email on file — receipt was not sent automatically."}
        </div>
      )}
    </div>
  );

  // ── Modal titles ──────────────────────────────────────────────────────────────
  const titleMap: Record<ReceiptView, string> = {
    default: "Transaction Complete",
    invoice: "Bank Transfer Invoice",
    confirmed: "Payment Confirmed",
  };

  // ── Footer ────────────────────────────────────────────────────────────────────
  const footer = (
    <div className="flex gap-3">
      {view === "invoice" && (
        <Button
          variant="ghost"
          className="text-brand-smoke"
          onClick={() => setView("default")}
          disabled={confirming}
        >
          Back
        </Button>
      )}
      {view === "invoice" && (
        <Button
          className="flex-1"
          onClick={handleConfirmPayment}
          loading={confirming}
          disabled={!invoiceData?.bank_account}
        >
          <CreditCard className="h-4 w-4" />
          Confirm Payment Received
        </Button>
      )}
      {(view === "default" || view === "confirmed") && (
        <Button className="flex-1" onClick={handleNewSale}>
          <RotateCcw className="h-4 w-4" />
          New Sale
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titleMap[view]}
      size="sm"
      surface="light"
      footer={footer}
    >
      {view === "default" && defaultBody}
      {view === "invoice" && invoiceBody}
      {view === "confirmed" && confirmedBody}
    </Modal>
  );
}

// Small helper for bank detail rows
function BankDetailRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 gap-3">
      <span className="text-xs text-brand-smoke shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-brand-cream font-medium truncate">
          {value}
        </span>
        {onCopy && (
          <button
            onClick={onCopy}
            className="shrink-0 text-brand-smoke/50 hover:text-brand-accent transition-colors"
            title="Copy"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── SessionCloseModal ──────────────────────────────────────────────────────────

interface SessionCloseModalProps {
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  currency?: string;
}

export function SessionCloseModal({
  open,
  onClose,
  onClosed,
  currency = "NGN",
}: SessionCloseModalProps) {
  const { session, pendingCount } = usePOSStore((s) => ({
    session: s.session,
    pendingCount: s.pendingCount,
  }));

  const form = useForm<CloseSessionValues>({
    resolver: zodResolver(closeSessionSchema),
    defaultValues: { actual_cash: undefined, reconciliation_notes: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: CloseSessionValues) =>
      closeSession(session!.session_id, values),
    onSuccess: () => {
      showToast.success("Session closed");
      form.reset();
      onClosed();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Close Session"
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
            disabled={pendingCount > 0}
          >
            Close Session
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {pendingCount > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-900/10 px-4 py-3 text-sm text-amber-300">
            {pendingCount} transaction{pendingCount > 1 ? "s are" : " is"} still
            syncing. Wait for sync to complete before closing the session.
          </div>
        )}

        <div className="rounded-lg bg-brand-graphite/30 px-4 py-3 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-brand-smoke">Opening Float</span>
            <span className="text-brand-cream tabular-nums">
              {fmtMoney(session?.opening_float ?? 0, currency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-smoke">Revenue This Session</span>
            <span className="text-brand-cream tabular-nums">
              {fmtMoney(session?.total_revenue ?? 0, currency)}
            </span>
          </div>
        </div>

        <Controller
          name="actual_cash"
          control={form.control}
          render={({ field, fieldState }) => (
            <NumberField
              label="Cash in Till *"
              decimal
              surface="light"
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              error={fieldState.error?.message}
              placeholder="Count the physical cash"
            />
          )}
        />

        <Controller
          name="reconciliation_notes"
          control={form.control}
          render={({ field }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Notes (optional)
              </label>
              <Textarea
                {...field}
                rows={2}
                placeholder="Any discrepancies or notes..."
              />
            </div>
          )}
        />
      </div>
    </Modal>
  );
}

// ── ParkedDrawer ───────────────────────────────────────────────────────────────

interface ParkedDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function ParkedDrawer({ open, onClose }: ParkedDrawerProps) {
  const { parked, resumeParked, discardParked } = usePOSStore((s) => ({
    parked: s.parked,
    resumeParked: s.resumeParked,
    discardParked: s.discardParked,
  }));

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 w-72 border-l border-white/5 bg-brand-black shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-brand-cream">
            Parked ({parked.length})
          </h2>
          <button
            onClick={onClose}
            className="text-brand-smoke hover:text-brand-cream transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-white/5">
          {parked.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-brand-smoke">
              No parked transactions
            </p>
          ) : (
            parked.map((p: ParkedTransaction) => (
              <div key={p.park_id} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-brand-smoke shrink-0" />
                  <span className="text-xs text-brand-cloud truncate">
                    {p.label ?? fmtDateTime(p.parked_at)}
                  </span>
                </div>
                {p.customer && (
                  <p className="text-xs text-brand-smoke truncate">
                    {p.customer.display_name}
                  </p>
                )}
                <p className="text-xs text-brand-smoke">
                  {p.lines.length} item{p.lines.length !== 1 ? "s" : ""}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      resumeParked(p.park_id);
                      onClose();
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-accent/10 py-1.5 text-xs font-medium text-brand-accent hover:bg-brand-accent/20 transition-colors"
                  >
                    <Play className="h-3 w-3" />
                    Resume
                  </button>
                  <button
                    onClick={() => discardParked(p.park_id)}
                    className="rounded-md px-2 py-1.5 text-brand-smoke hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ── DiscountGate ───────────────────────────────────────────────────────────────

interface DiscountGateProps {
  open: boolean;
  onClose: () => void;
  onApproved: (managerId: string, displayName: string) => void;
}

export function DiscountGate({ open, onClose, onApproved }: DiscountGateProps) {
  const form = useForm<ManagerVerifyValues>({
    resolver: zodResolver(managerVerifySchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: ManagerVerifyValues) {
    try {
      const result = await verifyManager(data.email, data.password);
      if (result.approved) {
        showToast.success(`Approved by ${result.display_name}`);
        onApproved(result.manager_id, result.display_name);
        form.reset();
      }
    } catch {
      form.setError("password", {
        message: "Invalid credentials or not a manager",
      });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manager Approval Required"
      size="sm"
      surface="light"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit(onSubmit)}
            loading={form.formState.isSubmitting}
          >
            <Shield className="h-4 w-4" />
            Approve
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-brand-smoke/80">
          One or more items are priced below the minimum selling price. A
          manager must approve to continue.
        </p>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Manager Email
              </label>
              <Input
                {...field}
                type="email"
                error={fieldState.error?.message}
              />
            </div>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Password
              </label>
              <Input
                {...field}
                type="password"
                error={fieldState.error?.message}
              />
            </div>
          )}
        />
      </div>
    </Modal>
  );
}

// ── ReturnModal ────────────────────────────────────────────────────────────────
// Uses DiscountGate directly (same file) — no self-import needed.

interface ReturnModalProps {
  open: boolean;
  onClose: () => void;
  transaction: PosTransaction;
  currency?: string;
  onReturned: () => void;
}

export function ReturnModal({
  open,
  onClose,
  transaction,
  currency = "NGN",
  onReturned,
}: ReturnModalProps) {
  const [showGate, setShowGate] = useState(false);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [managerName, setManagerName] = useState<string>("");
  const [qtys, setQtys] = useState<Record<string, number>>({});

  const form = useForm<ReturnValues>({
    resolver: zodResolver(returnSchema),
    defaultValues: {
      lines: [],
      refund_method: "cash",
      return_reason: "",
      manager_id: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: ReturnValues) =>
      createReturn(transaction.transaction_id, values),
    onSuccess: (result) => {
      showToast.success(
        `Return processed — refund ${fmtMoney(result.refund_total, currency)} via ${result.refund_method}`,
      );
      onReturned();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  function handleApproved(mId: string, mName: string) {
    setManagerId(mId);
    setManagerName(mName);
    form.setValue("manager_id", mId);
    setShowGate(false);
  }

  function onSubmit(data: ReturnValues) {
    const lines = (transaction.lines ?? [])
      .filter((l) => l.product_id && (qtys[l.product_id] ?? 0) > 0)
      .map((l) => ({
        product_id: l.product_id!,
        quantity: qtys[l.product_id!],
      }));

    if (!lines.length) {
      showToast.error("Select at least one item to return");
      return;
    }
    if (!managerId) {
      showToast.error("Manager approval is required");
      return;
    }
    mutation.mutate({ ...data, lines, manager_id: managerId });
  }

  const productLines = (transaction.lines ?? []).filter((l) => l.product_id);

  return (
    <>
      <Modal
        open={open && !showGate}
        onClose={onClose}
        title={`Return — ${transaction.transaction_number}`}
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
            {!managerId ? (
              <Button onClick={() => setShowGate(true)}>
                <Shield className="h-4 w-4" />
                Get Manager Approval
              </Button>
            ) : (
              <Button
                onClick={form.handleSubmit(onSubmit)}
                loading={mutation.isPending}
              >
                Process Return
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {managerId && (
            <div className="rounded-lg border border-green-500/30 bg-green-900/10 px-3 py-2 text-xs text-green-400">
              Approved by {managerName}
            </div>
          )}

          {/* Line selection */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-widest text-brand-smoke">
              Select Items to Return
            </p>
            {productLines.map((line) => (
              <div
                key={line.line_id}
                className="flex items-center gap-3 rounded-lg border border-black/10 px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-brand-smoke">
                    {line.description}
                  </p>
                  <p className="text-xs text-brand-smoke/60">
                    {fmtMoney(line.unit_price, currency)} × {line.quantity} sold
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-brand-smoke">Return:</span>
                  <div className="w-14 shrink-0">
                    <NumberField
                      surface="light"
                      value={qtys[line.product_id!] ?? 0}
                      onValueChange={(v) =>
                        setQtys((q) => ({
                          ...q,
                          [line.product_id!]: Math.min(v ?? 0, line.quantity),
                        }))
                      }
                      className="px-2 py-1 text-center"
                    />
                  </div>
                  <span className="text-xs text-brand-smoke">
                    / {line.quantity}
                  </span>
                </div>
              </div>
            ))}

            {productLines.length === 0 && (
              <p className="text-sm text-brand-smoke">
                No returnable items on this transaction.
              </p>
            )}
          </div>

          <Controller
            name="refund_method"
            control={form.control}
            render={({ field }) => (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                  Refund Method
                </label>
                <Select
                  {...field}
                  options={[
                    { value: "cash", label: "Cash" },
                    { value: "bank_transfer", label: "Bank Transfer" },
                    { value: "pos_card", label: "POS Card" },
                  ]}
                />
              </div>
            )}
          />

          <Controller
            name="return_reason"
            control={form.control}
            render={({ field, fieldState }) => (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                  Reason *
                </label>
                <Input
                  {...field}
                  placeholder="Why is the customer returning this?"
                  error={fieldState.error?.message}
                />
              </div>
            )}
          />
        </div>
      </Modal>

      {/* DiscountGate used directly — no import needed (same file) */}
      <DiscountGate
        open={showGate}
        onClose={() => setShowGate(false)}
        onApproved={handleApproved}
      />
    </>
  );
}

// ── XZReportView ───────────────────────────────────────────────────────────────
// Inline component (not a modal) — embed inside a Modal or page.

interface XZReportProps {
  report: XReport | ZReport;
  currency?: string;
}

export function XZReportView({ report, currency = "NGN" }: XZReportProps) {
  const isZ = report.report_type === "Z";

  return (
    <div className="space-y-4 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-brand-cream">
            {report.terminal_name}
          </p>
          <p className="text-xs text-brand-smoke">
            Opened {fmtDateTime(report.opened_at)} · {report.opened_by}
          </p>
          {isZ && (
            <p className="text-xs text-brand-smoke">
              Closed {fmtDateTime((report as ZReport).closed_at)}
            </p>
          )}
        </div>
        <span className="rounded-full bg-brand-graphite px-2.5 py-1 text-xs font-bold text-brand-accent">
          {report.report_type} Report
        </span>
      </div>

      {/* Revenue breakdown */}
      <div className="rounded-xl border border-white/5 bg-brand-charcoal p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-3">
          Revenue
        </p>
        <ReportRow
          label="Cash"
          value={fmtMoney(report.revenue.cash_total, currency)}
        />
        <ReportRow
          label="Bank Transfer"
          value={fmtMoney(report.revenue.transfer_total, currency)}
        />
        <ReportRow
          label="Card"
          value={fmtMoney(report.revenue.card_total, currency)}
        />
        <div className="border-t border-white/10 pt-2">
          <ReportRow
            label="Total Revenue"
            value={fmtMoney(report.revenue.total_revenue, currency)}
            bold
          />
        </div>
      </div>

      {/* Transaction counts */}
      <div className="rounded-xl border border-white/5 bg-brand-charcoal p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-3">
          Transactions
        </p>
        <ReportRow
          label="Completed"
          value={String(
            (report as XReport).transactions?.completed ??
              (report as ZReport).transactions?.total ??
              0,
          )}
        />
        {(report.transactions as any).voided > 0 && (
          <ReportRow
            label="Voided"
            value={String((report.transactions as any).voided)}
          />
        )}
      </div>

      {/* Cash drawer */}
      <div className="rounded-xl border border-white/5 bg-brand-charcoal p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-3">
          Cash Drawer
        </p>
        {isZ ? (
          <>
            <ReportRow
              label="Opening Float"
              value={fmtMoney(
                (report as ZReport).cash_drawer.opening_float,
                currency,
              )}
            />
            <ReportRow
              label="Expected"
              value={fmtMoney(
                (report as ZReport).cash_drawer.expected_cash,
                currency,
              )}
            />
            <ReportRow
              label="Actual"
              value={fmtMoney(
                (report as ZReport).cash_drawer.actual_cash,
                currency,
              )}
            />
            <div className="border-t border-white/10 pt-2">
              <VarianceRow
                variance={(report as ZReport).cash_drawer.variance}
                status={(report as ZReport).cash_drawer.status}
                currency={currency}
              />
            </div>
            {(report as ZReport).reconciliation_notes && (
              <p className="mt-2 text-xs text-brand-smoke italic">
                Note: {(report as ZReport).reconciliation_notes}
              </p>
            )}
          </>
        ) : (
          <>
            <ReportRow
              label="Opening Float"
              value={fmtMoney(
                (report as XReport).cash_drawer.opening_float,
                currency,
              )}
            />
            <ReportRow
              label="Cash Sales"
              value={fmtMoney(
                (report as XReport).cash_drawer.cash_sales,
                currency,
              )}
            />
            <ReportRow
              label="Expected in Till"
              value={fmtMoney(
                (report as XReport).cash_drawer.expected_cash_on_hand,
                currency,
              )}
            />
          </>
        )}
      </div>

      {/* Foreign tender drill-down — all totals above are in NGN; this
          shows what was actually tendered in other currencies and the
          rate/date the system converted it at. */}
      <ForeignTenderSection lines={report.foreign_tender ?? []} />
    </div>
  );
}

// ── Foreign tender (collapsible drill-down) ────────────────────────────────────

function ForeignTenderSection({ lines }: { lines: ForeignTenderLine[] }) {
  const [open, setOpen] = useState(false);
  if (!lines.length) return null;

  const totalNgn = lines.reduce((s, l) => s + l.ngn_amount, 0);
  // Short summary of distinct currencies, e.g. "USD, GBP".
  const currencies = [...new Set(lines.map((l) => l.currency))].join(", ");

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-900/5 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-amber-300/90">
          Foreign Tender ({currencies})
        </span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-brand-cream tabular-nums">
            {fmtMoney(totalNgn, "NGN")}
          </span>
          <span className="text-amber-300/70 text-xs">
            {open ? "Hide" : "Details"}
          </span>
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {lines.map((l, i) => (
            <div
              key={`${l.currency}-${l.payment_method}-${l.tender_date}-${i}`}
              className="rounded-lg border border-white/5 bg-brand-charcoal px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-brand-cream tabular-nums">
                  {fmtMoney(l.original_amount, l.currency)}
                </span>
                <span className="text-brand-cream tabular-nums">
                  {fmtMoney(l.ngn_amount, "NGN")}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-brand-smoke">
                {l.payment_method.replace(/_/g, " ")} ·{" "}
                {new Date(l.tender_date).toLocaleDateString()} · 1 {l.currency} ={" "}
                ₦
                {l.exchange_rate.toLocaleString("en-NG", {
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Local helper sub-components ────────────────────────────────────────────────

function ReportRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-brand-smoke">{label}</span>
      <span
        className={
          bold
            ? "font-semibold text-brand-cream tabular-nums"
            : "text-brand-cream tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

function VarianceRow({
  variance,
  status,
  currency,
}: {
  variance: number;
  status: keyof typeof VARIANCE_STATUS_META;
  currency: string;
}) {
  const meta = VARIANCE_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-brand-smoke">Variance</span>
      <span
        className="flex items-center gap-1 font-medium"
        style={{ color: meta.color }}
      >
        <Icon className="h-3.5 w-3.5" />
        {meta.label} ({fmtMoney(Math.abs(variance), currency)})
      </span>
    </div>
  );
}
