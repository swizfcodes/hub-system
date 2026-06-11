import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery /*useQueryClient*/ } from "@tanstack/react-query";
import {
  Download,
  Send,
  DollarSign,
  FileText,
  FileX,
  /*ArrowLeft,*/ AlertTriangle,
  ExternalLink /*Clock,*/,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import {
  InvoiceStatusBadge,
  // CreditNoteStatusBadge,
} from "@components/invoicing/InvoiceDisplay";
import {
  RecordPaymentModal,
  SendInvoiceModal,
  CreditNoteModal,
  WriteOffModal,
} from "@components/invoicing/InvoiceModals";
import { getInvoice, openInvoicePdf } from "@services/invoicing/invoices";
//import { issueCreditNote, setCreditNoteStatus } from '@services/invoicing/creditNotes';
import {
  PAYMENT_METHOD_LABEL,
  WRITE_OFF_SUGGEST_DAYS,
} from "@lib/constants/invoicingConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney, fmtDate, fmtDateTime } from "@lib/format";
//import { showToast } from '@hooks/useToast';
//import { errMsg } from '@services/api';
//import { useMutation } from '@tanstack/react-query';
import { cn } from "@lib/cn";

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  //const qc                = useQueryClient();
  const { currency } = useActiveBusiness();

  const [showPayment, setShowPayment] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showCreditNote, setShowCreditNote] = useState(false);
  const [showWriteOff, setShowWriteOff] = useState(false);

  const { data: invoice, isLoading /*error*/ } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => getInvoice(id!),
    enabled: !!id,
  });

  // const issueMutation = useMutation({
  //   mutationFn: issueCreditNote,
  //   onSuccess: () => {
  //     showToast.success('Credit note issued');
  //     qc.invalidateQueries({ queryKey: ['invoice', id] });
  //   },
  //   onError: (err) => showToast.error(errMsg(err)),
  // });

  // const setCNStatusMutation = useMutation({
  //   mutationFn: ({ cnId, status }: { cnId: string; status: 'applied' | 'refunded' }) =>
  //     setCreditNoteStatus(cnId, status),
  //   onSuccess: () => {
  //     showToast.success('Credit note updated');
  //     qc.invalidateQueries({ queryKey: ['invoice', id] });
  //   },
  //   onError: (err) => showToast.error(errMsg(err)),
  // });

  // ── Loading / error ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-brand-smoke">Invoice not found.</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate("/invoices")}
        >
          Back to Invoices
        </Button>
      </div>
    );
  }

  // ── Write-off suggestion ────────────────────────────────────────────────────

  const daysSinceDue = invoice.due_date
    ? Math.floor(
        (Date.now() - new Date(invoice.due_date).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : 0;

  const showWriteOffSuggestion =
    daysSinceDue >= WRITE_OFF_SUGGEST_DAYS &&
    invoice.amount_outstanding > 0 &&
    !["paid", "voided"].includes(invoice.status);

  // ── Payment instructions URL detection ─────────────────────────────────────

  const isUrl = (str: string | null | undefined) => {
    if (!str) return false;
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title={invoice.invoice_number}
        subtitle={`${invoice.contact_name} · Issued ${fmtDate(invoice.issue_date)}`}
        crumbs={[
          { label: "Invoices", to: "/invoices" },
          { label: invoice.invoice_number },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <InvoiceStatusBadge status={invoice.status} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                openInvoicePdf(invoice.invoice_id)
              }
            >
              <Download className="h-4 w-4" />
              PDF
            </Button>
            {["draft", "sent", "overdue"].includes(invoice.status) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowSend(true)}
              >
                <Send className="h-4 w-4" />
                Send
              </Button>
            )}
            {invoice.amount_outstanding > 0 && invoice.status !== "voided" && (
              <Button size="sm" onClick={() => setShowPayment(true)}>
                <DollarSign className="h-4 w-4" />
                Record Payment
              </Button>
            )}
          </div>
        }
      />

      {/* Write-off suggestion banner */}
      {showWriteOffSuggestion && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-900/10 px-5 py-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-300">
              This invoice is {daysSinceDue} days overdue.
            </p>
            <p className="mt-0.5 text-xs text-amber-300/70">
              Consider writing it off as bad debt to keep your books accurate.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-amber-400 hover:text-amber-300 shrink-0"
            onClick={() => setShowWriteOff(true)}
          >
            Write Off
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left — Invoice details */}
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-4">
            Invoice Details
          </p>
          <DetailRow label="Customer" value={invoice.contact_name} />
          <DetailRow
            label="Type"
            value={invoice.invoice_type.replace(/_/g, " ")}
            capitalize
          />
          <DetailRow label="Issue Date" value={fmtDate(invoice.issue_date)} />
          <DetailRow
            label="Due Date"
            value={fmtDate(invoice.due_date)}
            highlight={invoice.status === "overdue" ? "danger" : undefined}
          />
          {invoice.sent_at && (
            <DetailRow label="Sent" value={fmtDateTime(invoice.sent_at)} />
          )}
          {invoice.paid_at && (
            <DetailRow label="Paid" value={fmtDateTime(invoice.paid_at)} />
          )}
          {invoice.notes && <DetailRow label="Notes" value={invoice.notes} />}
          {/* Payment instructions / link */}
          {invoice.payment_instructions && (
            <div className="flex justify-between gap-2 pt-1">
              <span className="text-xs text-brand-smoke shrink-0">
                Payment Link
              </span>
              {isUrl(invoice.payment_instructions) ? (
                <a
                  href={invoice.payment_instructions}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"
                >
                  Open Link
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-xs text-brand-cream max-w-[60%] text-right">
                  {invoice.payment_instructions}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right — Financials */}
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-4">
            Summary
          </p>
          <AmountRow
            label="Subtotal"
            value={invoice.subtotal}
            currency={currency}
          />
          {invoice.discount_total > 0 && (
            <AmountRow
              label="Discount"
              value={-invoice.discount_total}
              currency={currency}
              muted
            />
          )}
          <AmountRow
            label="VAT"
            value={invoice.vat_amount}
            currency={currency}
            muted
          />
          <div className="border-t border-white/10 pt-3">
            <AmountRow
              label="Total"
              value={invoice.total_amount}
              currency={currency}
              bold
            />
          </div>
          <AmountRow
            label="Paid"
            value={invoice.amount_paid}
            currency={currency}
            muted
          />
          <div className={cn("border-t border-white/10 pt-3")}>
            <AmountRow
              label="Outstanding"
              value={invoice.amount_outstanding}
              currency={currency}
              highlight={invoice.amount_outstanding > 0 ? "warning" : "success"}
              bold
            />
          </div>
        </div>
      </div>

      {/* Line items */}
      {invoice.lines && invoice.lines.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
              Line Items
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {[
                  "Description",
                  "Qty",
                  "Unit Price",
                  "Discount",
                  "VAT",
                  "Total",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[0.65rem] font-medium uppercase tracking-widest text-brand-smoke"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invoice.lines.map((line) => (
                <tr key={line.line_id}>
                  <td className="px-4 py-3 text-brand-cream">
                    {line.description}
                  </td>
                  <td className="px-4 py-3 text-brand-smoke tabular-nums">
                    {line.quantity}
                  </td>
                  <td className="px-4 py-3 text-brand-smoke tabular-nums">
                    {fmtMoney(line.unit_price, currency)}
                  </td>
                  <td className="px-4 py-3 text-brand-smoke tabular-nums">
                    {line.discount_amount > 0
                      ? fmtMoney(line.discount_amount, currency)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-brand-smoke tabular-nums">
                    {fmtMoney(line.vat_amount, currency)}
                  </td>
                  <td className="px-4 py-3 font-medium text-brand-cream tabular-nums">
                    {fmtMoney(line.line_total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payments ledger */}
      {invoice.payments && invoice.payments.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
              Payment History
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {["Date", "Method", "Reference", "Amount", "Status"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[0.65rem] font-medium uppercase tracking-widest text-brand-smoke"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invoice.payments.map((p) => (
                <tr key={p.payment_id}>
                  <td className="px-4 py-3 text-brand-smoke">
                    {fmtDate(p.payment_date)}
                  </td>
                  <td className="px-4 py-3 text-brand-cloud">
                    {PAYMENT_METHOD_LABEL[p.payment_method]}
                  </td>
                  <td className="px-4 py-3 text-brand-smoke font-mono text-xs">
                    {p.reference ?? p.paystack_reference ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-brand-cream tabular-nums">
                    {fmtMoney(p.amount, currency)}
                  </td>
                  <td className="px-4 py-3">
                    {p.is_confirmed ? (
                      <span className="text-xs text-green-400">Confirmed</span>
                    ) : (
                      <span className="text-xs text-amber-400">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Credit notes section */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
          Credit Notes
        </p>
        {!["paid", "voided"].includes(invoice.status) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCreditNote(true)}
          >
            <FileText className="h-4 w-4" />
            Create Credit Note
          </Button>
        )}
      </div>

      {/* More actions */}
      {!["paid", "voided"].includes(invoice.status) && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
          {!showWriteOffSuggestion && (
            <Button
              variant="ghost"
              size="sm"
              className="text-brand-smoke hover:text-red-400"
              onClick={() => setShowWriteOff(true)}
            >
              <FileX className="h-4 w-4" />
              Write Off
            </Button>
          )}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {showPayment && (
        <RecordPaymentModal
          open={showPayment}
          onClose={() => setShowPayment(false)}
          invoice={invoice}
          currency={currency}
        />
      )}

      {showSend && (
        <SendInvoiceModal
          open={showSend}
          onClose={() => setShowSend(false)}
          invoice={invoice}
        />
      )}

      {showCreditNote && (
        <CreditNoteModal
          open={showCreditNote}
          onClose={() => setShowCreditNote(false)}
          invoice={invoice}
          currency={currency}
        />
      )}

      {showWriteOff && (
        <WriteOffModal
          open={showWriteOff}
          onClose={() => setShowWriteOff(false)}
          invoice={invoice}
          currency={currency}
        />
      )}
    </div>
  );
}

// ── Local helper components ────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  capitalize = false,
  highlight,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
  highlight?: "danger" | "warning";
}) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-brand-smoke shrink-0">{label}</span>
      <span
        className={cn(
          "text-right",
          capitalize && "capitalize",
          highlight === "danger" && "text-red-400 font-medium",
          highlight === "warning" && "text-amber-400 font-medium",
          !highlight && "text-brand-cream",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function AmountRow({
  label,
  value,
  currency,
  muted = false,
  bold = false,
  highlight,
}: {
  label: string;
  value: number;
  currency: string;
  muted?: boolean;
  bold?: boolean;
  highlight?: "warning" | "success";
}) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className={muted ? "text-brand-smoke" : "text-brand-cloud"}>
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          bold ? "font-semibold" : "",
          highlight === "warning" && value > 0 ? "text-amber-400" : "",
          highlight === "success" && value === 0 ? "text-green-400" : "",
          !highlight && (muted ? "text-brand-smoke" : "text-brand-cream"),
        )}
      >
        {fmtMoney(value, currency)}
      </span>
    </div>
  );
}
