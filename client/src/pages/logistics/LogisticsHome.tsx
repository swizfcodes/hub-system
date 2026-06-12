import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Eye, Rocket, Package, Search } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Tabs } from "@components/ui/Tabs";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import {
  DeliveryStatusBadge,
  CourierBadge,
} from "@components/logistics/shared/DeliveryStatusBadge";
import { CreateDeliveryModal } from "@/components/logistics/modals/CreateDeliveryModal";
import { DispatchModal } from "@/components/logistics/modals/DispatchModal";
import { listDeliveries, packingSlipUrl } from "@services/logistics";
import { LOGISTICS_TABS } from "@lib/constants/logisticsConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtDateTime } from "@lib/format";
import type { Delivery } from "@typedefs/logistics";
import { Topbar } from "@/components/shell/Topbar";

const ACTIVE_STATUSES = new Set(["dispatched", "picked_up", "in_transit"]);
const FAILED_STATUSES = new Set(["failed", "returned"]);

function filterForTab(deliveries: Delivery[], tab: string): Delivery[] {
  if (tab === "pending")
    return deliveries.filter((d) => d.status === "pending_dispatch");
  if (tab === "active")
    return deliveries.filter((d) => ACTIVE_STATUSES.has(d.status));
  if (tab === "delivered")
    return deliveries.filter((d) => d.status === "delivered");
  if (tab === "failed")
    return deliveries.filter((d) => FAILED_STATUSES.has(d.status));
  return deliveries;
}

export default function LogisticsHome() {
  const navigate = useNavigate();
  const { currency } = useActiveBusiness();

  const [activeTab, setActiveTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [dispatching, setDispatching] = useState<Delivery | null>(null);

  // ONE query for all statuses — tabs and badges filter client-side.
  // (Per-tab queries made the badge counts wrong: each tab only saw its
  // own slice, so the other tabs' counts read zero.)
  const { data, isLoading } = useQuery({
    queryKey: ["deliveries", search],
    queryFn: () => listDeliveries({ limit: 200, search: search || undefined }),
    refetchInterval: 30_000,
  });

  const allData = data?.data ?? [];
  const deliveries = filterForTab(allData, activeTab);

  const counts = {
    pending: allData.filter((d) => d.status === "pending_dispatch").length,
    active: allData.filter((d) => ACTIVE_STATUSES.has(d.status)).length,
    failed: allData.filter((d) => FAILED_STATUSES.has(d.status)).length,
  };

  const tabsWithBadges = LOGISTICS_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    badge:
      t.key === "pending" && counts.pending > 0
        ? counts.pending
        : t.key === "active" && counts.active > 0
          ? counts.active
          : t.key === "failed" && counts.failed > 0
            ? counts.failed
            : undefined,
  }));

  return (
    <>
      <Topbar title="Logistics" subtitle="Dispatch · Delivery" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Logistics"
          subtitle="Dispatch queue, tracking, and proof of delivery."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Logistics" }]}
          actions={
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              New Delivery
            </Button>
          }
        />

        {/* Tabs + search */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            tabs={tabsWithBadges}
            active={activeTab}
            onChange={setActiveTab}
            surface="dark"
            variant="underline"
          />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-smoke/50" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search number, customer, driver…"
              className="w-64 rounded-xl border border-white/5 bg-brand-charcoal py-2 pl-8 pr-3 text-xs text-brand-cream placeholder-brand-smoke/40 focus:border-brand-accent/30 focus:outline-none"
            />
          </div>
        </div>

        {/* Delivery list */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : deliveries.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="mx-auto h-10 w-10 text-brand-smoke/40 mb-3" />
            <p className="text-sm text-brand-smoke">
              {search
                ? "No deliveries match your search."
                : activeTab === "pending"
                  ? "No deliveries awaiting dispatch."
                  : "Nothing here yet."}
            </p>
            {activeTab === "pending" && !search && (
              <Button
                variant="ghost"
                className="mt-4"
                onClick={() => setShowCreate(true)}
              >
                Create a delivery
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-brand-charcoal">
                  {[
                    "Delivery",
                    "Customer",
                    "Courier / Driver",
                    "Created",
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
                {deliveries.map((delivery) => (
                  <tr
                    key={delivery.delivery_id}
                    onClick={() => navigate(`/logistics/${delivery.delivery_id}`)}
                    className="bg-brand-charcoal hover:bg-brand-graphite/20 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-brand-accent">
                        {delivery.delivery_number}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-brand-cream">
                        {delivery.contact_name}
                      </p>
                      {delivery.primary_phone && (
                        <p className="text-xs text-brand-smoke">
                          {delivery.primary_phone}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {delivery.courier_company ? (
                        <>
                          <p className="text-brand-cream text-xs font-medium">
                            {delivery.courier_company}
                          </p>
                          {delivery.driver_name && (
                            <p className="text-xs text-brand-smoke">
                              {delivery.driver_name}
                              {delivery.driver_phone
                                ? ` · ${delivery.driver_phone}`
                                : ""}
                            </p>
                          )}
                        </>
                      ) : (
                        <CourierBadge courier={delivery.courier} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-brand-smoke">
                      {fmtDateTime(delivery.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <DeliveryStatusBadge status={delivery.status} size="xs" />
                    </td>
                    <td
                      className="px-4 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          title="View"
                          onClick={() =>
                            navigate(`/logistics/${delivery.delivery_id}`)
                          }
                          className="text-brand-smoke hover:text-brand-accent transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {delivery.status === "pending_dispatch" && (
                          <button
                            title="Dispatch"
                            onClick={() => setDispatching(delivery)}
                            className="text-brand-smoke hover:text-green-400 transition-colors"
                          >
                            <Rocket className="h-4 w-4" />
                          </button>
                        )}
                        {["pending_dispatch", "dispatched"].includes(
                          delivery.status,
                        ) && (
                          <a
                            href={packingSlipUrl(delivery.delivery_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Packing Slip"
                            className="text-brand-smoke hover:text-brand-accent transition-colors"
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

        {/* Dispatch — enter the booked ride's driver details */}
        {dispatching && (
          <DispatchModal
            open={!!dispatching}
            onClose={() => setDispatching(null)}
            delivery={dispatching}
          />
        )}
      </div>
    </>
  );
}
