import { useNavigate } from "react-router-dom";
import { Tag, AlertCircle } from "lucide-react";
import { ProductImage } from "./ProductImage";
import { ProductPrice } from "./ProductPrice";
import { Badge } from "@components/ui/Badge";
import type { Product } from "@typedefs/catalogue";

interface Props {
  product: Product;
  index?: number;
}

export function ProductCard({ product, index = 0 }: Props) {
  const navigate = useNavigate();
  return (
    <article
      onClick={() => navigate(`/catalogue/${product.product_id}`)}
      style={{ animationDelay: `${index * 30}ms` }}
      className="group cursor-pointer rounded-2xl border border-brand-graphite bg-brand-charcoal/70 overflow-hidden hover:border-brand-accent/40 hover:shadow-card-lg hover:-translate-y-1 transition-all animate-tile-in"
    >
      <div className="aspect-square overflow-hidden bg-brand-black/40">
        <ProductImage
          product={product}
          size="xl"
          className="w-full h-full rounded-none group-hover:scale-105 transition-transform duration-700"
        />
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-medium text-sm text-brand-cream truncate flex-1">
            {product.name}
          </h3>
          {!product.is_active && (
            <Badge tone="warn" size="xs">
              Inactive
            </Badge>
          )}
        </div>
        <div className="text-[0.65rem] text-brand-smoke font-mono mb-2 truncate">
          {product.sku}
        </div>
        <ProductPrice
          cost={product.cost_price}
          selling={product.selling_price}
          currency={product.currency}
        />
        {product.category_name && (
          <div className="mt-2 inline-flex items-center gap-1 text-[0.6rem] text-brand-smoke">
            <Tag className="w-2.5 h-2.5" />
            {product.category_name}
          </div>
        )}
        {product.reorder_level > 0 && (
          <div className="mt-2 inline-flex items-center gap-1 text-[0.6rem] text-state-warn">
            <AlertCircle className="w-2.5 h-2.5" />
            Reorder at {product.reorder_level}
          </div>
        )}
      </div>
    </article>
  );
}
