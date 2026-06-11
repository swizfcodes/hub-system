import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import {
  Building2,
  FileQuestion,
  FileText,
  Truck,
  Receipt,
  ArrowRight,
  TrendingUp,
  Zap,
  GitMerge,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import { listSuppliers } from "@services/purchasing/suppliers";
import { listRFQs } from "@services/purchasing/rfqs";
import { listPOs } from "@services/purchasing/purchaseOrders";
import { listBills } from "@services/purchasing/bills";
import { fmtMoney, fmtRelative } from "@lib/format";
import { cn } from "@lib/cn";

export default function ProcurementHome() {
  const navigate = useNavigate();
  const { active: business } = useActiveBusiness();
  const { data: sups } = useQuery({
    queryKey: ["purchasing", "suppliers"],
    queryFn: () => listSuppliers({ limit: 200 }),
  });
  const { data: rfqs } = useQuery({
    queryKey: ["purchasing", "rfqs", "all"],
    queryFn: () => listRFQs({ limit: 100 }),
  });
  const { data: pos } = useQuery({
    queryKey: ["purchasing", "purchase-orders", "all", business],
    queryFn: () => listPOs({ limit: 100 }),
  });
  const { data: bills } = useQuery({
    queryKey: ["purchasing", "bills"],
    queryFn: () => listBills(),
  });

  const openRFQs = (rfqs?.data ?? []).filter(
    (r) => r.status === "sent" || r.status === "draft",
  );
  const responsesReady = (rfqs?.data ?? []).filter(
    (r) => r.status === "responses_received",
  );
  const posPending = (pos?.data ?? []).filter((p) =>
    ["draft", "sent", "acknowledged"].includes(p.status),
  );
  const posIncoming = (pos?.data ?? []).filter((p) =>
    ["sent", "acknowledged", "partially_received"].includes(p.status),
  );
  const billsPending = (bills ?? []).filter(
    (b) => b.status === "pending" || b.status === "matched",
  );

  const openValue = posIncoming.reduce(
    (s, p) => s + (p.ngn_equivalent || p.total_amount || 0),
    0,
  );

  return (
    <>
      <Topbar title="Procurement" subtitle="Command center" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
        <PageHeader
          title="Procurement"
          subtitle="Everything you've requested, ordered, received, and owe — in one place."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Procurement" }]}
        />

        {/* ── Start procurement — mode picker ─────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 mb-8">
          {/* Quick Purchase */}
          <button
            onClick={() => navigate("/procurement/purchase-orders/new?mode=quick")}
            className="group relative text-left rounded-2xl border border-brand-accent/30 bg-brand-accent/5 p-5 hover:border-brand-accent/60 hover:bg-brand-accent/10 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent/20 text-brand-accent">
                <Zap className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[0.6rem] uppercase tracking-widest text-brand-accent font-semibold mb-1">
                  Quick purchase
                </div>
                <h3 className="font-display text-xl text-brand-cream leading-tight">
                  PO + Receive
                </h3>
                <p className="mt-1.5 text-xs text-brand-smoke leading-relaxed">
                  You know the supplier, product, and price. Create a PO and
                  receive goods in two steps — no RFQ needed.
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-brand-accent font-medium">
                  Start quick purchase{" "}
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </button>

          {/* Full Cycle */}
          <button
            onClick={() => navigate("/procurement/rfqs/new")}
            className="group relative text-left rounded-2xl border border-accent2/30 bg-accent2/5 p-5 hover:border-accent2/60 hover:bg-accent2/10 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent2/20 text-accent2">
                <GitMerge className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[0.6rem] uppercase tracking-widest text-accent2 font-semibold mb-1">
                  Full cycle
                </div>
                <h3 className="font-display text-xl text-brand-cream leading-tight">
                  RFQ → Quotes → PO → GRN → Bill
                </h3>
                <p className="mt-1.5 text-xs text-brand-smoke leading-relaxed">
                  Need competitive quotes first? Send an RFQ to multiple
                  suppliers, pick the best price, then convert to a PO.
                </p>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-accent2 font-medium">
                  Start with an RFQ{" "}
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 mb-6">
          <Kpi
            to="/procurement/suppliers"
            icon={<Building2 className="w-4 h-4" />}
            label="Suppliers"
            value={String((sups?.data ?? []).length)}
            tone="sage"
            hint="Active master list"
          />
          <Kpi
            to="/procurement/rfqs"
            icon={<FileQuestion className="w-4 h-4" />}
            label="Open RFQs"
            value={String(openRFQs.length)}
            tone="gold"
            hint={`${responsesReady.length} with responses`}
          />
          <Kpi
            to="/procurement/purchase-orders"
            icon={<FileText className="w-4 h-4" />}
            label="POs awaiting receipt"
            value={String(posIncoming.length)}
            tone="gold"
            hint="From sent → partial"
          />
          <Kpi
            to="/procurement/purchase-orders"
            icon={<TrendingUp className="w-4 h-4" />}
            label="Open PO value"
            value={fmtMoney(openValue, "NGN")}
            tone="rose"
            hint="Sum of incoming POs (NGN)"
          />
          <Kpi
            to="/procurement/bills"
            icon={<Receipt className="w-4 h-4" />}
            label="Bills to clear"
            value={String(billsPending.length)}
            tone="rose"
            hint="Pending + matched"
          />
        </div>

        {/* Action lanes */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Lane
            title="RFQ responses ready"
            description="Suppliers have submitted quotes on these RFQs. Pick the best value and convert to PO."
            icon={<FileQuestion className="w-5 h-5" />}
            tone="gold"
            empty="No new responses yet."
            items={responsesReady
              .slice(0, 5)
              .map((r) => ({
                id: r.rfq_id,
                primary: r.title,
                secondary: r.rfq_number,
                hint: fmtRelative(r.updated_at),
                to: `/procurement/rfqs/${r.rfq_id}`,
              }))}
          />
          <Lane
            title="POs awaiting receipt"
            description="Goods due in. Tap to log a Goods Receipt with quality check."
            icon={<Truck className="w-5 h-5" />}
            tone="sage"
            empty="No POs awaiting receipt."
            items={posIncoming.slice(0, 5).map((p) => ({
              id: p.po_id,
              primary: p.supplier_name ?? "—",
              secondary: `${p.po_number} · ${fmtMoney(p.total_amount, p.currency)}`,
              hint: p.expected_delivery
                ? `ETA ${fmtRelative(p.expected_delivery)}`
                : fmtRelative(p.order_date),
              tone: "gold",
              badge: p.status.replace("_", " "),
              to: `/procurement/purchase-orders/${p.po_id}`,
            }))}
          />
          <Lane
            title="POs pending approval"
            description="Drafts and sent POs awaiting acknowledgement."
            icon={<FileText className="w-5 h-5" />}
            tone="rose"
            empty="No POs pending."
            items={posPending
              .slice(0, 5)
              .map((p) => ({
                id: p.po_id,
                primary: p.supplier_name ?? "—",
                secondary: p.po_number,
                hint: fmtMoney(p.total_amount, p.currency),
                to: `/procurement/purchase-orders/${p.po_id}`,
              }))}
          />
          <Lane
            title="Bills to clear"
            description="Supplier invoices awaiting 3-way match or payment."
            icon={<Receipt className="w-5 h-5" />}
            tone="neutral"
            empty="No bills pending."
            items={billsPending.slice(0, 5).map((b) => ({
              id: b.sup_invoice_id,
              primary: b.supplier_name ?? "—",
              secondary: b.supplier_invoice_number,
              hint: fmtMoney(b.amount, b.currency),
              badge: b.status,
              to: `/procurement/bills/${b.sup_invoice_id}`,
            }))}
          />
        </div>

        {/* Recent PO activity — derived from the POs already loaded above */}
        {(pos?.data ?? []).length > 0 && (
          <div className="mt-8 space-y-3">
            <p className="text-[0.65rem] tracking-widest uppercase text-brand-accent font-semibold">
              Recent Activity
            </p>
            <div className="space-y-2">
              {(pos?.data ?? [])
                .slice()
                .sort(
                  (a, b) =>
                    new Date(b.updated_at ?? b.created_at).getTime() -
                    new Date(a.updated_at ?? a.created_at).getTime(),
                )
                .slice(0, 6)
                .map((po) => (
                  <Link
                    key={po.po_id}
                    to={`/procurement/purchase-orders/${po.po_id}`}
                    className="flex items-center gap-3 rounded-xl border border-white/5 bg-brand-charcoal/40 px-4 py-3 hover:border-white/10 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-brand-smoke shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-brand-cream truncate">
                        <span className="font-mono text-xs text-brand-accent mr-2">
                          {po.po_number}
                        </span>
                        {po.supplier_name ?? "Unknown supplier"}
                      </p>
                      <p className="text-xs text-brand-smoke">
                        {fmtMoney(po.total_amount ?? 0, po.currency ?? "NGN")}
                      </p>
                    </div>
                    <Badge tone="neutral" size="xs">
                      {po.status}
                    </Badge>
                    <span className="text-[10px] text-brand-smoke/50 shrink-0">
                      {fmtRelative(po.updated_at ?? po.created_at)}
                    </span>
                  </Link>
                ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Kpi({
  to,
  icon,
  label,
  value,
  tone,
  hint,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "gold" | "rose" | "sage" | "neutral";
  hint?: string;
}) {
  const toneCls = {
    gold: "bg-brand-accent/15 text-brand-accent",
    rose: "bg-accent3/15 text-accent3",
    sage: "bg-accent2/15 text-accent2",
    neutral: "bg-brand-graphite text-brand-cloud",
  }[tone];
  return (
    <Link to={to} className="block">
      <div className="p-4 rounded-2xl border border-brand-graphite bg-brand-charcoal/60 hover:border-brand-accent/40 hover:-translate-y-0.5 transition-all">
        <div
          className={cn(
            "inline-flex items-center justify-center w-8 h-8 rounded-lg",
            toneCls,
          )}
        >
          {icon}
        </div>
        <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke mt-2">
          {label}
        </div>
        <div className="text-xl font-display text-brand-cream mt-0.5 tabular-nums truncate">
          {value}
        </div>
        {hint && (
          <div className="text-[0.65rem] text-brand-smoke mt-1">{hint}</div>
        )}
      </div>
    </Link>
  );
}

interface LaneItem {
  id: string;
  primary: string;
  secondary?: string;
  hint?: string;
  badge?: string;
  tone?: "gold" | "sage" | "rose" | "neutral";
  to: string;
}

function Lane({
  title,
  description,
  icon,
  tone,
  empty,
  items,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  tone: "gold" | "rose" | "sage" | "neutral";
  empty: string;
  items: LaneItem[];
}) {
  const toneCls = {
    gold: "bg-brand-accent/15 text-brand-accent",
    rose: "bg-accent3/15 text-accent3",
    sage: "bg-accent2/15 text-accent2",
    neutral: "bg-brand-graphite text-brand-cloud",
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3 mb-4">
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
            toneCls,
          )}
        >
          {icon}
        </div>
        <div>
          <h3 className="font-display text-xl text-brand-cream leading-tight">
            {title}
          </h3>
          <p className="text-xs text-brand-smoke mt-0.5">{description}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-brand-smoke italic">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => (
            <Link key={it.id} to={it.to} className="group block">
              <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-brand-charcoal/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-brand-cream truncate">
                    {it.primary}
                  </div>
                  {it.secondary && (
                    <div className="text-[0.65rem] text-brand-smoke truncate">
                      {it.secondary}
                    </div>
                  )}
                </div>
                {it.badge && (
                  <Badge tone="neutral" size="xs">
                    {it.badge}
                  </Badge>
                )}
                {it.hint && (
                  <span className="text-[0.65rem] text-brand-smoke whitespace-nowrap">
                    {it.hint}
                  </span>
                )}
                <ArrowRight className="w-3.5 h-3.5 text-brand-smoke group-hover:text-brand-accent group-hover:translate-x-0.5 transition-all" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
