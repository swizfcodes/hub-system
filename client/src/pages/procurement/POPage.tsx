import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { Plus, FileText } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { listPOs } from "@services/purchasing/purchaseOrders";
import { fmtDate, fmtMoney } from "@lib/format";
import type { POStatus } from "@typedefs/purchasing";

const STATUS_TONE: Record<
  POStatus,
  "gold" | "sage" | "rose" | "neutral" | "danger"
> = {
  draft: "neutral",
  sent: "gold",
  acknowledged: "gold",
  partially_received: "sage",
  received: "sage",
  invoiced: "gold",
  paid: "sage",
  cancelled: "danger",
};

export default function POPage() {
  const { active: business } = useActiveBusiness();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<POStatus | "">("");

  const { data, isLoading } = useQuery({
    queryKey: [
      "purchasing",
      "purchase-orders",
      business,
      { status: statusFilter },
    ],
    queryFn: () => listPOs({ status: statusFilter || undefined, limit: 100 }),
  });

  const pos = data?.data ?? [];

  return (
    <>
      <Topbar
        title="Purchase Orders"
        subtitle="POs awaiting receipt or payment"
      />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
        <PageHeader
          title="Purchase Orders"
          subtitle="Convert quotes into POs. Multi-currency with FX rate locked at approval time."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Procurement", to: "/procurement" },
            { label: "POs" },
          ]}
          actions={
            <Link to="/procurement/purchase-orders/new">
              <Button variant="gold" leftIcon={<Plus className="w-4 h-4" />}>
                New PO
              </Button>
            </Link>
          }
        />

        <div className="mb-5 flex flex-wrap gap-2">
          {(
            [
              { key: "", label: "All" },
              { key: "draft", label: "Draft" },
              { key: "sent", label: "Sent" },
              { key: "partially_received", label: "Partially in" },
              { key: "received", label: "Received" },
              { key: "invoiced", label: "Invoiced" },
              { key: "paid", label: "Paid" },
            ] as Array<{ key: POStatus | ""; label: string }>
          ).map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={`px-3 py-1.5 rounded-full text-[0.65rem] font-semibold uppercase tracking-widest transition-all ${
                statusFilter === s.key
                  ? "bg-brand-accent text-brand-black"
                  : "bg-brand-charcoal border border-brand-graphite text-brand-smoke hover:text-brand-cream"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : pos.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-7 h-7" />}
            title="No POs yet"
            description="Issue your first PO from a quote or directly to a supplier."
            action={
              <Link to="/procurement/purchase-orders/new">
                <Button variant="gold" leftIcon={<Plus className="w-4 h-4" />}>
                  New PO
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {pos.map((po) => (
              <Card
                key={po.po_id}
                className="p-4 hover:border-brand-accent/40 transition-all cursor-pointer"
                onClick={() =>
                  navigate(`/procurement/purchase-orders/${po.po_id}`)
                }
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-brand-smoke">
                        {po.po_number}
                      </span>
                      <span className="text-sm text-brand-cream truncate">
                        {po.supplier_name}
                      </span>
                    </div>
                    <div className="text-[0.65rem] text-brand-smoke mt-1">
                      Ordered {fmtDate(po.order_date)}
                      {po.expected_delivery &&
                        ` · ETA ${fmtDate(po.expected_delivery)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-brand-accent">
                      {fmtMoney(po.total_amount, po.currency)}
                    </span>
                    <Badge tone={STATUS_TONE[po.status]} size="sm" dot>
                      {po.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
