import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Receipt } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { listBills } from "@services/purchasing/bills";
import { fmtDate, fmtMoney } from "@lib/format";

export default function BillsPage() {
  const { data: bills, isLoading } = useQuery({
    queryKey: ["purchasing", "bills"],
    queryFn: () => listBills(),
  });

  return (
    <>
      <Topbar title="Supplier Bills" subtitle="AP · 3-way match" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <PageHeader
          title="Supplier Bills"
          subtitle="Match the supplier's invoice against the PO and what arrived (3-way match). Auto-approves within tolerance, flags exceptions."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Procurement", to: "/procurement" },
            { label: "Bills" },
          ]}
          actions={
            <Link to="/procurement/bills/new">
              <Button variant="gold" leftIcon={<Plus className="w-4 h-4" />}>
                New bill
              </Button>
            </Link>
          }
        />

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : !bills || bills.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-7 h-7" />}
            title="No bills yet"
            description="When a supplier sends an invoice for a received PO, capture it here."
            action={
              <Link to="/procurement/bills/new">
                <Button variant="gold" leftIcon={<Plus className="w-4 h-4" />}>
                  Add bill
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {bills.map((b) => (
              <Link
                key={b.sup_invoice_id}
                to={`/procurement/bills/${b.sup_invoice_id}`}
              >
                <Card className="p-4 hover:border-brand-accent/40 transition-all">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-brand-smoke">
                          {b.supplier_invoice_number}
                        </span>
                        <span className="text-sm text-brand-cream truncate">
                          {b.supplier_name}
                        </span>
                      </div>
                      <div className="text-[0.65rem] text-brand-smoke mt-1">
                        Due {fmtDate(b.due_date)}
                        {b.po_number && ` · PO ${b.po_number}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-brand-accent">
                        {fmtMoney(b.amount, b.currency)}
                      </span>
                      <Badge
                        tone={
                          b.status === "paid"
                            ? "sage"
                            : b.status === "disputed"
                              ? "danger"
                              : b.status === "matched"
                                ? "gold"
                                : "neutral"
                        }
                        size="sm"
                        dot
                      >
                        {b.status}
                      </Badge>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
