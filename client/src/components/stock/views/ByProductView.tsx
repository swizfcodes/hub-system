import { useNavigate } from "react-router-dom";
import { Package } from "lucide-react";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { Button } from "@components/ui/Button";
import { ProductImage } from "@components/catalogue/shared/ProductImage";
import { StockLevelBadge } from "../shared/StockLevelBadge";
import { fmtMoney } from "@lib/format";
import type { OnHandRow } from "@typedefs/stock";
import { cn } from "@lib/cn";

interface Props {
  rows: OnHandRow[];
  loading?: boolean;
  onAdjust?: (productId: string) => void;
}

export function ByProductView({ rows, loading, onAdjust }: Props) {
  const navigate = useNavigate();

  if (loading)
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Package className="w-6 h-6" />}
        title="No stock items"
        description="Once goods are received against a PO, on-hand quantities appear here."
      />
    );
  }

  return (
    <div className="rounded-2xl border border-brand-graphite bg-brand-charcoal/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-charcoal border-b border-brand-graphite">
            <tr>
              <Th>Product</Th>
              <Th>Category</Th>
              <Th className="text-right">On hand</Th>
              <Th className="text-right">Reserved</Th>
              <Th className="text-right">Available</Th>
              <Th className="text-right">Reorder at</Th>
              <Th className="text-right">Unit value</Th>
              <Th className="text-right">Total value</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const totalValue = (r.cost_price ?? 0) * r.on_hand;
              return (
                <tr
                  key={r.product_id}
                  className="border-b border-brand-graphite/40 hover:bg-brand-charcoal cursor-pointer"
                  onClick={() => navigate(`/catalogue/${r.product_id}`)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <ProductImage
                        product={{
                          name: r.product_name,
                          primary_image_url: r.primary_image_url,
                        }}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="text-brand-cream truncate">
                          {r.product_name}
                        </div>
                        <div className="text-[0.6rem] font-mono text-brand-smoke">
                          {r.product_sku}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-brand-cloud">
                    {r.category_name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <StockLevelBadge
                      onHand={r.on_hand}
                      reorderLevel={r.reorder_level}
                      compact
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-brand-smoke">
                    {r.reserved}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-mono",
                      r.available <= 0
                        ? "text-state-danger"
                        : "text-brand-cream",
                    )}
                  >
                    {r.available}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-brand-smoke">
                    {r.reorder_level}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-brand-cream">
                    {fmtMoney(r.cost_price, r.currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-brand-accent">
                    {fmtMoney(totalValue, r.currency)}
                  </td>
                  <td
                    className="px-2 py-2 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onAdjust && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onAdjust(r.product_id)}
                      >
                        Adjust
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-left text-[0.6rem] tracking-widest uppercase text-brand-smoke font-semibold",
        className,
      )}
    >
      {children}
    </th>
  );
}
