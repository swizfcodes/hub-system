import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PauseCircle } from "lucide-react";
import { usePOSStore } from "@stores/posStore";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { useOnlineStatus } from "@hooks/useOnlineStatus";
import { usePOSSync } from "@hooks/usePOSSync";
import { OfflineBanner } from "@components/pos/OfflineBanner";
import { SessionHeader } from "@components/pos/SessionHeader";
import { CustomerPanel } from "@components/pos/CustomerPanel";
import { ProductSearch } from "@components/pos/ProductSearch";
import { POSCart } from "@components/pos/POSCart";
import { POSTotals } from "@components/pos/POSTotals";
import { PaymentSheet } from "@components/pos/PaymentSheet";
import {
  ReceiptModal,
  SessionCloseModal,
  ParkedDrawer,
  DiscountGate,
  XZReportView,
} from "@components/pos/POSModals";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { getSession } from "@services/pos/sessions";
import { getXReport } from "@services/pos/sessions";
import { createTransaction } from "@services/pos/transactions";
import {
  cacheProducts,
  cacheCategories,
  bulkCacheStock,
  addPendingTransaction,
  decrementStock,
} from "@lib/posDb";
import { api } from "@services/api";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { v4 as uuid } from "uuid";
import type {
  PosTransaction,
  PaymentSplitInput,
  CartTotals,
} from "@typedefs/pos";
import { PRODUCTS_CACHE_LIMIT } from "@lib/constants/posConstants";

export default function POSSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { currency } = useActiveBusiness();

  const {
    session,
    lines,
    clearCart,
    parkCart,
    loadParked,
    refreshPendingCount,
    setSession,
    isOnline,
    parked,
    applyVat,
  } = usePOSStore((s) => ({
    session: s.session,
    lines: s.lines,
    clearCart: s.clearCart,
    parkCart: s.parkCart,
    loadParked: s.loadParked,
    refreshPendingCount: s.refreshPendingCount,
    setSession: s.setSession,
    isOnline: s.isOnline,
    parked: s.parked,
    applyVat: s.applyVat,
  }));

  const customer = usePOSStore((s) => s.customer);

  // Incremented after seedProductCache completes so ProductSearch re-reads IndexedDB.
  const [cacheVersion, setCacheVersion] = useState(0);

  const [showPayment, setShowPayment] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showParked, setShowParked] = useState(false);
  const [showXReport, setShowXReport] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [completedTx, setCompletedTx] = useState<PosTransaction | null>(null);
  const [checkoutTotals, setCheckoutTotals] = useState<CartTotals | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Register online status listener
  useOnlineStatus();

  // Background sync
  usePOSSync(sessionId ?? null);

  // Hydrate session from server on mount (handles page refresh)
  useEffect(() => {
    if (!sessionId) return;
    if (!session) {
      getSession(sessionId).then((s) => {
        if (s) setSession(s);
      });
    }
  }, [sessionId]);

  // Load parked transactions and seed product cache on mount
  useEffect(() => {
    loadParked();
    refreshPendingCount();
    if (sessionId) seedProductCache();
  }, [sessionId]);

  async function seedProductCache() {
    // Each source is fetched independently. Previously these were wrapped in a
    // single Promise.all inside one try/catch, so if ANY one failed (e.g. a
    // cashier without `stock:view` permission 403s on /stock), the whole block
    // aborted and NO products were cached — the grid then showed a misleading
    // "No products in this category". Products are the critical source, so a
    // failure there is surfaced; stock/categories are best-effort.
    try {
      const productsRes = await api.get(
        `/catalogue/products?limit=${PRODUCTS_CACHE_LIMIT}&include_inactive=false`,
      );
      await cacheProducts(productsRes.data.data ?? []);
    } catch (err) {
      showToast.error("Could not load products for POS", errMsg(err));
    }

    try {
      const catsRes = await api.get("/catalogue/categories");
      await cacheCategories(catsRes.data.data ?? []);
    } catch {
      // Category filter tabs just won't show — products still sell under "All".
    }

    try {
      const stockRes = await api.get("/stock");
      await bulkCacheStock(
        (stockRes.data.data ?? []).map(
          (p: {
            product_id: string;
            available_qty?: number;
            current_quantity?: number;
          }) => ({
            product_id: p.product_id,
            available_qty: p.available_qty ?? p.current_quantity ?? 0,
          }),
        ),
      );
    } catch {
      // Stock unavailable — quantities fall back to 0 / last cached value.
    }

    // Always signal ProductSearch to re-read whatever we managed to cache.
    setCacheVersion((v) => v + 1);
  }

  // X Report
  const { data: xReport } = useQuery({
    queryKey: ["pos-x-report", sessionId],
    queryFn: () => getXReport(sessionId!),
    enabled: showXReport && !!sessionId,
  });

  // ── Checkout flow ───────────────────────────────────────────────────────────

  function handleCheckout(t: CartTotals) {
    // Block if any line needs approval
    if (lines.some((l) => l.needs_approval)) {
      setShowGate(true);
      return;
    }
    setCheckoutTotals(t);
    setShowPayment(true);
  }

  async function handleConfirmPayment(
    payments: PaymentSplitInput[],
    saleCurrency: string = "NGN",
    exchangeRate: number | null = null,
    changeHandling: "return" | "keep" = "return",
  ) {
    if (!sessionId) return;
    setIsSubmitting(true);

    const txPayload = {
      session_id: sessionId,
      contact_id: customer?.contact_id,
      currency: saleCurrency,
      exchange_rate: exchangeRate,
      change_handling: changeHandling,
      apply_vat: applyVat,
      lines: lines.map((l) => ({
        product_id: l.product_id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_amount: l.discount_amount,
      })),
      payments: payments.map((p) => ({
        payment_method: p.method,
        amount: p.amount,
        reference: p.reference,
        paystack_reference: p.paystack_ref,
      })),
    };

    if (isOnline) {
      // Online: direct API call
      try {
        const tx = await createTransaction(txPayload);
        clearCart();
        setShowPayment(false);
        setCompletedTx(tx);
      } catch (err) {
        showToast.error(errMsg(err));
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Offline: write to IndexedDB, optimistically decrement stock
      const offlineId = uuid();
      const pending = {
        offline_id: offlineId,
        session_id: sessionId,
        contact_id: customer?.contact_id,
        change_handling: changeHandling,
        apply_vat: applyVat,
        // Capture the currency + rate at sale time so an offline foreign
        // sale replays at the rate the cashier saw, not the rate at sync.
        currency: saleCurrency,
        exchange_rate: exchangeRate,
        lines: lines.map((l) => ({
          product_id: l.product_id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_amount: l.discount_amount,
        })),
        payments: payments.map((p) => ({
          payment_method: p.method,
          amount: p.amount,
          reference: p.reference,
        })),
        created_at_offline: new Date().toISOString(),
        sync_status: "pending" as const,
      };
      await addPendingTransaction(pending);

      // Optimistically decrement local stock
      for (const l of lines) {
        if (l.product_id) await decrementStock(l.product_id, l.quantity);
      }

      await refreshPendingCount();
      clearCart();
      setShowPayment(false);
      // Show a minimal "offline receipt" — no transaction number yet
      showToast.success(
        "Sale recorded offline — will sync when connection restores",
      );
      setIsSubmitting(false);
    }
  }

  function handleNewSale() {
    setCompletedTx(null);
    clearCart();
  }

  function handleSessionClosed() {
    setShowClose(false);
    setSession(null);
    navigate("/pos");
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-brand-black">
      {/* Offline banner */}
      <OfflineBanner />

      {/* Session header */}
      <SessionHeader
        onClose={() => setShowClose(true)}
        onXReport={() => setShowXReport(true)}
        currency={currency}
      />

      {/* Main POS area */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT — Customer + Product search */}
        <div className="flex w-full flex-col gap-4 overflow-hidden border-r border-white/5 p-4 lg:w-[55%]">
          {/* Customer panel */}
          <div className="shrink-0">
            <CustomerPanel currency={currency} />
          </div>

          {/* Divider */}
          <div className="border-t border-white/5" />

          {/* Product search — takes remaining height */}
          <div className="flex-1 overflow-hidden">
            <ProductSearch currency={currency} cacheVersion={cacheVersion} />
          </div>
        </div>

        {/* RIGHT — Cart + Totals */}
        <div className="hidden lg:flex w-[45%] flex-col gap-3 overflow-hidden p-4">
          {/* Park + parked count */}
          <div className="flex items-center justify-between gap-2 shrink-0">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
              Cart
            </span>
            <div className="flex items-center gap-2">
              {lines.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => parkCart()}>
                  <PauseCircle className="h-4 w-4" />
                  Park
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowParked(true)}
              >
                Parked ({parked.length})
              </Button>
            </div>
          </div>

          {/* Cart lines */}
          <div className="flex-1 overflow-y-auto">
            <POSCart currency={currency} />
          </div>

          {/* Totals + checkout */}
          <div className="shrink-0">
            <POSTotals currency={currency} onCheckout={handleCheckout} />
          </div>
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────── */}

      {showPayment && checkoutTotals && (
        <PaymentSheet
          open={showPayment}
          onClose={() => setShowPayment(false)}
          totals={checkoutTotals}
          currency={currency}
          onConfirm={handleConfirmPayment}
          isLoading={isSubmitting}
        />
      )}

      {completedTx && (
        <ReceiptModal
          open={!!completedTx}
          transaction={completedTx}
          currency={currency}
          onNewSale={handleNewSale}
          onClose={handleNewSale}
          onInvoice={(invoiceId) => navigate(`/invoices/${invoiceId}`)}
        />
      )}

      {showClose && (
        <SessionCloseModal
          open={showClose}
          onClose={() => setShowClose(false)}
          onClosed={handleSessionClosed}
          currency={currency}
        />
      )}

      {showGate && (
        <DiscountGate
          open={showGate}
          onClose={() => setShowGate(false)}
          onApproved={(_managerId, _managerName) => {
            // Clear all below-minimum flags so checkout proceeds
            const state = usePOSStore.getState();
            usePOSStore.setState({
              lines: state.lines.map((l) => ({ ...l, needs_approval: false })),
            });
            setShowGate(false);
            if (checkoutTotals) setShowPayment(true);
          }}
        />
      )}

      <ParkedDrawer open={showParked} onClose={() => setShowParked(false)} />

      {/* X Report modal */}
      <Modal
        open={showXReport}
        onClose={() => setShowXReport(false)}
        title="X Report — Current Session"
        size="md"
        surface="light"
      >
        {xReport && <XZReportView report={xReport} currency={currency} />}
      </Modal>
    </div>
  );
}
