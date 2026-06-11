// ── InvoiceStatusBadge.tsx ────────────────────────────────────────────────────
import {
  INVOICE_STATUS_META,
  CREDIT_NOTE_STATUS_META,
} from "@lib/constants/invoicingConstants";
import type { InvoiceStatus, CreditNoteStatus } from "@typedefs/invoicing";
import { cn } from "@lib/cn";

interface InvoiceBadgeProps {
  status: InvoiceStatus;
  size?: "sm" | "md";
}

export function InvoiceStatusBadge({ status, size = "md" }: InvoiceBadgeProps) {
  const meta = INVOICE_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
      )}
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

interface CreditNoteBadgeProps {
  status: CreditNoteStatus;
  size?: "sm" | "md";
}

export function CreditNoteStatusBadge({
  status,
  size = "md",
}: CreditNoteBadgeProps) {
  const meta = CREDIT_NOTE_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
      )}
      style={{ color: meta.color, backgroundColor: `${meta.color}14` }}
    >
      {meta.label}
    </span>
  );
}

// ── InvoiceKpiStrip.tsx ────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { getInvoiceKpis } from "@services/invoicing/invoices";
import { fmtMoney } from "@lib/format";
import { Skeleton } from "@components/ui/Skeleton";

interface InvoiceKpiStripProps {
  currency?: string;
}

export function InvoiceKpiStrip({ currency = "NGN" }: InvoiceKpiStripProps) {
  const { data: kpis, isLoading } = useQuery({
    queryKey: ["invoice-kpis"],
    queryFn: getInvoiceKpis,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Total Outstanding",
      value: fmtMoney(kpis?.total_outstanding ?? 0, currency),
      color: "#C9A86C",
    },
    {
      label: "Overdue",
      value: fmtMoney(kpis?.total_overdue ?? 0, currency),
      color: "#C0392B",
    },
    {
      label: "Collected This Month",
      value: fmtMoney(kpis?.collected_this_month ?? 0, currency),
      color: "#2D6A4F",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-white/5 bg-brand-charcoal px-5 py-4"
        >
          <p className="text-xs uppercase tracking-widest text-brand-smoke">
            {card.label}
          </p>
          <p
            className="mt-1.5 font-display text-2xl font-light tabular-nums"
            style={{ color: card.color }}
          >
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── InvoiceAgingBuckets.tsx ───────────────────────────────────────────────────
import { AGING_BUCKETS } from "@lib/constants/invoicingConstants";
import type { InvoiceKpis } from "@typedefs/invoicing";
import { fmtMoney as fmtMoneyAging } from "@lib/format";
import { cn as cnAging } from "@lib/cn";

interface InvoiceAgingBucketsProps {
  kpis: InvoiceKpis | null | undefined;
  currency?: string;
  onBucketClick?: (bucketKey: string) => void;
}

export function InvoiceAgingBuckets({
  kpis,
  currency = "NGN",
  onBucketClick,
}: InvoiceAgingBucketsProps) {
  const maxValue = kpis
    ? Math.max(
        kpis.bucket_current,
        kpis.bucket_1_30,
        kpis.bucket_31_60,
        kpis.bucket_61_90,
        kpis.bucket_90_plus,
        1,
      )
    : 1;

  return (
    <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-brand-smoke">
        Receivables Aging
      </p>
      <div className="grid grid-cols-5 gap-3">
        {AGING_BUCKETS.map((bucket) => {
          const amount = kpis
            ? (kpis[bucket.key as keyof InvoiceKpis] as number)
            : 0;
          const pct = Math.min(100, (amount / maxValue) * 100);
          const isOld =
            bucket.key === "bucket_61_90" || bucket.key === "bucket_90_plus";

          return (
            <button
              key={bucket.key}
              type="button"
              onClick={() => onBucketClick?.(bucket.key)}
              className={cnAging(
                "flex flex-col items-center gap-2 rounded-xl border border-white/5 px-2 py-3 transition-colors",
                onBucketClick &&
                  "hover:border-brand-accent/30 hover:bg-brand-graphite/30",
              )}
            >
              {/* Bar */}
              <div className="relative h-16 w-full rounded-full bg-brand-graphite overflow-hidden">
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-500"
                  style={{
                    height: `${pct}%`,
                    backgroundColor: isOld ? "#C0392B" : "#C9A86C",
                    opacity: amount > 0 ? 1 : 0.2,
                  }}
                />
              </div>
              {/* Amount */}
              <p
                className="text-center text-xs font-semibold tabular-nums"
                style={{ color: isOld && amount > 0 ? "#C0392B" : "#E8DFD0" }}
              >
                {fmtMoneyAging(amount, currency)}
              </p>
              {/* Label */}
              <p className="text-center text-[10px] leading-tight text-brand-smoke">
                {bucket.label}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
