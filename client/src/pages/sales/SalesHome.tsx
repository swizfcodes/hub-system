import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@components/ui/PageHeader";
import { Tabs } from "@components/ui/Tabs";
import { SalesKpiStrip } from "@components/sales/shared/SalesKpiStrip";
import { QuotationsView } from "@components/sales/views/QuotationsView";
import { OrdersView } from "@components/sales/views/OrdersView";
import { getSalesKpis } from "@services/sales/quotations";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { Topbar } from "@/components/shell/Topbar";

const TABS = [
  { key: "orders", label: "Orders" },
  { key: "quotations", label: "B2B Quotations" },
];

type TabKey = "quotations" | "orders";

export default function SalesHome() {
  const [activeTab, setActiveTab] = useState<TabKey>("orders");
  const { currency } = useActiveBusiness();

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ["sales-kpis"],
    queryFn: getSalesKpis,
    staleTime: 60_000,
  });

  return (
    <>
      <Topbar title="Sales" subtitle="Orders · B2B Quotations" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Sales"
          subtitle="All orders and B2B quotations."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Sales" }]}
        />

        <SalesKpiStrip
          kpis={kpis}
          isLoading={kpisLoading}
          currency={currency}
        />

        <Tabs
          tabs={TABS}
          active={activeTab}
          onChange={(k) => setActiveTab(k as TabKey)}
        />

        <div className="min-h-[300px]">
          {activeTab === "orders" ? <OrdersView /> : <QuotationsView />}
        </div>
      </div>
    </>
  );
}
