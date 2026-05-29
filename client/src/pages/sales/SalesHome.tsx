import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@components/ui/PageHeader';
import { Tabs } from '@components/ui/Tabs';
import { SalesKpiStrip } from '@components/sales/shared/SalesKpiStrip';
import { QuotationsView } from '@components/sales/views/QuotationsView';
import { OrdersView } from '@components/sales/views/OrdersView';
import { getSalesKpis } from '@services/sales/quotations';
import { useActiveBusiness } from '@hooks/useActiveBusiness';
import { Topbar } from '@/components/shell/Topbar';

const TABS = [
  { key: 'quotations', label: 'Quotations' },
  { key: 'orders',     label: 'Orders'     },
];

type TabKey = 'quotations' | 'orders';

export default function SalesHome() {
  const [activeTab, setActiveTab] = useState<TabKey>('quotations');
  const { currency } = useActiveBusiness();

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['sales-kpis'],
    queryFn:  getSalesKpis,
    staleTime: 60_000,
  });

  return (
    <>
      <Topbar title="Sales" subtitle="Quotations · Orders" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Sales"
          subtitle=" All quotations and orders."
          crumbs={[{ label: 'Hub', to: '/' }, { label: 'Sales' }]}
        />

      <SalesKpiStrip kpis={kpis} isLoading={kpisLoading} currency={currency} />

      <Tabs
        tabs={TABS}
        active={activeTab}
        onChange={(k) => setActiveTab(k as TabKey)}
      />

      <div className="min-h-[300px]">
        {activeTab === 'quotations' ? <QuotationsView /> : <OrdersView />}
      </div>
    </div>
    </>
  );
}
