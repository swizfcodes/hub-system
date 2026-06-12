import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Package, Search, Plus, CheckCircle } from "lucide-react";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { listOrders, approveCampaignProof } from "@services/sales/orders";
import { SalesStatusBadge } from "@components/sales/shared/SalesStatusBadge";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { fmtMoney, fmtDate } from "@lib/format";
import {
  ORDER_FILTER_OPTIONS,
  FULFILMENT_LABELS,
  SOURCE_FILTER_OPTIONS,
  FULFILMENT_FILTER_OPTIONS,
  SOURCE_LABELS,
} from "@lib/constants/salesConstants";
import type { OrderSource } from "@typedefs/sales";
import { cn } from "@lib/cn";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

export function OrdersView() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();

  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [fulfilmentType, setFulfilmentType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["sales-orders", { status, source, fulfilment_type: fulfilmentType, page }],
    queryFn: () =>
      listOrders({
        status: status || undefined,
        source: source || undefined,
        fulfilment_type: fulfilmentType || undefined,
        limit: PAGE_SIZE,
        page,
      }),
  });

  const approveProof = useMutation({
    mutationFn: (orderId: string) => approveCampaignProof(orderId),
    onSuccess: () => {
      showToast.success("Campaign proof approved");
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
    },
    onError: (e) => showToast.error(errMsg(e)),
  });

  const rows = data?.data ?? [];
  const hasMore = rows.length === PAGE_SIZE;

  const filtered = search
    ? rows.filter(
        (o) =>
          o.order_number.toLowerCase().includes(search.toLowerCase()) ||
          (o.contact_name ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : rows;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {ORDER_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatus(opt.value); setPage(1); }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                status === opt.value
                  ? "bg-brand-accent text-brand-black"
                  : "bg-brand-graphite text-brand-cloud hover:bg-brand-graphite/80",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-smoke" />
            <Input
              placeholder="Search orders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-sm w-44 sm:w-56"
            />
          </div>
          <Button
            variant="gold"
            size="sm"
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => navigate("/sales/orders/new")}
          >
            New Sale
          </Button>
        </div>
      </div>

      {/* Source & Fulfilment filter chips */}
      <div className="flex flex-wrap gap-2">
        {SOURCE_FILTER_OPTIONS.map((opt) => (
          <button
            key={`src-${opt.value}`}
            onClick={() => { setSource(opt.value); setPage(1); }}
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-medium transition-colors border",
              source === opt.value
                ? "border-brand-accent/50 bg-brand-accent/10 text-brand-accent"
                : "border-white/5 bg-brand-charcoal text-brand-smoke hover:border-white/10",
            )}
          >
            {opt.label}
          </button>
        ))}
        <span className="w-px h-5 bg-white/10 self-center" />
        {FULFILMENT_FILTER_OPTIONS.map((opt) => (
          <button
            key={`ful-${opt.value}`}
            onClick={() => { setFulfilmentType(opt.value); setPage(1); }}
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-medium transition-colors border",
              fulfilmentType === opt.value
                ? "border-brand-accent/50 bg-brand-accent/10 text-brand-accent"
                : "border-white/5 bg-brand-charcoal text-brand-smoke hover:border-white/10",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="No orders found"
          description={
            search || status || source || fulfilmentType
              ? "Try adjusting your filters."
              : "Orders from POS, website, campaigns, and direct sales will appear here."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-brand-graphite/40">
                {[
                  "Order",
                  "Customer",
                  "Source",
                  "Total",
                  "Paid",
                  "Outstanding",
                  "Type",
                  "Status",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-brand-smoke"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((o) => {
                const isOverdue =
                  o.amount_outstanding > 0 && o.status === "fulfilled";
                const sourceLabel =
                  o.source && SOURCE_LABELS[o.source as OrderSource]
                    ? SOURCE_LABELS[o.source as OrderSource]
                    : "—";
                return (
                  <tr
                    key={o.order_id}
                    onClick={() => navigate(`/sales/orders/${o.order_id}`)}
                    className="cursor-pointer bg-brand-charcoal transition-colors hover:bg-brand-graphite/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium text-brand-accent">
                      {o.order_number}
                    </td>
                    <td className="px-4 py-3 font-medium text-brand-cream">
                      {o.contact_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-brand-graphite/60 px-2 py-0.5 text-[10px] font-medium tracking-wide text-brand-smoke">
                        {sourceLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-brand-cream">
                      {fmtMoney(o.total_amount, currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-brand-cloud">
                      {fmtMoney(o.amount_paid, currency)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 tabular-nums font-medium",
                        isOverdue ? "text-red-400" : "text-brand-cloud",
                      )}
                    >
                      {fmtMoney(o.amount_outstanding, currency)}
                    </td>
                    <td className="px-4 py-3 text-xs text-brand-smoke">
                      {FULFILMENT_LABELS[o.fulfilment_type]}
                    </td>
                    <td className="px-4 py-3">
                      <SalesStatusBadge
                        entity="order"
                        status={o.status}
                        size="sm"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {o.status === "pending_proof" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              approveProof.mutate(o.order_id);
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-green-900/20 px-2 py-0.5 text-[10px] font-medium text-green-400 hover:bg-green-900/30 transition-colors"
                            title="Approve campaign proof"
                          >
                            <CheckCircle className="h-3 w-3" />
                            Approve
                          </button>
                        )}
                        <span className="text-xs text-brand-smoke">
                          {fmtDate(o.created_at)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="flex justify-center gap-3 pt-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="flex items-center text-xs text-brand-smoke">
            Page {page}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
