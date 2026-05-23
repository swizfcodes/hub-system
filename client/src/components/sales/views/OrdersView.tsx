import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Package, Search } from 'lucide-react';
import { useActiveBusiness } from '@hooks/useActiveBusiness';
import { listOrders } from '@services/sales/orders';
import { SalesStatusBadge } from '@components/sales/shared/SalesStatusBadge';
import { Input } from '@components/ui/Input';
import { Skeleton } from '@components/ui/Skeleton';
import { EmptyState } from '@components/ui/EmptyState';
import { fmtMoney, fmtDate } from '@lib/format';
import { ORDER_FILTER_OPTIONS, FULFILMENT_LABELS } from '@lib/constants/salesConstants';
import { cn } from '@lib/cn';

export function OrdersView() {
  const navigate  = useNavigate();
  const { currency } = useActiveBusiness();

  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sales-orders', { status }],
    queryFn:  () => listOrders({ status: status || undefined, limit: 50 }),
  });

  const rows = data?.data ?? [];

  const filtered = search
    ? rows.filter(
        (o) =>
          o.order_number.toLowerCase().includes(search.toLowerCase()) ||
          (o.contact_name ?? '').toLowerCase().includes(search.toLowerCase()),
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
              onClick={() => setStatus(opt.value)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                status === opt.value
                  ? 'bg-orika-gold text-orika-black'
                  : 'bg-orika-graphite text-orika-cloud hover:bg-orika-graphite/80',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-orika-smoke" />
          <Input
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-sm w-44 sm:w-56"
          />
        </div>
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
            search || status
              ? 'Try adjusting your filters.'
              : 'Confirmed quotations will appear here as orders.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-orika-graphite/40">
                {['Order', 'Customer', 'Total', 'Paid', 'Outstanding', 'Type', 'Status', ''].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-orika-smoke"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((o) => {
                const isOverdue =
                  o.amount_outstanding > 0 && o.status === 'fulfilled';
                return (
                  <tr
                    key={o.order_id}
                    onClick={() => navigate(`/sales/orders/${o.order_id}`)}
                    className="cursor-pointer bg-orika-charcoal transition-colors hover:bg-orika-graphite/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium text-orika-gold">
                      {o.order_number}
                    </td>
                    <td className="px-4 py-3 font-medium text-orika-cream">
                      {o.contact_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-orika-cream">
                      {fmtMoney(o.total_amount, currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-orika-cloud">
                      {fmtMoney(o.amount_paid, currency)}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 tabular-nums font-medium',
                        isOverdue ? 'text-red-400' : 'text-orika-cloud',
                      )}
                    >
                      {fmtMoney(o.amount_outstanding, currency)}
                    </td>
                    <td className="px-4 py-3 text-xs text-orika-smoke">
                      {FULFILMENT_LABELS[o.fulfilment_type]}
                    </td>
                    <td className="px-4 py-3">
                      <SalesStatusBadge entity="order" status={o.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-orika-smoke">
                      {fmtDate(o.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
