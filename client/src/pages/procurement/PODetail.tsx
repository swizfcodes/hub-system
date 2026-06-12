import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  FileText,
  Truck,
  Receipt,
  ArrowDownToLine,
  Building2,
  Zap,
  Send,
  Mail,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Skeleton } from "@components/ui/Skeleton";
import { Button } from "@components/ui/Button";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import {
  getPO,
  listReceiptsForPO,
  sendPO,
  emailPO,
} from "@services/purchasing/purchaseOrders";
import { listBills } from "@services/purchasing/bills";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtDate, fmtDateTime, fmtMoney } from "@lib/format";
import { ReceiveGoodsModal } from "@components/procurement/grn/ReceiveGoodsModal";
import { QuickReceiveModal } from "@components/procurement/grn/QuickReceiveModal";
import type { POStatus, BillStatus } from "@typedefs/purchasing";

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

const BILL_TONE: Record<BillStatus, "gold" | "sage" | "rose" | "neutral" | "danger"> = {
  pending: "neutral",
  matched: "gold",
  approved: "gold",
  paid: "sage",
  disputed: "danger",
};

export default function PODetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [receiving, setReceiving] = useState(false);
  const [quickReceiving, setQuickReceiving] = useState(false);

  const sendMutation = useMutation({
    mutationFn: () => sendPO(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchasing", "po", id] });
      showToast.success("PO sent", "Status updated to sent.");
    },
    onError: (e) => showToast.error("Could not send PO", errMsg(e)),
  });

  const emailMutation = useMutation({
    mutationFn: () => emailPO(id!),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["purchasing", "po", id] });
      showToast.success("PO emailed", `Sent to ${r.emailed_to}.`);
    },
    onError: (e) => showToast.error("Could not email PO", errMsg(e)),
  });

  const { data: po, isLoading } = useQuery({
    queryKey: ["purchasing", "po", id],
    queryFn: () => getPO(id!),
    enabled: !!id,
  });
  const { data: receipts = [] } = useQuery({
    queryKey: ["purchasing", "po", id, "receipts"],
    queryFn: () => listReceiptsForPO(id!),
    enabled: !!id,
  });
  // Bills already raised against this PO — drives the payables summary.
  const { data: bills = [] } = useQuery({
    queryKey: ["purchasing", "po", id, "bills"],
    queryFn: () => listBills({ po_id: id! }),
    enabled: !!id,
  });

  // draft is included — the backend has no status check on receiveGoods,
  // and non-tech users should be able to receive immediately after creation.
  const isReceivable =
    po && ["draft", "sent", "acknowledged", "partially_received"].includes(po.status);
  const totalReceived =
    po?.lines?.reduce((s, l) => s + (l.quantity_received ?? 0), 0) ?? 0;
  const totalOrdered =
    po?.lines?.reduce((s, l) => s + (l.quantity_ordered ?? 0), 0) ?? 0;

  // Auto-open the quick receive modal when coming from ?receive=1 (quick purchase flow)
  useEffect(() => {
    if (po && isReceivable && searchParams.get("receive") === "1") {
      setQuickReceiving(true);
    }
  }, [po?.po_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Topbar
        title={po?.po_number || "Purchase Order"}
        subtitle={po?.supplier_name}
      />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Procurement", to: "/procurement" },
              { label: "POs", to: "/procurement/purchase-orders" },
              { label: po?.po_number ?? "…" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate("/procurement/purchase-orders")}
          >
            Back
          </Button>
        </div>

        {isLoading || !po ? (
          <div className="space-y-3">
            <Skeleton className="h-44" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 lg:gap-8 items-start">
            <main className="space-y-6 min-w-0">
              {/* Lines */}
              <Card className="overflow-hidden">
                <div className="px-5 py-3 border-b border-brand-graphite flex items-center justify-between">
                  <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent inline-flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" /> Line items
                  </h3>
                  <span className="text-[0.65rem] text-brand-smoke">
                    {totalReceived}/{totalOrdered} units received
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-brand-charcoal border-b border-brand-graphite">
                      <tr>
                        <th className="px-4 py-2 text-left text-[0.6rem] tracking-widest uppercase text-brand-smoke">
                          Product
                        </th>
                        <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-brand-smoke">
                          Qty ordered
                        </th>
                        <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-brand-smoke">
                          Qty received
                        </th>
                        <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-brand-smoke">
                          Unit price
                        </th>
                        <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-brand-smoke">
                          Line total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(po.lines ?? []).map((l) => {
                        const remaining =
                          l.quantity_ordered - (l.quantity_received ?? 0);
                        return (
                          <tr
                            key={l.line_id}
                            className="border-b border-brand-graphite/40"
                          >
                            <td className="px-4 py-2.5">
                              <div className="text-brand-cream">
                                {l.product_name ?? l.description ?? "—"}
                              </div>
                              {l.product_sku && (
                                <div className="text-[0.6rem] font-mono text-brand-smoke">
                                  {l.product_sku}
                                </div>
                              )}
                              {l.description &&
                                l.description !== l.product_name && (
                                  <div className="text-[0.6rem] text-brand-smoke/80 italic">
                                    {l.description}
                                  </div>
                                )}
                            </td>
                            <td className="px-4 py-2.5 text-right text-brand-cream">
                              {l.quantity_ordered}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <span className="text-brand-cream">
                                {l.quantity_received ?? 0}
                              </span>
                              {remaining > 0 && (
                                <span className="text-[0.6rem] text-state-warn ml-1">
                                  · {remaining} pending
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-brand-cream">
                              {fmtMoney(l.unit_price, po.currency)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-brand-accent">
                              {fmtMoney(l.line_total, po.currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Goods receipts */}
              <Card className="p-5">
                <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-3 inline-flex items-center gap-2">
                  <Truck className="w-3.5 h-3.5" /> Goods receipts ·{" "}
                  {receipts.length}
                </h3>
                {receipts.length === 0 ? (
                  <p className="text-xs text-brand-cloud">
                    {po.status === "received"
                      ? "All ordered goods have been received."
                      : po.status === "partially_received"
                        ? "Some goods received; remainder pending."
                        : "No goods received yet."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {receipts.map((r) => (
                      <div
                        key={r.receipt_id}
                        className="flex items-center gap-3 text-xs py-2 border-b border-brand-graphite/40 last:border-0"
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5 text-brand-accent shrink-0" />
                        <span className="text-brand-cream flex-1">
                          Received {fmtDate(r.received_date)}
                        </span>
                        {r.notes && (
                          <span className="text-brand-smoke truncate max-w-xs">
                            {r.notes}
                          </span>
                        )}
                        <span className="text-brand-smoke shrink-0">
                          {r.lines?.length ?? 0} line(s)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {po.notes && (
                <Card className="p-5">
                  <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-2">
                    Notes
                  </h3>
                  <p className="text-sm text-brand-cloud whitespace-pre-line">
                    {po.notes}
                  </p>
                </Card>
              )}
            </main>

            {/* Sticky sidebar */}
            <aside className="lg:sticky lg:top-24 space-y-3">
              <Card className="p-4">
                <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke mb-1">
                  Status
                </div>
                <Badge tone={STATUS_TONE[po.status]} size="sm" dot>
                  {po.status.replace("_", " ")}
                </Badge>
              </Card>

              <Card className="p-4">
                <Link
                  to={`/procurement/suppliers/${po.supplier_id}`}
                  className="flex items-center gap-3 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent2/15 text-accent2 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-brand-cream truncate group-hover:text-brand-accent">
                      {po.supplier_name}
                    </div>
                    <span className="text-[0.6rem] text-brand-smoke">
                      Open supplier
                    </span>
                  </div>
                </Link>
              </Card>

              <Card className="p-4">
                <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
                  Total
                </div>
                <div className="text-2xl font-display text-brand-accent tabular-nums">
                  {fmtMoney(po.total_amount, po.currency)}
                </div>
                {po.ngn_equivalent && po.currency !== "NGN" && (
                  <div className="text-[0.65rem] text-brand-smoke font-mono mt-1">
                    ≈ {fmtMoney(po.ngn_equivalent, "NGN")} @ {po.exchange_rate}
                  </div>
                )}
                <div className="border-t border-brand-graphite mt-3 pt-3 space-y-1 text-xs">
                  <div className="flex justify-between text-brand-smoke">
                    <span>Subtotal</span>
                    <span className="font-mono text-brand-cream">
                      {fmtMoney(po.subtotal, po.currency)}
                    </span>
                  </div>
                  {po.shipping_cost > 0 && (
                    <div className="flex justify-between text-brand-smoke">
                      <span>Shipping</span>
                      <span className="font-mono text-brand-cream">
                        {fmtMoney(po.shipping_cost, po.currency)}
                      </span>
                    </div>
                  )}
                  {po.import_duty > 0 && (
                    <div className="flex justify-between text-brand-smoke">
                      <span>Duty</span>
                      <span className="font-mono text-brand-cream">
                        {fmtMoney(po.import_duty, po.currency)}
                      </span>
                    </div>
                  )}
                  {po.other_charges > 0 && (
                    <div className="flex justify-between text-brand-smoke">
                      <span>Other</span>
                      <span className="font-mono text-brand-cream">
                        {fmtMoney(po.other_charges, po.currency)}
                      </span>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-4 space-y-2 text-xs">
                <Row label="Order date" value={fmtDate(po.order_date)} />
                <Row
                  label="ETA"
                  value={
                    po.expected_delivery ? fmtDate(po.expected_delivery) : "—"
                  }
                />
                <Row label="Created" value={fmtDateTime(po.created_at)} />
                {po.delivery_address && (
                  <Row label="Ship to" value={po.delivery_address} />
                )}
              </Card>

              {/* Payables summary — bills raised against this PO */}
              {bills.length > 0 && (
                <Card className="p-4 space-y-2">
                  <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
                    Supplier bills
                  </div>
                  {bills.map((b) => (
                    <Link
                      key={b.sup_invoice_id}
                      to={`/procurement/bills/${b.sup_invoice_id}`}
                      className="block rounded-lg border border-brand-graphite/60 px-3 py-2 hover:border-brand-accent/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-brand-cream truncate">
                          {b.supplier_invoice_number}
                        </span>
                        <Badge tone={BILL_TONE[b.status]} size="xs">
                          {b.status}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[0.65rem] text-brand-smoke">
                        <span>{fmtMoney(b.amount, b.currency)}</span>
                        {(b.amount_outstanding ?? 0) > 0 ? (
                          <span className="text-state-warn">
                            {fmtMoney(b.amount_outstanding ?? 0, b.currency)} owed
                          </span>
                        ) : (
                          <span className="text-accent2">Settled</span>
                        )}
                      </div>
                      {b.has_variance && (
                        <div className="mt-0.5 text-[0.6rem] text-state-warn">
                          ⚠ price variance accepted
                        </div>
                      )}
                    </Link>
                  ))}
                </Card>
              )}

              {/* Send PO — only shown on draft so the full cycle can progress */}
              {po.status === "draft" && (
                <Button
                  variant="secondary"
                  fullWidth
                  leftIcon={<Send className="w-4 h-4" />}
                  loading={sendMutation.isPending}
                  onClick={() => sendMutation.mutate()}
                >
                  Confirm &amp; send to supplier
                </Button>
              )}

              {/* Email to supplier — available until the goods are in */}
              {["draft", "sent", "acknowledged"].includes(po.status) && (
                <Button
                  variant="secondary"
                  fullWidth
                  leftIcon={<Mail className="w-4 h-4" />}
                  loading={emailMutation.isPending}
                  onClick={() => emailMutation.mutate()}
                >
                  Email PO to supplier
                </Button>
              )}

              {isReceivable && (
                <div className="space-y-2">
                  {/* Quick receive — all items accepted at once */}
                  <Button
                    variant="gold"
                    fullWidth
                    leftIcon={<Zap className="w-4 h-4" />}
                    onClick={() => setQuickReceiving(true)}
                  >
                    Receive all at once
                  </Button>
                  {/* Full GRN — per-line accept / reject / partial */}
                  <Button
                    variant="secondary"
                    fullWidth
                    leftIcon={<ArrowDownToLine className="w-4 h-4" />}
                    onClick={() => setReceiving(true)}
                  >
                    Receive with QC
                  </Button>
                </div>
              )}
              {/* Bill matching — primary once anything has been received */}
              {totalReceived > 0 && (
                <Link to={`/procurement/bills/new?po_id=${po.po_id}`}>
                  <Button
                    variant={bills.length === 0 ? "gold" : "secondary"}
                    fullWidth
                    leftIcon={<Receipt className="w-4 h-4" />}
                  >
                    {bills.length === 0
                      ? "Enter supplier bill"
                      : "Add another bill"}
                  </Button>
                </Link>
              )}
            </aside>

            <ReceiveGoodsModal
              open={receiving}
              onClose={() => setReceiving(false)}
              po={po}
              onReceived={() =>
                navigate(`/procurement/bills/new?po_id=${po.po_id}&from=receive`)
              }
            />
            <QuickReceiveModal
              open={quickReceiving}
              onClose={() => setQuickReceiving(false)}
              po={po}
              onReceived={() =>
                navigate(`/procurement/bills/new?po_id=${po.po_id}&from=receive`)
              }
            />
          </div>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-brand-smoke">{label}</span>
      <span className="text-brand-cream truncate ml-2">{value}</span>
    </div>
  );
}
