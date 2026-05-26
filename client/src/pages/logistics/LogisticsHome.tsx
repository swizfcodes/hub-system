import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Rocket, Package } from 'lucide-react';
import { PageHeader } from '@components/ui/PageHeader';
import { Tabs } from '@components/ui/Tabs';
import { Button } from '@components/ui/Button';
import { Skeleton } from '@components/ui/Skeleton';
import { DeliveryStatusBadge, CourierBadge } from '@components/logistics/shared/DeliveryStatusBadge';
import { CreateDeliveryModal } from '@/components/logistics/modals/CreateDeliveryModal';
import { listDeliveries, dispatchDelivery, packingSlipUrl } from '@services/logistics';
import { LOGISTICS_TABS } from '@lib/constants/logisticsConstants';
import { useActiveBusiness } from '@hooks/useActiveBusiness';
import { fmtDateTime } from '@lib/format';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';
import { cn } from '@lib/cn';
import type { Delivery } from '@typedefs/logistics';

// Tab → status filter mapping
const TAB_STATUS_MAP: Record<string, string | undefined> = {
  pending:   'pending_dispatch',
  active:    undefined,   // filter client-side
  delivered: 'delivered',
  failed:    undefined,   // filter client-side
};

const ACTIVE_STATUSES  = new Set(['dispatched', 'picked_up', 'in_transit']);
const FAILED_STATUSES  = new Set(['failed', 'returned']);

function filterForTab(deliveries: Delivery[], tab: string): Delivery[] {
  if (tab === 'active')  return deliveries.filter((d) => ACTIVE_STATUSES.has(d.status));
  if (tab === 'failed')  return deliveries.filter((d) => FAILED_STATUSES.has(d.status));
  return deliveries;
}

export default function LogisticsHome() {
  const navigate         = useNavigate();
  const qc               = useQueryClient();
  const { currency }     = useActiveBusiness();

  const [activeTab,   setActiveTab]   = useState('pending');
  const [showCreate,  setShowCreate]  = useState(false);
  const [dispatching, setDispatching] = useState<string | null>(null);

  // Fetch all deliveries — tabs filter client-side to avoid multiple queries
  const { data, isLoading } = useQuery({
    queryKey: ['deliveries', activeTab],
    queryFn:  () => {
      const status = TAB_STATUS_MAP[activeTab];
      return listDeliveries({ status, limit: 100 });
    },
    refetchInterval: 30_000,
  });

  const deliveries = filterForTab(data?.data ?? [], activeTab);

  const dispatchMutation = useMutation({
    mutationFn: dispatchDelivery,
    onSuccess: (delivery) => {
      showToast.success(`${delivery.delivery_number} dispatched — WhatsApp sent`);
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      setDispatching(null);
    },
    onError: (err) => {
      showToast.error(errMsg(err));
      setDispatching(null);
    },
  });

  function handleDispatch(deliveryId: string) {
    setDispatching(deliveryId);
    dispatchMutation.mutate(deliveryId);
  }

  // Count badges for tabs
  const allData        = data?.data ?? [];
  const pendingCount   = allData.filter((d) => d.status === 'pending_dispatch').length;
  const activeCount    = allData.filter((d) => ACTIVE_STATUSES.has(d.status)).length;
  const failedCount    = allData.filter((d) => FAILED_STATUSES.has(d.status)).length;

  const tabsWithBadges = LOGISTICS_TABS.map((t) => ({
    key:   t.key,
    label: t.label,
    badge: t.key === 'pending' && pendingCount > 0 ? pendingCount
         : t.key === 'active'  && activeCount  > 0 ? activeCount
         : t.key === 'failed'  && failedCount  > 0 ? failedCount
         : undefined,
  }));

  return (
    <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Logistics"
        subtitle="Dispatch queue, tracking, and proof of delivery."
        crumbs={[{ label: 'Logistics' }]}
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            New Delivery
          </Button>
        }
      />

      {/* Tabs */}
      <Tabs
        tabs={tabsWithBadges}
        active={activeTab}
        onChange={setActiveTab}
        surface="dark"
        variant="underline"
      />

      {/* Delivery list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : deliveries.length === 0 ? (
        <div className="py-16 text-center">
          <Package className="mx-auto h-10 w-10 text-orika-smoke/40 mb-3" />
          <p className="text-sm text-orika-smoke">
            {activeTab === 'pending' ? 'No deliveries awaiting dispatch.' : 'Nothing here yet.'}
          </p>
          {activeTab === 'pending' && (
            <Button variant="ghost" className="mt-4" onClick={() => setShowCreate(true)}>
              Create a delivery
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/5">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-orika-charcoal">
                {['Delivery', 'Customer', 'Courier', 'Created', 'Status', ''].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-widest text-orika-smoke"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {deliveries.map((delivery) => (
                <tr
                  key={delivery.delivery_id}
                  className="bg-orika-charcoal hover:bg-orika-graphite/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/logistics/${delivery.delivery_id}`)}
                      className="font-mono text-xs font-semibold text-orika-gold hover:underline"
                    >
                      {delivery.delivery_number}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-orika-cream">{delivery.contact_name}</p>
                    {delivery.primary_phone && (
                      <p className="text-xs text-orika-smoke">{delivery.primary_phone}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <CourierBadge courier={delivery.courier} />
                  </td>
                  <td className="px-4 py-3 text-orika-smoke">
                    {fmtDateTime(delivery.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <DeliveryStatusBadge status={delivery.status} size="xs" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        title="View"
                        onClick={() => navigate(`/logistics/${delivery.delivery_id}`)}
                        className="text-orika-smoke hover:text-orika-gold transition-colors"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {delivery.status === 'pending_dispatch' && (
                        <button
                          title="Dispatch"
                          onClick={() => handleDispatch(delivery.delivery_id)}
                          disabled={dispatching === delivery.delivery_id}
                          className={cn(
                            'text-orika-smoke hover:text-green-400 transition-colors',
                            dispatching === delivery.delivery_id && 'opacity-40 cursor-not-allowed',
                          )}
                        >
                          <Rocket className="h-4 w-4" />
                        </button>
                      )}
                      {['pending_dispatch', 'dispatched'].includes(delivery.status) && (
                        <a
                          href={packingSlipUrl(delivery.delivery_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Packing Slip"
                          className="text-orika-smoke hover:text-orika-gold transition-colors"
                        >
                          <Package className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create delivery modal */}
      <CreateDeliveryModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => {
          setShowCreate(false);
          navigate(`/logistics/${id}`);
        }}
        currency={currency}
      />
    </div>
  );
}
