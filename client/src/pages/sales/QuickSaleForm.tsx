/**
 * QuickSaleForm — progressive-disclosure direct sale form.
 *
 * Core fields always visible: customer, product lines, payment.
 * Toggles expand: VAT, currency override, delivery details.
 * Split payments use the same pattern as POS PaymentSheet.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Banknote,
  CreditCard,
  ArrowLeftRight,
} from "lucide-react";
import { v4 as uuid } from "uuid";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Card } from "@components/ui/Card";
import { Switch } from "@components/ui/Switch";
import { NumberField } from "@components/ui/NumberField";
import { ContactSearchInput } from "@components/shared/ContactSearchInput";
import {
  CatalogueSearchInput,
  type CatalogueProduct,
} from "@components/shared/CatalogueSearchInput";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney } from "@lib/format";
import {
  createDirectOrder,
  type DirectOrderLineInput,
  type DirectOrderPaymentInput,
} from "@services/sales/orders";
import { getLatestRate } from "@services/settings/currencyRates";
import type { Contact } from "@services/contacts";
import type { PaymentMethod } from "@typedefs/sales";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";

// ── Local types ──────────────────────────────────────────────────────────────

interface CartLine {
  id: string;
  product_id: string;
  name: string;
  sku?: string;
  quantity: number;
  unit_price: number;
}

interface PaymentSplit {
  id: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

const PAYMENT_METHODS: { key: PaymentMethod; label: string; icon: typeof Banknote; requiresRef: boolean }[] = [
  { key: "cash", label: "Cash", icon: Banknote, requiresRef: false },
  { key: "pos_card", label: "POS Card", icon: CreditCard, requiresRef: true },
  { key: "bank_transfer", label: "Transfer", icon: ArrowLeftRight, requiresRef: true },
];

const FOREIGN_CURRENCIES = [
  { value: "", label: "NGN (default)" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function QuickSaleForm() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currency: baseCurrency, vatRate } = useActiveBusiness();

  // ── Core state ───────────────────────────────────────────────────────────
  const [contact, setContact] = useState<Contact | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<PaymentSplit[]>([
    { id: uuid(), method: "cash", amount: 0 },
  ]);

  // ── Toggle state ─────────────────────────────────────────────────────────
  const [applyVat, setApplyVat] = useState(false);
  const [foreignCurrency, setForeignCurrency] = useState("");
  const [isDelivery, setIsDelivery] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // ── Currency rate ────────────────────────────────────────────────────────
  const { data: rateData } = useQuery({
    queryKey: ["currency-rate", foreignCurrency],
    queryFn: () => getLatestRate(foreignCurrency, "NGN"),
    enabled: !!foreignCurrency,
    staleTime: 60_000,
  });

  const exchangeRate = rateData?.rate ?? 0;

  // ── Calculations ─────────────────────────────────────────────────────────
  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0),
    [lines],
  );
  const vatPct = (vatRate ?? 0.075) * 100; // e.g. 7.5
  const vatAmount = applyVat ? subtotal * (vatRate ?? 0.075) : 0;
  const grandTotal = subtotal + vatAmount;
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const shortfall = Math.max(0, grandTotal - totalPaid);
  const overpay = Math.max(0, totalPaid - grandTotal);

  // ── Line management ──────────────────────────────────────────────────────
  function addProduct(p: CatalogueProduct) {
    const existing = lines.find((l) => l.product_id === p.product_id);
    if (existing) {
      setLines(
        lines.map((l) =>
          l.product_id === p.product_id ? { ...l, quantity: l.quantity + 1 } : l,
        ),
      );
    } else {
      setLines([
        ...lines,
        {
          id: uuid(),
          product_id: p.product_id,
          name: p.name,
          sku: p.sku,
          quantity: 1,
          unit_price: p.selling_price,
        },
      ]);
    }
  }

  function updateLine(id: string, patch: Partial<CartLine>) {
    setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines(lines.filter((l) => l.id !== id));
  }

  // ── Payment management ───────────────────────────────────────────────────
  function addPaymentSplit() {
    setPayments([
      ...payments,
      { id: uuid(), method: "bank_transfer", amount: shortfall },
    ]);
  }

  function updatePayment(id: string, patch: Partial<PaymentSplit>) {
    setPayments(payments.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removePayment(id: string) {
    if (payments.length <= 1) return;
    setPayments(payments.filter((p) => p.id !== id));
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: () => {
      const orderLines: DirectOrderLineInput[] = lines.map((l) => ({
        product_id: l.product_id,
        description: l.name,
        quantity: l.quantity,
        unit_price: l.unit_price,
      }));
      const orderPayments: DirectOrderPaymentInput[] = payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        reference: p.reference,
      }));
      return createDirectOrder({
        contact_id: contact!.contact_id,
        lines: orderLines,
        payments: orderPayments,
        fulfilment_type: isDelivery ? "delivery" : "walk_in",
        currency: foreignCurrency || undefined,
        exchange_rate: foreignCurrency && exchangeRate ? exchangeRate : undefined,
        apply_vat: applyVat || undefined,
        delivery_address: isDelivery ? deliveryAddress : undefined,
        // Courier is chosen by Logistics, not Sales — the delivery lands in
        // the logistics queue as pending and staff assign the 3PL on dispatch.
      });
    },
    onSuccess: (order) => {
      showToast.success(`Sale ${order.order_number} confirmed`);
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["sales-kpis"] });
      navigate(`/sales/orders/${order.order_id}`);
    },
    onError: (e) => showToast.error(errMsg(e)),
  });

  const canSubmit =
    !!contact &&
    lines.length > 0 &&
    totalPaid >= grandTotal &&
    (!isDelivery || deliveryAddress.trim().length > 0);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <Topbar title="New Sale" subtitle="Quick sale form" />
      <div className="px-4 sm:px-8 py-6 max-w-3xl mx-auto space-y-6">
        <PageHeader
          title="New Sale"
          subtitle="Create a direct sale — stock deducted, invoice and receipt auto-generated."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Sales", to: "/sales" },
            { label: "New Sale" },
          ]}
          actions={
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => navigate("/sales")}
            >
              Back
            </Button>
          }
        />

        {/* ── Customer ───────────────────────────────────────────── */}
        <Card className="p-5 overflow-visible">
          <h3 className="text-xs font-medium uppercase tracking-widest text-brand-smoke mb-3">
            Customer
          </h3>
          <ContactSearchInput
            value={contact}
            onChange={setContact}
            label=""
            required
          />
        </Card>

        {/* ── Products ───────────────────────────────────────────── */}
        <Card className="p-5">
          <h3 className="text-xs font-medium uppercase tracking-widest text-brand-smoke mb-3">
            Products
          </h3>
          <CatalogueSearchInput
            currency={baseCurrency}
            onSelect={addProduct}
            surface="dark"
            placeholder="Search products to add..."
          />

          {lines.length > 0 && (
            <div className="mt-4 space-y-2">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center gap-3 rounded-lg border border-white/5 bg-brand-black/20 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-cream truncate">
                      {line.name}
                    </p>
                    {line.sku && (
                      <p className="text-[10px] text-brand-smoke">{line.sku}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <NumberField
                      surface="dark"
                      value={line.quantity}
                      onValueChange={(v) =>
                        updateLine(line.id, { quantity: v ?? 1 })
                      }
                      placeholder="1"
                      className="w-14 text-center"
                    />
                    <span className="text-xs text-brand-smoke">×</span>
                    <NumberField
                      surface="dark"
                      decimal
                      value={line.unit_price}
                      onValueChange={(v) =>
                        updateLine(line.id, { unit_price: v ?? 0 })
                      }
                      placeholder="0.00"
                      className="w-24 text-right"
                    />
                    <span className="text-xs font-semibold text-brand-accent tabular-nums w-24 text-right">
                      {fmtMoney(line.unit_price * line.quantity, baseCurrency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="text-brand-smoke hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Toggles ────────────────────────────────────────────── */}
        <Card className="p-5 space-y-4">
          <h3 className="text-xs font-medium uppercase tracking-widest text-brand-smoke mb-1">
            Options
          </h3>

          {/* VAT toggle */}
          <Switch
            checked={applyVat}
            onChange={setApplyVat}
            label="Apply VAT"
            description={`${vatPct}% on subtotal`}
          />

          {/* Currency toggle */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
              Payment Currency
            </label>
            <select
              value={foreignCurrency}
              onChange={(e) => setForeignCurrency(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-brand-graphite py-2 px-3 text-sm text-brand-cream focus:border-brand-accent/50 focus:outline-none"
            >
              {FOREIGN_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            {foreignCurrency && (
              <div className="mt-2 rounded-lg bg-brand-black/30 px-3 py-2 border border-white/5">
                {exchangeRate > 0 ? (
                  <p className="text-xs text-brand-smoke">
                    Today's rate:{" "}
                    <span className="font-semibold text-brand-accent tabular-nums">
                      1 {foreignCurrency} = ₦{exchangeRate.toLocaleString("en-NG", { maximumFractionDigits: 2 })}
                    </span>
                    {" · "}
                    Customer pays{" "}
                    <span className="font-semibold text-brand-cream tabular-nums">
                      {(grandTotal / exchangeRate).toLocaleString("en-NG", { maximumFractionDigits: 2 })}{" "}
                      {foreignCurrency}
                    </span>
                  </p>
                ) : (
                  <p className="text-xs text-red-400">
                    No exchange rate available for {foreignCurrency}. Check Settings → Currency Rates.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Delivery toggle */}
          <Switch
            checked={isDelivery}
            onChange={setIsDelivery}
            label="Delivery"
            description="Delivery cost is borne by the client and charged upon delivery"
          />

          {isDelivery && (
            <div className="ml-13 space-y-3 pl-1">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                  Delivery Address *
                </label>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-white/10 bg-brand-graphite py-2 px-3 text-sm text-brand-cream placeholder-brand-smoke/50 focus:border-brand-accent/50 focus:outline-none resize-none"
                  placeholder="Street address, city, state..."
                />
              </div>
              <p className="text-[11px] text-brand-smoke/70">
                Logistics assigns the courier when they dispatch — this delivery
                lands in their queue as pending.
              </p>
            </div>
          )}
        </Card>

        {/* ── Payment ────────────────────────────────────────────── */}
        <Card className="p-5">
          <h3 className="text-xs font-medium uppercase tracking-widest text-brand-smoke mb-3">
            Payment
          </h3>

          {/* Total due bar */}
          <div className="rounded-lg bg-brand-black/30 px-4 py-3 flex justify-between items-center mb-4 border border-white/5">
            <div>
              <span className="text-xs text-brand-smoke">Subtotal</span>
              <span className="ml-3 text-sm text-brand-cream tabular-nums">
                {fmtMoney(subtotal, baseCurrency)}
              </span>
              {applyVat && (
                <>
                  <span className="ml-3 text-xs text-brand-smoke">
                    + VAT {fmtMoney(vatAmount, baseCurrency)}
                  </span>
                </>
              )}
            </div>
            <span className="font-display text-xl font-extrabold text-brand-accent tabular-nums">
              {fmtMoney(grandTotal, baseCurrency)}
            </span>
          </div>

          {/* Payment splits */}
          <div className="space-y-3">
            {payments.map((split) => (
              <div key={split.id} className="space-y-2">
                {/* Method selector */}
                <div className="grid grid-cols-3 gap-1.5">
                  {PAYMENT_METHODS.map((pm) => {
                    const Icon = pm.icon;
                    return (
                      <button
                        key={pm.key}
                        type="button"
                        onClick={() => updatePayment(split.id, { method: pm.key })}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center transition-all",
                          split.method === pm.key
                            ? "border-brand-accent/60 bg-brand-accent/5 text-brand-accent"
                            : "border-white/10 text-brand-smoke hover:border-white/20",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-[9px] leading-tight">{pm.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Amount + ref */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <NumberField
                      surface="dark"
                      decimal
                      value={split.amount || undefined}
                      onValueChange={(v) =>
                        updatePayment(split.id, { amount: v ?? 0 })
                      }
                      placeholder="0.00"
                      className="text-right"
                    />
                  </div>
                  {PAYMENT_METHODS.find((m) => m.key === split.method)?.requiresRef && (
                    <input
                      type="text"
                      placeholder="Ref / terminal #"
                      value={split.reference ?? ""}
                      onChange={(e) =>
                        updatePayment(split.id, { reference: e.target.value })
                      }
                      className="flex-1 rounded border border-white/10 bg-brand-graphite px-2 py-2 text-sm text-brand-cream focus:border-brand-accent/40 focus:outline-none"
                    />
                  )}
                  {payments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePayment(split.id)}
                      className="text-brand-smoke hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add split */}
          {shortfall > 0 && (
            <button
              type="button"
              onClick={addPaymentSplit}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 py-2 text-xs text-brand-smoke hover:border-brand-accent/30 hover:text-brand-accent transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add payment method — {fmtMoney(shortfall, baseCurrency)} remaining
            </button>
          )}

          {/* Overpay / change */}
          {overpay > 0 && (
            <div className="mt-3 rounded-lg border border-green-500/30 bg-green-900/10 px-4 py-3 flex justify-between">
              <span className="text-sm text-green-300">Give change</span>
              <span className="font-semibold text-green-300 tabular-nums">
                {fmtMoney(overpay, baseCurrency)}
              </span>
            </div>
          )}

          {/* Shortfall warning */}
          {shortfall > 0 && lines.length > 0 && (
            <p className="mt-2 text-xs text-red-400">
              {fmtMoney(shortfall, baseCurrency)} remaining — add another payment method or adjust amounts.
            </p>
          )}
        </Card>

        {/* ── Submit ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 pb-8">
          <Button variant="ghost" onClick={() => navigate("/sales")}>
            Cancel
          </Button>
          <Button
            variant="gold"
            size="lg"
            disabled={!canSubmit}
            loading={submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            Confirm Sale — {fmtMoney(grandTotal, baseCurrency)}
          </Button>
        </div>
      </div>
    </>
  );
}
