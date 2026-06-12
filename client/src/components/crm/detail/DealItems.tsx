import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Package, Plus, ArrowUpRight } from "lucide-react";
import { Button } from "@components/ui/Button";
import { EmptyState } from "@components/ui/EmptyState";
import { Skeleton } from "@components/ui/Skeleton";
import { SalesStatusBadge } from "@components/sales/shared/SalesStatusBadge";
import { QuoteFormModal } from "@components/sales/modals/QuoteFormModal";
import { listQuotations } from "@services/sales/quotations";
import { fmtMoney, fmtDate } from "@lib/format";
import { useActiveBusiness } from "@hooks/useActiveBusiness";

export function DealItems({
  dealId,
  contactId,
  contactName,
}: {
  dealId: string;
  contactId: string;
  contactName?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currency } = useActiveBusiness();
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["deal-quotations", dealId],
    queryFn: () => listQuotations({ deal_id: dealId, limit: 50 }),
    enabled: !!dealId,
  });

  const quotations = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent inline-flex items-center gap-2">
          <Package className="w-3.5 h-3.5" /> Items & Quotations
        </h3>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setShowNew(true)}
        >
          New quotation
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : quotations.length === 0 ? (
        <EmptyState
          icon={<Package className="w-6 h-6" />}
          title="No quotations yet"
          description="Create a quotation to lock in items, totals, and validity — then confirm it to convert this deal into a sales order."
          action={
            <Button
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setShowNew(true)}
            >
              Create quotation
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-brand-graphite/40">
                {["Number", "Amount", "Valid Until", "Status", ""].map((h) => (
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
              {quotations.map((q) => (
                <tr
                  key={q.quotation_id}
                  onClick={() =>
                    navigate(`/sales/quotations/${q.quotation_id}`)
                  }
                  className="cursor-pointer bg-brand-charcoal transition-colors hover:bg-brand-graphite/30"
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-brand-accent">
                    {q.quotation_number}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-brand-cream">
                    {fmtMoney(q.total_amount, q.currency ?? currency)}
                  </td>
                  <td className="px-4 py-3 text-brand-cloud">
                    {fmtDate(q.valid_until)}
                  </td>
                  <td className="px-4 py-3">
                    <SalesStatusBadge
                      entity="quotation"
                      status={q.status}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ArrowUpRight className="w-3.5 h-3.5 text-brand-smoke inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuoteFormModal
        open={showNew}
        onClose={() => setShowNew(false)}
        prefill={{
          contact_id: contactId,
          contact_name: contactName ?? "",
          deal_id: dealId,
        }}
        onCreated={(id) => {
          setShowNew(false);
          queryClient.invalidateQueries({
            queryKey: ["deal-quotations", dealId],
          });
          navigate(`/sales/quotations/${id}`);
        }}
      />
    </div>
  );
}
