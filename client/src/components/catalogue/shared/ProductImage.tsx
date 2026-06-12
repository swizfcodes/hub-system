import { Package } from "lucide-react";
import { cn } from "@lib/cn";
import type { Product } from "@typedefs/catalogue";

interface Props {
  product?: Pick<Product, "name" | "primary_image_url" | "images"> | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = {
  xs: "w-8 h-8 text-[0.55rem]",
  sm: "w-12 h-12 text-xs",
  md: "w-16 h-16 text-sm",
  lg: "w-24 h-24 text-base",
  xl: "w-40 h-40 text-2xl",
};

export function ProductImage({ product, size = "sm", className }: Props) {
  const url =
    product?.primary_image_url ||
    product?.images?.find((i) => i.is_primary)?.url ||
    product?.images?.[0]?.url;
  if (url) {
    return (
      <img
        src={url}
        alt={product?.name ?? "Product"}
        className={cn(
          "rounded-xl object-cover bg-brand-cream",
          SIZES[size],
          className,
        )}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-xl bg-brand-graphite border border-brand-graphite/70 text-brand-smoke flex items-center justify-center",
        SIZES[size],
        className,
      )}
    >
      <Package className="w-1/2 h-1/2" strokeWidth={1.5} />
    </div>
  );
}
