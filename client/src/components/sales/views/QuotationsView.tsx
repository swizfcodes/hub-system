import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { listQuotations } from "@services/sales/quotations";
import { SalesStatusBadge } from "@components/sales/shared/SalesStatusBadge";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { fmtMoney, fmtDate } from "@lib/format";
import { QUOTE_FILTER_OPTIONS } from "@lib/constants/salesConstants";
import { QuoteFormModal } from "@components/sales/modals/QuoteFormModal";
import { cn } from "@lib/cn";

export function QuotationsView() {
  const navigate = useNavigate();
  const { currency } = useActiveBusiness();

  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["quotations", { status }],
    queryFn: () => listQuotations({ status: status || undefined, limit: 50 }),
  });

  const rows = data?.data ?? [];

  const filtered = search
    ? rows.filter(
        (q) =>
          q.quotation_number.toLowerCase().includes(search.toLowerCase()) ||
          (q.contact_name ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : rows;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2">
          {QUOTE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                status === opt.value
                  ? "bg-orika-gold text-orika-black"
                  : "bg-orika-graphite text-orika-cloud hover:bg-orika-graphite/80",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-orika-smoke" />
            <Input
              placeholder="Search quotes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-sm w-44 sm:w-56"
            />
          </div>
          <Button onClick={() => setShowNew(true)} size="sm">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Quote</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="No quotations found"
          description={
            search || status
              ? "Try adjusting your filters."
              : "Create your first quotation to get started."
          }
          action={
            !search && !status ? (
              <Button onClick={() => setShowNew(true)} size="sm">
                <Plus className="h-4 w-4" />
                New Quote
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-orika-graphite/40">
                {[
                  "Number",
                  "Customer",
                  "Amount",
                  "Valid Until",
                  "Status",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-orika-smoke"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((q) => (
                <tr
                  key={q.quotation_id}
                  onClick={() =>
                    navigate(`/sales/quotations/${q.quotation_id}`)
                  }
                  className="cursor-pointer bg-orika-charcoal transition-colors hover:bg-orika-graphite/30"
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-orika-gold">
                    {q.quotation_number}
                  </td>
                  <td className="px-4 py-3 font-medium text-orika-cream">
                    {q.contact_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-orika-cream">
                    {fmtMoney(q.total_amount, q.currency ?? currency)}
                  </td>
                  <td className="px-4 py-3 text-orika-cloud">
                    {fmtDate(q.valid_until)}
                  </td>
                  <td className="px-4 py-3">
                    <SalesStatusBadge
                      entity="quotation"
                      status={q.status}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-orika-smoke">
                    {fmtDate(q.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <QuoteFormModal
          open={showNew}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            navigate(`/sales/quotations/${id}`);
          }}
        />
      )}
    </div>
  );
}
