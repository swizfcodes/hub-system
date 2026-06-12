/**
 * BillDetail — view a supplier bill, its matched lines and payment status,
 * and act on it: approve, record payments, or dispute.
 */
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Wallet,
  AlertTriangle,
  FileText,
  Building2,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Skeleton } from "@components/ui/Skeleton";
import { Button } from "@components/ui/Button";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import {
  getBill,
  approveBill,
  payBill,
  disputeBill,
} from "@services/purchasing/bills";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtDate, fmtMoney } from "@lib/format";
import type { BillStatus } from "@typedefs/purchasing";

const TONE: Record<BillStatus, "gold" | "sage" | "rose" | "neutral" | "danger"> =
  {
    pending: "neutral",
    matched: "gold",
    approved: "gold",
    paid: "sage",
    disputed: "danger",
  };

export default function BillDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<number | undefined>(undefined);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  const { data: bill, isLoading } = useQuery({
    queryKey: ["purchasing", "bill", id],
    queryFn: () => getBill(id!),
    enabled: !!id,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["purchasing", "bill", id] });
    qc.invalidateQueries({ queryKey: ["purchasing"] });
  };

  const approveMutation = useMutation({
    mutationFn: () => approveBill(id!),
    onSuccess: () => {
      showToast.success("Bill approved", "Payable recognised in accounting.");
      refresh();
    },
    onError: (e) => showToast.error("Could not approve", errMsg(e)),
  });

  const payMutation = useMutation({
    mutationFn: () => payBill(id!, { amount: payAmount ?? 0 }),
    onSuccess: () => {
      showToast.success("Payment recorded");
      setPayOpen(false);
      setPayAmount(undefined);
      refresh();
    },
    onError: (e) => showToast.error("Could not record payment", errMsg(e)),
  });

  const disputeMutation = useMutation({
    mutationFn: () => disputeBill(id!, disputeReason.trim()),
    onSuccess: () => {
      showToast.success("Bill marked as disputed");
      setDisputeOpen(false);
      setDisputeReason("");
      refresh();
    },
    onError: (e) => showToast.error("Could not dispute", errMsg(e)),
  });

  const outstanding = bill
    ? (bill.amount_outstanding ?? bill.amount - bill.amount_paid)
    : 0;

  return (
    <>
      <Topbar
        title={bill?.supplier_invoice_number || "Supplier bill"}
        subtitle={bill?.supplier_name}
      />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Procurement", to: "/procurement" },
              { label: "Bills", to: "/procurement/bills" },
              { label: bill?.supplier_invoice_number ?? "…" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate("/procurement/bills")}
          >
            Back
          </Button>
        </div>

        {isLoading || !bill ? (
          <div className="space-y-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 lg:gap-8 items-start">
            <main className="space-y-6 min-w-0">
              {bill.has_variance && (
                <div className="flex items-start gap-2 rounded-xl border border-state-warn/30 bg-state-warn/5 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-state-warn mt-0.5 shrink-0" />
                  <p className="text-xs text-state-warn">
                    This bill was accepted with a price variance against the PO.
                    See the per-line notes below.
                  </p>
                </div>
              )}

              {/* Lines */}
              <Card className="overflow-hidden">
                <div className="px-5 py-3 border-b border-brand-graphite flex items-center justify-between">
                  <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent inline-flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" /> Billed lines
                  </h3>
                  {bill.po_number && (
                    <Link
                      to={`/procurement/purchase-orders/${bill.po_id}`}
                      className="text-[0.65rem] text-brand-smoke hover:text-brand-accent"
                    >
                      PO {bill.po_number}
                    </Link>
                  )}
                </div>
                {(bill.lines ?? []).length === 0 ? (
                  <p className="p-6 text-sm text-brand-smoke text-center">
                    No line detail recorded for this bill.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-brand-charcoal border-b border-brand-graphite">
                        <tr>
                          <th className="px-4 py-2 text-left text-[0.6rem] tracking-widest uppercase text-brand-smoke">
                            Item
                          </th>
                          <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-brand-smoke">
                            Qty
                          </th>
                          <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-brand-smoke">
                            Unit price
                          </th>
                          <th className="px-4 py-2 text-right text-[0.6rem] tracking-widest uppercase text-brand-smoke">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(bill.lines ?? []).map((l) => (
                          <tr
                            key={l.bill_line_id}
                            className="border-b border-brand-graphite/40"
                          >
                            <td className="px-4 py-2.5">
                              <div className="text-brand-cream">
                                {l.product_name ?? l.description ?? "Item"}
                              </div>
                              {l.product_sku && (
                                <div className="text-[0.6rem] font-mono text-brand-smoke">
                                  {l.product_sku}
                                </div>
                              )}
                              {l.variance_note && (
                                <div className="text-[0.6rem] text-state-warn italic mt-0.5">
                                  ⚠ {l.variance_note}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right text-brand-cream">
                              {l.quantity}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-brand-cream">
                              {fmtMoney(l.unit_price, bill.currency)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-brand-accent">
                              {fmtMoney(
                                l.line_total ?? l.quantity * l.unit_price,
                                bill.currency,
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {bill.notes && (
                <Card className="p-5">
                  <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-2">
                    Notes
                  </h3>
                  <p className="text-sm text-brand-cloud whitespace-pre-line">
                    {bill.notes}
                  </p>
                </Card>
              )}
            </main>

            {/* Sidebar */}
            <aside className="lg:sticky lg:top-24 space-y-3">
              <Card className="p-4">
                <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke mb-1">
                  Status
                </div>
                <Badge tone={TONE[bill.status]} size="sm" dot>
                  {bill.status}
                </Badge>
              </Card>

              <Card className="p-4">
                <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
                  Bill total
                </div>
                <div className="text-2xl font-display text-brand-accent tabular-nums">
                  {fmtMoney(bill.amount, bill.currency)}
                </div>
                <div className="border-t border-brand-graphite mt-3 pt-3 space-y-1 text-xs">
                  <div className="flex justify-between text-brand-smoke">
                    <span>Paid</span>
                    <span className="font-mono text-brand-cream">
                      {fmtMoney(bill.amount_paid, bill.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-brand-smoke">
                    <span>Outstanding</span>
                    <span
                      className={`font-mono ${outstanding > 0 ? "text-state-warn" : "text-accent2"}`}
                    >
                      {fmtMoney(outstanding, bill.currency)}
                    </span>
                  </div>
                </div>
              </Card>

              <Card className="p-4 space-y-2 text-xs">
                <Row label="Invoice no." value={bill.supplier_invoice_number} />
                <Row label="Invoice date" value={fmtDate(bill.invoice_date)} />
                <Row label="Due date" value={fmtDate(bill.due_date)} />
                {bill.supplier_id && (
                  <Link
                    to={`/procurement/suppliers/${bill.supplier_id}`}
                    className="flex items-center gap-2 pt-1 text-brand-smoke hover:text-brand-accent"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    {bill.supplier_name}
                  </Link>
                )}
              </Card>

              {/* Actions */}
              {["pending", "matched"].includes(bill.status) && (
                <Button
                  variant="secondary"
                  fullWidth
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                  loading={approveMutation.isPending}
                  onClick={() => approveMutation.mutate()}
                >
                  Approve bill
                </Button>
              )}
              {bill.status !== "paid" && bill.status !== "disputed" && (
                <Button
                  variant="gold"
                  fullWidth
                  leftIcon={<Wallet className="w-4 h-4" />}
                  onClick={() => {
                    setPayAmount(outstanding > 0 ? outstanding : undefined);
                    setPayOpen(true);
                  }}
                >
                  Record payment
                </Button>
              )}
              {bill.status !== "paid" && bill.status !== "disputed" && (
                <Button
                  variant="ghost"
                  fullWidth
                  leftIcon={<AlertTriangle className="w-4 h-4" />}
                  onClick={() => setDisputeOpen(true)}
                >
                  Dispute
                </Button>
              )}
            </aside>
          </div>
        )}
      </div>

      {/* Payment modal */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record a payment"
        size="sm"
        surface="light"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="gold"
              loading={payMutation.isPending}
              disabled={!payAmount || payAmount <= 0}
              onClick={() => payMutation.mutate()}
            >
              Record payment
            </Button>
          </div>
        }
      >
        <NumberField
          surface="light"
          decimal
          label={`Amount (${bill?.currency ?? ""})`}
          placeholder="0.00"
          value={payAmount}
          onValueChange={setPayAmount}
          hint={
            bill
              ? `Outstanding ${fmtMoney(outstanding, bill.currency)}`
              : undefined
          }
        />
      </Modal>

      {/* Dispute modal */}
      <Modal
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        title="Dispute this bill"
        size="sm"
        surface="light"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDisputeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={disputeMutation.isPending}
              disabled={!disputeReason.trim()}
              onClick={() => disputeMutation.mutate()}
            >
              Mark disputed
            </Button>
          </div>
        }
      >
        <Input
          surface="light"
          label="Reason *"
          value={disputeReason}
          onChange={(e) => setDisputeReason(e.target.value)}
          placeholder="e.g. quantity mismatch vs delivery note"
        />
      </Modal>
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
