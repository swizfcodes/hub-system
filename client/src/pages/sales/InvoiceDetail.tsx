import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CreditCard,
  Globe,
  Send,
  FileDown,
  RefreshCw,
  Copy,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { SalesStatusBadge } from "@components/sales/shared/SalesStatusBadge";
import { LineItemsTable } from "@components/sales/shared/LineItemsTable";
import { PaymentLedger } from "@components/sales/shared/PaymentLedger";
import { RecordPaymentModal } from "@components/sales/modals/SalesModals";
import {
  getInvoice,
  openInvoicePdf,
  sendInvoice,
  refreshPaymentLinks,
} from "@services/sales/invoices";
import { listReceipts } from "@services/sales/receipts";
import { fmtDate, fmtMoney } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();

  const [showPayment, setShowPayment] = useState(false);

  const { data: invoice, isLoading: invLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => getInvoice(id!),
    enabled: !!id,
  });

  const { data: receiptsData } = useQuery({
    queryKey: ["receipts", { invoice_id: id }],
    queryFn: () => listReceipts({ invoice_id: id }),
    enabled: !!id,
  });

  const sendMutation = useMutation({
    mutationFn: (channel: "email" | "whatsapp") => sendInvoice(id!, channel),
    onSuccess: () => showToast.success("Invoice sent"),
    onError: (err) => showToast.error(errMsg(err)),
  });

  const refreshLinksMutation = useMutation({
    mutationFn: () => refreshPaymentLinks(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      showToast.success("Payment links refreshed");
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  function copyLink(url: string) {
    navigator.clipboard.writeText(url);
    showToast.success("Link copied to clipboard");
  }

  if (invLoading) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto text-center">
        <p className="text-orika-smoke">Invoice not found.</p>
      </div>
    );
  }

  const receipts = receiptsData?.data ?? [];
  const isPaid = invoice.status === "paid";
  const isVoided = invoice.status === "voided";
  const canPay = !isPaid && !isVoided;

  return (
    <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title={invoice.invoice_number}
        subtitle={`${invoice.contact_name ?? ""} · Issued ${fmtDate(invoice.issue_date)} · Due ${fmtDate(invoice.due_date)}`}
        crumbs={[
          { label: "Hub", to: "/" },
          { label: "Sales", to: "/sales" },
          { label: "Invoices" },
          { label: invoice.invoice_number },
        ]}
        actions={<SalesStatusBadge entity="invoice" status={invoice.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* Left */}
        <div className="space-y-6">
          {/* Payment links */}
          {(invoice.paystack_payment_url || invoice.stripe_payment_url) &&
            !isPaid && (
              <div className="rounded-xl border border-white/5 bg-orika-charcoal p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-orika-smoke">
                    Payment Links
                  </h2>
                  <button
                    onClick={() => refreshLinksMutation.mutate()}
                    className="flex items-center gap-1.5 text-xs text-orika-smoke hover:text-orika-gold transition-colors"
                    disabled={refreshLinksMutation.isPending}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </button>
                </div>
                <div className="space-y-3">
                  {invoice.paystack_payment_url && (
                    <PaymentLinkRow
                      label="Paystack — Nigeria (NGN)"
                      icon={CreditCard}
                      url={invoice.paystack_payment_url}
                      accent="#00C2A3"
                      onCopy={() => copyLink(invoice.paystack_payment_url!)}
                    />
                  )}
                  {invoice.stripe_payment_url && (
                    <PaymentLinkRow
                      label="Stripe — International"
                      icon={Globe}
                      url={invoice.stripe_payment_url}
                      accent="#6772E5"
                      onCopy={() => copyLink(invoice.stripe_payment_url!)}
                    />
                  )}
                </div>
                <p className="mt-3 text-xs text-orika-smoke/60">
                  Share these links directly with the customer for secure online
                  payment.
                </p>
              </div>
            )}

          {/* Lines */}
          {invoice.lines && invoice.lines.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-orika-charcoal p-5">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-orika-smoke">
                Line Items
              </h2>
              <LineItemsTable
                lines={invoice.lines}
                totals={{
                  subtotal: invoice.subtotal,
                  discount_total: invoice.discount_total,
                  vat_amount: invoice.vat_amount,
                  total_amount: invoice.total_amount,
                }}
                currency={invoice.currency ?? currency}
              />
            </div>
          )}

          {/* Payment ledger */}
          <div className="rounded-xl border border-white/5 bg-orika-charcoal p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-orika-smoke">
              Payment History
            </h2>
            <PaymentLedger
              payments={invoice.payments ?? []}
              receipts={receipts}
              currency={invoice.currency ?? currency}
            />
          </div>

          {/* Notes */}
          {(invoice.notes || invoice.payment_instructions) && (
            <div className="rounded-xl border border-white/5 bg-orika-charcoal p-5 space-y-3">
              {invoice.notes && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-widest text-orika-smoke">
                    Notes
                  </h3>
                  <p className="text-sm text-orika-cloud">{invoice.notes}</p>
                </div>
              )}
              {invoice.payment_instructions && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-widest text-orika-smoke">
                    Payment Instructions
                  </h3>
                  <p className="text-sm text-orika-cloud whitespace-pre-line">
                    {invoice.payment_instructions}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right — rail */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Payment summary */}
          <div className="rounded-xl border border-white/5 bg-orika-charcoal p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-orika-smoke">
              Payment Summary
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-orika-smoke">Total</span>
                <span className="font-medium text-orika-cream">
                  {fmtMoney(invoice.total_amount, invoice.currency ?? currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-orika-smoke">Paid</span>
                <span className="font-medium text-green-400">
                  {fmtMoney(invoice.amount_paid, invoice.currency ?? currency)}
                </span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-2">
                <span className="text-orika-smoke">Outstanding</span>
                <span
                  className={
                    invoice.amount_outstanding > 0
                      ? "font-semibold text-amber-400"
                      : "font-medium text-orika-smoke"
                  }
                >
                  {fmtMoney(
                    invoice.amount_outstanding,
                    invoice.currency ?? currency,
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="rounded-xl border border-white/5 bg-orika-charcoal p-4 space-y-2">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-orika-smoke">
              Actions
            </h3>

            {canPay && (
              <Button
                className="w-full justify-start"
                onClick={() => setShowPayment(true)}
              >
                <CreditCard className="h-4 w-4" />
                Record Payment
              </Button>
            )}

            {invoice.email && !isPaid && (
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => sendMutation.mutate("email")}
                loading={sendMutation.isPending}
              >
                <Send className="h-4 w-4" />
                Send via Email
              </Button>
            )}

            <button
              onClick={() => openInvoicePdf(invoice.invoice_id)}
              className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-orika-cloud hover:border-orika-gold/30 hover:text-orika-gold transition-colors"
            >
              <FileDown className="h-4 w-4" />
              Download PDF
            </button>

            {invoice.order_id && (
              <a
                href={`/sales/orders/${invoice.order_id}`}
                className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-orika-cloud hover:border-orika-gold/30 hover:text-orika-gold transition-colors"
              >
                View Order
              </a>
            )}
          </div>
        </div>
      </div>

      {showPayment && (
        <RecordPaymentModal
          open={showPayment}
          onClose={() => setShowPayment(false)}
          invoiceId={invoice.invoice_id}
          invoiceNumber={invoice.invoice_number}
          amountOutstanding={invoice.amount_outstanding}
          currency={invoice.currency ?? currency}
          onRecorded={() => {
            qc.invalidateQueries({ queryKey: ["invoice", id] });
            qc.invalidateQueries({
              queryKey: ["receipts", { invoice_id: id }],
            });
          }}
        />
      )}
    </div>
  );
}

function PaymentLinkRow({
  label,
  icon: Icon,
  url,
  accent,
  onCopy,
}: {
  label: string;
  icon: typeof CreditCard;
  url: string;
  accent: string;
  onCopy: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
      style={{ borderColor: `${accent}30`, backgroundColor: `${accent}08` }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
        <span className="text-sm font-medium text-orika-cream truncate">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onCopy}
          className="text-orika-smoke hover:text-orika-gold transition-colors"
          title="Copy link"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium transition-colors"
          style={{ color: accent }}
        >
          Open
        </a>
      </div>
    </div>
  );
}
