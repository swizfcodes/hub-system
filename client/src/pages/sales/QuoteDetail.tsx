import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  CheckCircle,
  FileDown,
  XCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { SalesStatusBadge } from "@components/sales/shared/SalesStatusBadge";
import { LineItemsTable } from "@components/sales/shared/LineItemsTable";
import { SendQuoteModal } from "@components/sales/modals/SalesModals";
import { ConfirmQuoteModal } from "@components/sales/modals/SalesModals";
import { getQuotation, cancelQuotation } from "@services/sales/quotations";
import { api } from "@services/api";
import { fmtDate, fmtMoney, fmtDateTime } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { QUOTE_STATUS_META } from "@lib/constants/salesConstants";
import { cn } from "@lib/cn";
import type { QuoteStatus } from "@typedefs/sales";

export default function QuoteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();

  const [showSend, setShowSend] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  async function handlePdfPreview() {
    if (!id || pdfLoading) return;
    setPdfLoading(true);
    try {
      const response = await api.get(`/sales/quotations/${id}/pdf`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      // Revoke after the tab has had time to load the blob
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if (!win)
        showToast.error("Pop-up blocked — please allow pop-ups for this site.");
    } catch (err) {
      showToast.error(errMsg(err, "Could not load PDF"));
    } finally {
      setPdfLoading(false);
    }
  }

  const { data: quote, isLoading } = useQuery({
    queryKey: ["quotation", id],
    queryFn: () => getQuotation(id!),
    enabled: !!id,
  });

  async function handleCancel() {
    if (!id) return;
    try {
      await cancelQuotation(id);
      qc.invalidateQueries({ queryKey: ["quotation", id] });
      qc.invalidateQueries({ queryKey: ["quotations"] });
      showToast.info("Quotation cancelled");
    } catch (err) {
      showToast.error(errMsg(err));
    }
  }

  if (isLoading) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto text-center">
        <p className="text-brand-smoke">Quotation not found.</p>
      </div>
    );
  }

  const isDraft = quote.status === "draft";
  const isSent = quote.status === "sent" || quote.status === "viewed";
  const isConfirmed = quote.status === "confirmed";
  const isClosed = quote.status === "expired" || quote.status === "cancelled";
  const canSend = isDraft || isSent;
  const canConfirm = isDraft || isSent;
  const canCancel = !isConfirmed && !isClosed;

  const statusSteps: QuoteStatus[] = ["draft", "sent", "viewed", "confirmed"];

  return (
    <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title={quote.quotation_number}
        subtitle={`${quote.contact_name ?? ""} · Created ${fmtDate(quote.created_at)}`}
        crumbs={[
          { label: "Hub", to: "/" },
          { label: "Sales", to: "/sales" },
          { label: "Quotations", to: "/sales" },
          { label: quote.quotation_number },
        ]}
        actions={<SalesStatusBadge entity="quotation" status={quote.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Left — main content */}
        <div className="space-y-6">
          {/* Contact + meta */}
          <div className="rounded-xl border border-white/5 bg-brand-charcoal p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-brand-smoke">
              Customer
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <MetaField label="Name" value={quote.contact_name ?? "—"} />
              <MetaField label="Email" value={quote.email ?? "—"} />
              <MetaField label="Phone" value={quote.primary_phone ?? "—"} />
              <MetaField
                label="Valid Until"
                value={fmtDate(quote.valid_until)}
              />
              <MetaField label="Currency" value={quote.currency} />
              <MetaField label="Terms" value={quote.payment_terms ?? "—"} />
            </div>
          </div>

          {/* Lines */}
          <div className="rounded-xl border border-white/5 bg-brand-charcoal p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-brand-smoke">
              Line Items
            </h2>
            {quote.lines && quote.lines.length > 0 ? (
              <LineItemsTable
                lines={quote.lines}
                totals={{
                  subtotal: quote.subtotal,
                  discount_total: quote.discount_total,
                  vat_amount: quote.vat_amount,
                  total_amount: quote.total_amount,
                }}
                currency={quote.currency ?? currency}
              />
            ) : (
              <p className="text-sm text-brand-smoke">No line items.</p>
            )}
          </div>

          {/* Notes + T&C */}
          {(quote.notes || quote.terms_conditions) && (
            <div className="rounded-xl border border-white/5 bg-brand-charcoal p-5 space-y-4">
              {quote.notes && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-widest text-brand-smoke">
                    Notes
                  </h3>
                  <p className="text-sm text-brand-cloud leading-relaxed">
                    {quote.notes}
                  </p>
                </div>
              )}
              {quote.terms_conditions && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-widest text-brand-smoke">
                    Terms & Conditions
                  </h3>
                  <p className="text-sm text-brand-cloud leading-relaxed whitespace-pre-line">
                    {quote.terms_conditions}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right — sticky actions rail */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {/* Status timeline */}
          <div className="rounded-xl border border-white/5 bg-brand-charcoal p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand-smoke">
              Status
            </h3>
            <div className="space-y-2">
              {statusSteps.map((s) => {
                const meta = QUOTE_STATUS_META[s];
                const isActive = quote.status === s;
                const isPast =
                  statusSteps.indexOf(s) <
                  statusSteps.indexOf(quote.status as QuoteStatus);
                const Icon = meta.icon;
                return (
                  <div
                    key={s}
                    className={cn(
                      "flex items-center gap-2.5 text-sm",
                      isActive
                        ? "text-brand-cream"
                        : isPast
                          ? "text-brand-smoke"
                          : "text-brand-graphite",
                    )}
                  >
                    <Icon
                      className="h-4 w-4 shrink-0"
                      style={{
                        color: isActive
                          ? meta.color
                          : isPast
                            ? "#6B7280"
                            : "#2A2A2D",
                      }}
                    />
                    <span>{meta.label}</span>
                    {isActive && (
                      <span className="ml-auto text-xs text-brand-smoke">
                        {s === "sent" && quote.sent_at
                          ? fmtDateTime(quote.sent_at)
                          : s === "confirmed" && quote.confirmed_at
                            ? fmtDateTime(quote.confirmed_at)
                            : "Now"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="rounded-xl border border-white/5 bg-brand-charcoal p-4 space-y-2">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-brand-smoke">
              Actions
            </h3>

            {canSend && (
              <Button
                className="w-full justify-start"
                onClick={() => setShowSend(true)}
              >
                <Send className="h-4 w-4" />
                Send to Customer
              </Button>
            )}

            {canConfirm && (
              <Button
                variant="secondary"
                className="w-full justify-start"
                onClick={() => setShowConfirm(true)}
              >
                <CheckCircle className="h-4 w-4" />
                Confirm to Order
              </Button>
            )}

            <button
              onClick={handlePdfPreview}
              disabled={pdfLoading}
              className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-brand-cloud transition-colors hover:border-brand-accent/30 hover:text-brand-accent disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" />
              {pdfLoading ? "Loading…" : "Preview PDF"}
            </button>

            {quote.deal_id && (
              <a
                href={`/crm/${quote.deal_id}`}
                className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-brand-cloud transition-colors hover:border-brand-accent/30 hover:text-brand-accent"
              >
                <ExternalLink className="h-4 w-4" />
                View CRM Deal
              </a>
            )}

            {canCancel && (
              <button
                onClick={handleCancel}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-smoke transition-colors hover:text-red-400"
              >
                <XCircle className="h-4 w-4" />
                Cancel Quote
              </button>
            )}

            {isConfirmed && (
              <div className="rounded-lg bg-brand-graphite/30 px-3 py-2 text-xs text-brand-smoke flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                Confirmed {fmtDate(quote.confirmed_at)}
              </div>
            )}
          </div>

          {/* Total */}
          <div className="rounded-xl border border-white/5 bg-brand-charcoal p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-brand-smoke">Total</span>
              <span className="font-display text-xl font-extrabold text-brand-accent">
                {fmtMoney(quote.total_amount, quote.currency ?? currency)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showSend && (
        <SendQuoteModal
          open={showSend}
          onClose={() => setShowSend(false)}
          quotationId={quote.quotation_id}
          quotationNumber={quote.quotation_number}
          hasEmail={!!quote.email}
          hasWhatsApp={!!quote.whatsapp_number}
        />
      )}

      {showConfirm && (
        <ConfirmQuoteModal
          open={showConfirm}
          onClose={() => setShowConfirm(false)}
          quotationId={quote.quotation_id}
          quotationNumber={quote.quotation_number}
          onConfirmed={(orderId) => {
            setShowConfirm(false);
            navigate(`/sales/orders/${orderId}`);
          }}
        />
      )}
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-brand-smoke">{label}</dt>
      <dd className="mt-0.5 font-medium text-brand-cream truncate">{value}</dd>
    </div>
  );
}
