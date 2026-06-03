import type { LucideIcon } from "lucide-react";
import { cn } from "@lib/cn";
import {
  QUOTE_STATUS_META,
  ORDER_STATUS_META,
  INVOICE_STATUS_META,
  RECEIPT_STATUS_META,
} from "@lib/constants/salesConstants";
import type {
  QuoteStatus,
  OrderStatus,
  InvoiceStatus,
  ReceiptStatus,
} from "@typedefs/sales";

type AnyStatus = QuoteStatus | OrderStatus | InvoiceStatus | ReceiptStatus;

// Shared "shape" the four status meta tables conform to. ReceiptStatus is
// the only one without an icon — declaring `icon?` here so TypeScript can
// safely render `<Icon />` for the others without complaining that
// receipt entries lack the field.
interface StatusMeta {
  label: string;
  color: string;
  tone: string;
  icon?: LucideIcon;
}

interface Props {
  entity: "quotation" | "order" | "invoice" | "receipt";
  status: AnyStatus;
  size?: "sm" | "md";
  className?: string;
}

export function SalesStatusBadge({
  entity,
  status,
  size = "md",
  className,
}: Props) {
  const meta: StatusMeta | undefined = (() => {
    switch (entity) {
      case "quotation":
        return QUOTE_STATUS_META[status as QuoteStatus];
      case "order":
        return ORDER_STATUS_META[status as OrderStatus];
      case "invoice":
        return INVOICE_STATUS_META[status as InvoiceStatus];
      case "receipt":
        return RECEIPT_STATUS_META[status as ReceiptStatus];
    }
  })();

  if (!meta) return null;

  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium tracking-wide",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        className,
      )}
      style={{
        backgroundColor: `${meta.color}1F`,
        color: meta.color,
        border: `1px solid ${meta.color}40`,
      }}
    >
      {Icon && (
        <Icon className={cn(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5")} />
      )}
      {meta.label}
    </span>
  );
}
