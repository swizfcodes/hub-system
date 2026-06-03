import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import {
  Search,
  LayoutGrid,
  History,
  Truck,
  Lock,
  ClipboardCheck,
  BellRing,
  MapPin,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Checkbox } from "@components/ui/Checkbox";
import { Tabs } from "@components/ui/Tabs";
import { ByProductView } from "@components/stock/views/ByProductView";
import { ByLocationView } from "@components/stock/views/ByLocationView";
import { MovementLogView } from "@components/stock/views/MovementLogView";
import { StockKpiStrip } from "@components/stock/shared/StockKpiStrip";
import { AdjustmentModal } from "@components/stock/modals/AdjustmentModal";
import { listOnHand } from "@services/stock/onHand";
import { listLocations } from "@services/catalogue/locations";
import { listCategories } from "@services/catalogue/categories";
import { listReservations } from "@services/stock/reservations";
import { listTransfers } from "@services/stock/transfers";
import { listQCs } from "@services/stock/quality";
import { MOVEMENT_TYPE_META } from "@lib/constants/stockMovementTypes";
import type { MovementType } from "@typedefs/stock";

type View = "product" | "location" | "movements";

export default function StockHome() {
  const { active: business } = useActiveBusiness();
  const navigate = useNavigate();

  const [view, setView] = useState<View>(
    () => (localStorage.getItem("orika_stock_view") as View) || "product",
  );
  useEffect(() => {
    localStorage.setItem("orika_stock_view", view);
  }, [view]);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [movementType, setMovementType] = useState<MovementType | "">("");
  const [movFrom, setMovFrom] = useState("");
  const [movTo, setMovTo] = useState("");

  // Modals
  const [adjustingProductId, setAdjustingProductId] = useState<string | null>(
    null,
  );

  // Data
  const { data: onHand, isLoading } = useQuery({
    queryKey: [
      "stock",
      "on-hand",
      business,
      {
        search,
        category_id: categoryFilter,
        location_id: locationFilter,
        low_stock_only: lowStockOnly,
      },
    ],
    queryFn: () =>
      listOnHand({
        search: search || undefined,
        category_id: categoryFilter || undefined,
        location_id: locationFilter || undefined,
        low_stock_only: lowStockOnly || undefined,
        limit: 200,
      }),
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["catalogue", "locations"],
    queryFn: () => listLocations(false),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["catalogue", "categories"],
    queryFn: () => listCategories(false),
  });

  // KPI strip data (cheap parallel fetches; small responses)
  const { data: reservations } = useQuery({
    queryKey: ["stock", "reservations", "active"],
    queryFn: () => listReservations({ status: "active", limit: 200 }),
  });
  const { data: transfers } = useQuery({
    queryKey: ["stock", "transfers", "open", business],
    queryFn: () => listTransfers(),
  });
  const { data: qcs } = useQuery({
    queryKey: ["stock", "qcs", "all", business],
    queryFn: () => listQCs(),
  });

  const rows = onHand?.data ?? [];
  const totals = onHand?.totals;

  const movementTypeOptions = useMemo(
    () => [
      { value: "", label: "All movement types" },
      ...Object.values(MOVEMENT_TYPE_META).map((m) => ({
        value: m.key,
        label: `${m.direction === 1 ? "↓" : "↑"} ${m.label}`,
      })),
    ],
    [],
  );

  return (
    <>
      <Topbar title="Stock" subtitle="Inventory across locations" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
        <PageHeader
          title="Stock"
          subtitle="On-hand quantities, movement history, reservations, transfers and adjustments. Every entry and exit is recorded in the append-only ledger."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Stock" }]}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="md"
                leftIcon={<BellRing className="w-4 h-4" />}
                onClick={() => navigate("/stock/alerts")}
              >
                Alerts
              </Button>
              <Button
                variant="secondary"
                size="md"
                leftIcon={<Truck className="w-4 h-4" />}
                onClick={() => navigate("/stock/transfers")}
              >
                Transfers
              </Button>
              <Button
                variant="secondary"
                size="md"
                leftIcon={<Lock className="w-4 h-4" />}
                onClick={() => navigate("/stock/reservations")}
              >
                Reservations
              </Button>
              <Button
                variant="gold"
                size="md"
                leftIcon={<ClipboardCheck className="w-4 h-4" />}
                onClick={() => navigate("/stock/count")}
              >
                New count
              </Button>
            </div>
          }
        />

        <StockKpiStrip
          loading={isLoading}
          totalValue={totals?.total_value}
          totalUnits={totals?.total_units}
          lowStockCount={totals?.low_stock_count}
          outOfStockCount={totals?.out_of_stock_count}
          activeReservations={reservations?.data?.length}
          pendingTransfers={
            (transfers?.data ?? []).filter(
              (t) => t.status !== "received" && t.status !== "cancelled",
            ).length
          }
          pendingQC={
            (qcs?.data ?? []).filter((q) => q.result === "conditional").length
          }
        />

        {/* View switcher */}
        <Tabs
          variant="pill"
          tabs={[
            {
              key: "product",
              label: "By Product",
              icon: <LayoutGrid className="w-3.5 h-3.5" />,
            },
            {
              key: "location",
              label: "By Location",
              icon: <MapPin className="w-3.5 h-3.5" />,
            },
            {
              key: "movements",
              label: "Movement Log",
              icon: <History className="w-3.5 h-3.5" />,
            },
          ]}
          active={view}
          onChange={(k) => setView(k as View)}
          className="mb-5"
        />

        {/* Filters */}
        <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] items-end">
          <Input
            surface="dark"
            placeholder="Search by name, SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
          {view !== "movements" && (
            <Select
              surface="dark"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: "", label: "All categories" },
                ...categories.map((c) => ({
                  value: c.category_id,
                  label: c.name,
                })),
              ]}
            />
          )}
          <Select
            surface="dark"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            options={[
              { value: "", label: "All locations" },
              ...locations.map((l) => ({
                value: l.location_id,
                label: l.name,
              })),
            ]}
          />
          {view !== "movements" ? (
            <Checkbox
              surface="dark"
              checked={lowStockOnly}
              onChange={setLowStockOnly}
              label="Low stock only"
            />
          ) : (
            <Select
              surface="dark"
              value={movementType}
              onChange={(e) =>
                setMovementType(e.target.value as MovementType | "")
              }
              options={movementTypeOptions}
            />
          )}
        </div>

        {view === "movements" && (
          <div className="mb-5 grid gap-3 sm:grid-cols-2 max-w-md">
            <Input
              surface="dark"
              type="date"
              label="From"
              value={movFrom}
              onChange={(e) => setMovFrom(e.target.value)}
            />
            <Input
              surface="dark"
              type="date"
              label="To"
              value={movTo}
              onChange={(e) => setMovTo(e.target.value)}
            />
          </div>
        )}

        {/* Views */}
        {view === "product" && (
          <ByProductView
            rows={rows}
            loading={isLoading}
            onAdjust={setAdjustingProductId}
          />
        )}
        {view === "location" && (
          <ByLocationView
            rows={rows}
            locations={locations}
            loading={isLoading}
          />
        )}
        {view === "movements" && (
          <MovementLogView
            filters={{
              product_id: undefined,
              location_id: locationFilter || undefined,
              movement_type: movementType || undefined,
              from: movFrom || undefined,
              to: movTo || undefined,
            }}
          />
        )}
      </div>

      <AdjustmentModal
        open={!!adjustingProductId}
        onClose={() => setAdjustingProductId(null)}
        productId={adjustingProductId ?? undefined}
      />
    </>
  );
}
