import { useState, useMemo } from "react";
import { MapPin, Package } from "lucide-react";
import { Card } from "@components/ui/Card";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { ProductImage } from "@components/catalogue/shared/ProductImage";
import { StockLevelBadge } from "../shared/StockLevelBadge";
import type { OnHandRow } from "@typedefs/stock";
import type { StockLocation } from "@typedefs/catalogue";
import { cn } from "@lib/cn";

interface Props {
  rows: OnHandRow[];
  locations: StockLocation[];
  loading?: boolean;
}

export function ByLocationView({ rows, locations, loading }: Props) {
  const [activeLocation, setActiveLocation] = useState<string | null>(null);

  // Group rows by location.
  const byLocation = useMemo(() => {
    const grouped: Record<string, Array<{ row: OnHandRow; qty: number }>> = {};
    for (const r of rows) {
      for (const loc of r.by_location ?? []) {
        if (!grouped[loc.location_id]) grouped[loc.location_id] = [];
        grouped[loc.location_id].push({ row: r, qty: loc.on_hand });
      }
    }
    return grouped;
  }, [rows]);

  if (loading)
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  if (locations.length === 0) {
    return (
      <EmptyState
        icon={<MapPin className="w-6 h-6" />}
        title="No locations defined"
        description="Add warehouses, showrooms, or POS terminals in Catalogue → Locations first."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
      <aside className="space-y-2">
        {locations.map((loc) => {
          const items = byLocation[loc.location_id] ?? [];
          const totalUnits = items.reduce((s, it) => s + it.qty, 0);
          const active = activeLocation === loc.location_id;
          return (
            <button
              key={loc.location_id}
              onClick={() => setActiveLocation(loc.location_id)}
              className={cn(
                "w-full text-left p-3 rounded-xl border transition-all",
                active
                  ? "bg-brand-charcoal border-brand-accent/40"
                  : "bg-transparent border-brand-graphite hover:bg-brand-charcoal/60",
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-3.5 h-3.5 text-brand-accent" />
                <span className="font-medium text-sm text-brand-cream truncate">
                  {loc.name}
                </span>
              </div>
              <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
                {loc.location_type.replace("_", " ")}
              </div>
              <div className="text-[0.65rem] text-brand-cloud mt-1">
                {items.length} SKU · {totalUnits} units
              </div>
            </button>
          );
        })}
      </aside>

      <section>
        {!activeLocation ? (
          <Card className="p-12 text-center">
            <MapPin className="w-7 h-7 text-brand-smoke mx-auto mb-3" />
            <p className="text-sm text-brand-smoke">
              Pick a location to see what's there.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {(byLocation[activeLocation] ?? []).map(({ row, qty }) => (
              <Card
                key={row.product_id}
                className="p-3 flex items-center gap-3"
              >
                <ProductImage
                  product={{
                    name: row.product_name,
                    primary_image_url: row.primary_image_url,
                  }}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-brand-cream truncate">
                    {row.product_name}
                  </div>
                  <div className="text-[0.6rem] font-mono text-brand-smoke">
                    {row.product_sku}
                  </div>
                </div>
                <StockLevelBadge
                  onHand={qty}
                  reorderLevel={row.reorder_level}
                  compact
                />
              </Card>
            ))}
            {(byLocation[activeLocation] ?? []).length === 0 && (
              <EmptyState
                icon={<Package className="w-6 h-6" />}
                title="No stock at this location"
                description="When stock arrives or transfers in, products appear here."
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
