import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Star,
  ArrowUpRight,
  FileText,
  Receipt,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { Button } from "@components/ui/Button";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import { getSupplier } from "@services/purchasing/suppliers";
import { listPOs } from "@services/purchasing/purchaseOrders";
import { listBills } from "@services/purchasing/bills";
import { fmtDate, fmtMoney } from "@lib/format";

const STARS = (n: number) => (
  <div className="inline-flex">
    {[1, 2, 3, 4, 5].map((i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i <= n ? "fill-brand-accent text-brand-accent" : "text-brand-graphite"}`}
      />
    ))}
  </div>
);

export default function SupplierDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: supplier, isLoading } = useQuery({
    queryKey: ["purchasing", "supplier", id],
    queryFn: () => getSupplier(id!),
    enabled: !!id,
  });
  const { data: posResp } = useQuery({
    queryKey: ["purchasing", "pos", { supplier_id: id }],
    queryFn: () => listPOs({ supplier_id: id!, limit: 20 }),
    enabled: !!id,
  });
  const { data: bills } = useQuery({
    queryKey: ["purchasing", "bills", { supplier_id: id }],
    queryFn: () => listBills({ supplier_id: id! }),
    enabled: !!id,
  });

  const pos = posResp?.data ?? [];

  return (
    <>
      <Topbar
        title={supplier?.display_name || "Supplier"}
        subtitle={supplier?.supplier_code}
      />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Procurement", to: "/procurement" },
              { label: "Suppliers", to: "/procurement/suppliers" },
              { label: supplier?.display_name ?? "…" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate("/procurement/suppliers")}
          >
            Back
          </Button>
        </div>

        {isLoading || !supplier ? (
          <div className="space-y-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            <Card className="p-5 sm:p-6 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                <div className="w-16 h-16 rounded-2xl bg-accent2/15 text-accent2 flex items-center justify-center shrink-0">
                  <Building2 className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="font-display text-3xl text-brand-cream">
                      {supplier.display_name}
                    </h1>
                    {!supplier.is_active && (
                      <Badge tone="warn" size="sm">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-brand-smoke mt-1 font-mono">
                    {supplier.supplier_code}
                  </div>
                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    {STARS(supplier.rating ?? 3)}
                    <Badge tone="gold" size="sm">
                      Net {supplier.payment_terms_days}d
                    </Badge>
                    <Badge tone="neutral" size="sm">
                      Prefers {supplier.preferred_currency}
                    </Badge>
                    {supplier.lead_time_days && (
                      <Badge tone="sage" size="sm">
                        {supplier.lead_time_days}d lead
                      </Badge>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    {supplier.email && (
                      <Info label="Email" value={supplier.email} />
                    )}
                    {supplier.primary_phone && (
                      <Info label="Phone" value={supplier.primary_phone} />
                    )}
                    <Info
                      label="Linked contact"
                      value={
                        <Link
                          to={`/contacts/${supplier.contact_id}`}
                          className="text-brand-accent hover:text-brand-cream inline-flex items-center gap-1"
                        >
                          View in Directory <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      }
                    />
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-3 inline-flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" /> Purchase orders
                </h3>
                {pos.length === 0 ? (
                  <EmptyState
                    icon={<FileText className="w-6 h-6" />}
                    title="No POs yet"
                    description="Create the first PO from this supplier from the Purchase Orders page."
                  />
                ) : (
                  <div className="space-y-2">
                    {pos.map((po) => (
                      <Link
                        key={po.po_id}
                        to={`/procurement/purchase-orders/${po.po_id}`}
                      >
                        <Card className="p-3.5 hover:border-brand-accent/40 transition-all">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-sm text-brand-cream truncate">
                                {po.po_number}
                              </span>
                              <Badge
                                tone={
                                  po.status === "received"
                                    ? "sage"
                                    : po.status === "sent"
                                      ? "gold"
                                      : "neutral"
                                }
                                size="xs"
                              >
                                {po.status.replace("_", " ")}
                              </Badge>
                            </div>
                            <span className="font-mono text-sm text-brand-accent">
                              {fmtMoney(po.total_amount, po.currency)}
                            </span>
                          </div>
                          <div className="text-[0.6rem] text-brand-smoke mt-1">
                            {fmtDate(po.order_date)}
                            {po.expected_delivery &&
                              ` → ETA ${fmtDate(po.expected_delivery)}`}
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-3 inline-flex items-center gap-2">
                  <Receipt className="w-3.5 h-3.5" /> Supplier bills
                </h3>
                {(bills ?? []).length === 0 ? (
                  <EmptyState
                    icon={<Receipt className="w-6 h-6" />}
                    title="No bills yet"
                    description="Bills appear after the supplier sends an invoice for a received PO."
                  />
                ) : (
                  <div className="space-y-2">
                    {(bills ?? []).map((b) => (
                      <Card key={b.sup_invoice_id} className="p-3.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm text-brand-cream">
                            {b.supplier_invoice_number}
                          </span>
                          <span className="font-mono text-sm text-brand-accent">
                            {fmtMoney(b.amount, b.currency)}
                          </span>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
        {label}
      </div>
      <div className="text-sm text-brand-cream mt-0.5 truncate">{value}</div>
    </div>
  );
}
