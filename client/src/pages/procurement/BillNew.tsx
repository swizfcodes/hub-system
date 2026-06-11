/**
 * BillNew — record a supplier bill and 3-way match it against the PO + GRN.
 *
 * Opened from a PO ("Enter supplier bill" / after receiving) it pre-fills
 * each line with the quantity received and the PO price; you only correct
 * what the supplier actually invoiced. Match rules:
 *   - billed qty > received    → blocked (you can't pay for goods not in)
 *   - price differs >5% from PO → allowed, but the line needs a short note
 * After saving you can record an opening payment in the same step.
 */
import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, AlertTriangle, Check, Receipt, Wallet } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { Card } from "@components/ui/Card";
import { Skeleton } from "@components/ui/Skeleton";
import { getPO } from "@services/purchasing/purchaseOrders";
import { createBill, payBill } from "@services/purchasing/bills";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtMoney } from "@lib/format";
import type { SupplierInvoice } from "@typedefs/purchasing";

const VARIANCE_PCT = 0.05;

interface BillLineState {
  po_line_id: string;
  product_id: string;
  product_name: string;
  product_sku?: string;
  received: number;
  po_price: number;
  quantity: number | undefined;
  unit_price: number | undefined;
  variance_note: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function plusDaysISO(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

export default function BillNew() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const poId = params.get("po_id") ?? "";
  const fromReceive = params.get("from") === "receive";

  const { data: po, isLoading } = useQuery({
    queryKey: ["purchasing", "po", poId],
    queryFn: () => getPO(poId),
    enabled: !!poId,
  });

  // Header fields
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(plusDaysISO(30));
  const [notes, setNotes] = useState("");

  // Lines — initialised from the PO once it loads.
  const [lines, setLines] = useState<BillLineState[] | null>(null);
  const initLines = useMemo<BillLineState[]>(() => {
    if (!po?.lines) return [];
    return po.lines
      .filter((l) => (l.quantity_received ?? 0) > 0)
      .map((l) => ({
        po_line_id: l.line_id,
        product_id: l.product_id,
        product_name: l.product_name ?? l.description ?? "Item",
        product_sku: l.product_sku ?? undefined,
        received: l.quantity_received ?? 0,
        po_price: Number(l.unit_price),
        quantity: l.quantity_received ?? 0,
        unit_price: Number(l.unit_price),
        variance_note: "",
      }));
  }, [po]);

  const rows = lines ?? initLines;
  const currency = po?.currency ?? "NGN";

  function updateLine(i: number, patch: Partial<BillLineState>) {
    setLines((prev) => {
      const base = prev ?? initLines;
      return base.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    });
  }

  // Per-line + overall match state
  const evaluated = rows.map((l) => {
    const qty = l.quantity ?? 0;
    const price = l.unit_price ?? 0;
    const overQty = qty > l.received;
    const variancePct =
      l.po_price > 0 ? Math.abs(price - l.po_price) / l.po_price : 0;
    const needsNote = variancePct > VARIANCE_PCT;
    return {
      ...l,
      qty,
      price,
      overQty,
      variancePct,
      needsNote,
      lineTotal: qty * price,
      noteMissing: needsNote && !l.variance_note.trim(),
    };
  });

  const billTotal = evaluated.reduce((s, l) => s + l.lineTotal, 0);
  const hasOverQty = evaluated.some((l) => l.overQty);
  const hasMissingNote = evaluated.some((l) => l.noteMissing);
  const hasVariance = evaluated.some((l) => l.needsNote);
  const activeLines = evaluated.filter((l) => l.qty > 0);

  const canSave =
    !!po &&
    invoiceNumber.trim().length > 0 &&
    !!invoiceDate &&
    !!dueDate &&
    activeLines.length > 0 &&
    !hasOverQty &&
    !hasMissingNote;

  // Created bill (drives the inline payment step on the quick chain)
  const [createdBill, setCreatedBill] = useState<SupplierInvoice | null>(null);
  const [payAmount, setPayAmount] = useState<number | undefined>(undefined);

  const saveMutation = useMutation({
    mutationFn: () =>
      createBill({
        supplier_id: po!.supplier_id,
        po_id: po!.po_id,
        supplier_invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate,
        due_date: dueDate,
        currency,
        notes: notes.trim() || undefined,
        lines: activeLines.map((l) => ({
          po_line_id: l.po_line_id,
          product_id: l.product_id,
          description: l.product_name,
          quantity: l.qty,
          unit_price: l.price,
          variance_note: l.needsNote ? l.variance_note.trim() : undefined,
        })),
      }),
    onSuccess: (bill) => {
      qc.invalidateQueries({ queryKey: ["purchasing"] });
      showToast.success(
        "Bill recorded",
        hasVariance ? "Saved with a price variance note." : undefined,
      );
      if (fromReceive) {
        // Chain: offer to record a payment right away.
        setCreatedBill(bill);
        setPayAmount(Number(bill.amount));
      } else {
        navigate(`/procurement/bills/${bill.sup_invoice_id}`);
      }
    },
    onError: (e) => showToast.error("Could not save bill", errMsg(e)),
  });

  const payMutation = useMutation({
    mutationFn: () =>
      payBill(createdBill!.sup_invoice_id, { amount: payAmount ?? 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchasing"] });
      showToast.success("Payment recorded");
      navigate(`/procurement/bills/${createdBill!.sup_invoice_id}`);
    },
    onError: (e) => showToast.error("Could not record payment", errMsg(e)),
  });

  return (
    <>
      <Topbar title="New supplier bill" subtitle="3-way match" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-4xl mx-auto">
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Procurement", to: "/procurement" },
              { label: "Bills", to: "/procurement/bills" },
              { label: "New" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ChevronLeft className="w-4 h-4" />}
            onClick={() => navigate(-1)}
          >
            Back
          </Button>
        </div>

        <header className="mb-6">
          <p className="text-[0.7rem] tracking-[0.18em] uppercase text-brand-accent mb-2">
            Supplier bill · 3-way match
          </p>
          <h1 className="font-display font-light text-3xl sm:text-4xl text-brand-cream">
            Match <span className="italic text-brand-accent">PO + GRN + Bill</span>
          </h1>
        </header>

        {!poId ? (
          <Card className="p-6 text-center">
            <Receipt className="w-8 h-8 text-brand-smoke/40 mx-auto mb-3" />
            <p className="text-sm text-brand-smoke">
              Open a purchase order and choose “Enter supplier bill” to record
              and match a bill against it.
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              onClick={() => navigate("/procurement/purchase-orders")}
            >
              Go to purchase orders
            </Button>
          </Card>
        ) : isLoading || !po ? (
          <Skeleton className="h-96" />
        ) : createdBill ? (
          /* ── Inline payment step (quick chain) ─────────────────────── */
          <Card className="p-6 max-w-lg mx-auto space-y-4">
            <div className="flex items-center gap-2 text-accent2">
              <Check className="w-5 h-5" />
              <p className="text-sm font-medium">
                Bill {createdBill.supplier_invoice_number} recorded ·{" "}
                {fmtMoney(createdBill.amount, createdBill.currency)}
              </p>
            </div>
            <p className="text-sm text-brand-cloud">
              How much have you paid the supplier so far? Leave it blank if you
              haven’t paid yet — you can record payments later from the bill.
            </p>
            <NumberField
              surface="dark"
              decimal
              label={`Amount paid now (${createdBill.currency})`}
              placeholder="0.00"
              value={payAmount}
              onValueChange={setPayAmount}
              hint={`Bill total ${fmtMoney(createdBill.amount, createdBill.currency)}`}
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline-light"
                onClick={() =>
                  navigate(`/procurement/bills/${createdBill.sup_invoice_id}`)
                }
              >
                Skip for now
              </Button>
              <Button
                variant="gold"
                leftIcon={<Wallet className="w-4 h-4" />}
                loading={payMutation.isPending}
                disabled={!payAmount || payAmount <= 0}
                onClick={() => payMutation.mutate()}
              >
                Record payment
              </Button>
            </div>
          </Card>
        ) : (
          /* ── Bill entry + match ────────────────────────────────────── */
          <div className="space-y-6">
            {/* Header */}
            <Card className="p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke">
                    Purchase order
                  </p>
                  <p className="text-sm text-brand-cream font-medium">
                    {po.po_number} · {po.supplier_name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke">
                    Currency
                  </p>
                  <p className="text-sm text-brand-cream font-mono">
                    {currency}
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  surface="dark"
                  label="Supplier invoice no. *"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-88213"
                />
                <Input
                  surface="dark"
                  type="date"
                  label="Invoice date *"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
                <Input
                  surface="dark"
                  type="date"
                  label="Due date *"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </Card>

            {/* Lines */}
            <Card className="overflow-hidden">
              <div className="px-5 py-3 border-b border-brand-graphite">
                <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent">
                  Lines — what the supplier invoiced
                </h3>
              </div>
              {evaluated.length === 0 ? (
                <p className="p-6 text-sm text-brand-smoke text-center">
                  Nothing has been received on this PO yet. Receive the goods
                  before billing.
                </p>
              ) : (
                <div className="divide-y divide-brand-graphite/40">
                  {evaluated.map((l, i) => (
                    <div key={l.po_line_id} className="p-4 space-y-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-brand-cream truncate">
                            {l.product_name}
                          </p>
                          <p className="text-[0.65rem] text-brand-smoke">
                            Received {l.received} · PO price{" "}
                            {fmtMoney(l.po_price, currency)}
                          </p>
                        </div>
                        <span className="text-sm font-mono text-brand-accent shrink-0">
                          {fmtMoney(l.lineTotal, currency)}
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <NumberField
                          surface="dark"
                          label="Billed qty"
                          placeholder="0"
                          value={l.quantity}
                          onValueChange={(v) => updateLine(i, { quantity: v })}
                          error={
                            l.overQty ? `Only ${l.received} received` : undefined
                          }
                        />
                        <NumberField
                          surface="dark"
                          decimal
                          label="Billed unit price"
                          placeholder="0.00"
                          value={l.unit_price}
                          onValueChange={(v) => updateLine(i, { unit_price: v })}
                        />
                      </div>
                      {l.needsNote && (
                        <div className="rounded-lg border border-state-warn/30 bg-state-warn/5 p-2.5">
                          <p className="flex items-center gap-1.5 text-[0.7rem] text-state-warn mb-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Price differs from PO by{" "}
                            {(l.variancePct * 100).toFixed(1)}% — add a note to
                            accept it
                          </p>
                          <input
                            type="text"
                            value={l.variance_note}
                            onChange={(e) =>
                              updateLine(i, { variance_note: e.target.value })
                            }
                            placeholder="e.g. supplier raised prices; agreed by phone"
                            className="w-full rounded-lg border border-state-warn/30 bg-brand-graphite py-2 px-3 text-sm text-brand-cream placeholder-brand-smoke/50 focus:border-state-warn focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between px-5 py-3 border-t border-brand-graphite bg-brand-black/30">
                <span className="text-sm text-brand-smoke">Bill total</span>
                <span className="text-lg font-display text-brand-accent tabular-nums">
                  {fmtMoney(billTotal, currency)}
                </span>
              </div>
            </Card>

            <Input
              surface="dark"
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth recording about this bill"
            />

            {hasOverQty && (
              <p className="flex items-center gap-1.5 text-xs text-state-danger">
                <AlertTriangle className="w-3.5 h-3.5" />
                One or more lines bill more than was received. Reduce the qty or
                receive the goods first.
              </p>
            )}

            <div className="flex justify-end gap-3">
              <Button
                variant="outline-light"
                onClick={() =>
                  navigate(`/procurement/purchase-orders/${po.po_id}`)
                }
              >
                Cancel
              </Button>
              <Button
                variant="gold"
                leftIcon={<Receipt className="w-4 h-4" />}
                loading={saveMutation.isPending}
                disabled={!canSave}
                onClick={() => saveMutation.mutate()}
              >
                Save bill
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
