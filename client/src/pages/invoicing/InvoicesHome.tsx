import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Eye,
  DollarSign,
  Send,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Tabs } from "@components/ui/Tabs";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import {
  InvoiceStatusBadge,
  InvoiceKpiStrip,
  InvoiceAgingBuckets,
} from "@components/invoicing/InvoiceDisplay";
import { InvoiceFormModal } from "@components/invoicing/InvoiceFormModal";
import {
  RecordPaymentModal,
  SendInvoiceModal,
} from "@components/invoicing/InvoiceModals";
import { listInvoices, getInvoiceKpis } from "@services/invoicing/invoices";
import { INVOICE_STATUS_TABS } from "@lib/constants/invoicingConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney, fmtDate } from "@lib/format";
import { cn } from "@lib/cn";
import type { Invoice } from "@typedefs/invoicing";
import { Topbar } from "@/components/shell/Topbar";

const INVOICE_PAGE_SIZE = 50;

export default function InvoicesHome() {
  const navigate = useNavigate();
  const { currency } = useActiveBusiness();

  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [paymentInv, setPaymentInv] = useState<Invoice | null>(null);
  const [sendInv, setSendInv] = useState<Invoice | null>(null);

  const { data: kpisData, isLoading: kpisLoading } = useQuery({
    queryKey: ["invoice-kpis"],
    queryFn: getInvoiceKpis,
    refetchInterval: 60_000,
  });

  const { data, isLoading: listLoading } = useQuery({
    queryKey: ["invoices", activeTab, page],
    queryFn: () =>
      listInvoices({
        status: activeTab === "all" ? undefined : activeTab,
        page,
        limit: INVOICE_PAGE_SIZE,
      }),
    keepPreviousData: true,
  } as any);

  const invoices: Invoice[] = (data as any)?.data ?? [];
  const total = (data as any)?.total ?? invoices.length;
  const totalPages = Math.max(1, Math.ceil(total / INVOICE_PAGE_SIZE));

  function handleTabChange(tab: string) {
    setActiveTab(tab);
    setPage(1);
  }

  return (
    <>
      <Topbar title="Invoices" subtitle="Payments · Credit Notes" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Invoices"
          subtitle="Manage invoices, payments, credit notes, and aging."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Invoices" }]}
          actions={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              New Invoice
            </Button>
          }
        />

        {/* KPI strip */}
        <InvoiceKpiStrip currency={currency} />

        {/* Aging buckets — clicking a bucket filters the table */}
        {!kpisLoading && (
          <InvoiceAgingBuckets
            kpis={kpisData}
            currency={currency}
            onBucketClick={(bucketKey) => {
              // Map bucket key → status tab for rough filtering
              const map: Record<string, string> = {
                bucket_current: "sent",
                bucket_1_30: "overdue",
                bucket_31_60: "overdue",
                bucket_61_90: "overdue",
                bucket_90_plus: "overdue",
              };
              setActiveTab(map[bucketKey] ?? "all");
            }}
          />
        )}

        {/* Status tabs */}
        <Tabs
          tabs={INVOICE_STATUS_TABS.map((t) => ({
            key: t.key,
            label: t.label,
          }))}
          active={activeTab}
          onChange={handleTabChange}
          surface="dark"
          variant="underline"
        />

        {/* Invoice table */}
        {listLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-brand-smoke">
              No invoices in this filter.
            </p>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => setShowCreate(true)}
            >
              Create your first invoice
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-brand-charcoal">
                  {[
                    "Invoice",
                    "Customer",
                    "Issued",
                    "Due",
                    "Amount",
                    "Outstanding",
                    "Status",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-widest text-brand-smoke"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invoices.map((inv) => (
                  <tr
                    key={inv.invoice_id}
                    className="bg-brand-charcoal hover:bg-brand-graphite/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/invoices/${inv.invoice_id}`)}
                        className="font-mono text-xs font-semibold text-brand-accent hover:underline"
                      >
                        {inv.invoice_number}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-brand-cream">
                        {inv.contact_name}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-brand-smoke">
                      {fmtDate(inv.issue_date)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3",
                        inv.status === "overdue"
                          ? "font-medium text-red-400"
                          : "text-brand-smoke",
                      )}
                    >
                      {fmtDate(inv.due_date)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-brand-cream">
                      {fmtMoney(inv.total_amount, currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <span
                        className={cn(
                          inv.amount_outstanding > 0
                            ? "text-amber-400"
                            : "text-brand-smoke",
                        )}
                      >
                        {fmtMoney(inv.amount_outstanding, currency)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <InvoiceStatusBadge status={inv.status} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          title="View"
                          onClick={() =>
                            navigate(`/invoices/${inv.invoice_id}`)
                          }
                          className="text-brand-smoke hover:text-brand-accent transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {inv.amount_outstanding > 0 &&
                          inv.status !== "voided" && (
                            <button
                              title="Record Payment"
                              onClick={() => setPaymentInv(inv)}
                              className="text-brand-smoke hover:text-green-400 transition-colors"
                            >
                              <DollarSign className="h-4 w-4" />
                            </button>
                          )}
                        {inv.status === "draft" && (
                          <button
                            title="Send Invoice"
                            onClick={() => setSendInv(inv)}
                            className="text-brand-smoke hover:text-brand-accent transition-colors"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-brand-smoke">
              {total} invoices · page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-brand-charcoal px-3 py-1.5 text-xs text-brand-smoke hover:border-white/20 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-brand-charcoal px-3 py-1.5 text-xs text-brand-smoke hover:border-white/20 disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Modals */}
        <InvoiceFormModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            navigate(`/invoices/${id}`);
          }}
        />

        {paymentInv && (
          <RecordPaymentModal
            open={!!paymentInv}
            onClose={() => setPaymentInv(null)}
            invoice={paymentInv}
            currency={currency}
          />
        )}

        {sendInv && (
          <SendInvoiceModal
            open={!!sendInv}
            onClose={() => setSendInv(null)}
            invoice={sendInv}
          />
        )}
      </div>
    </>
  );
}
