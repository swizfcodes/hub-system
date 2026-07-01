import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type {
  CartLine,
  PosSession,
  PosTerminal,
  ParkedTransaction,
  OrderDiscount,
  CartTotals,
} from "@typedefs/pos";
import type { Contact } from "@services/contacts";
import type { LoyaltyInfo } from "@typedefs/loyalty";
import {
  saveParkedTransaction,
  removeParkedTransaction,
  getParkedTransactions,
  getPendingCount,
} from "@lib/posDb";

// ── Computed totals helper ────────────────────────────────────────────────────

// Coerce any value to a finite number. Money columns (selling_price,
// min_selling_price, …) arrive from the pg driver as STRINGS for NUMERIC
// types. Seeding line_total straight from such a string made computeTotals'
// `s + l.line_total` reduce do string concatenation once a second line was
// added ("5000.00" + "3000.00" → "5000.003000.00" → NaN). Always normalise
// numeric input through this helper so arithmetic stays numeric.
function num(n: unknown): number {
  const v = typeof n === "string" ? parseFloat(n) : (n as number);
  return Number.isFinite(v) ? v : 0;
}

// C2 fix: round all money calculations to 2 decimal places
function r2(n: number): number {
  return Math.round(num(n) * 100) / 100;
}

export function computeTotals(
  lines: CartLine[],
  orderDiscount: OrderDiscount | null,
  loyaltyDiscAmt: number,
  vatRate: number,
): CartTotals {
  const lineSubtotal = r2(lines.reduce((s, l) => s + num(l.line_total), 0));

  const orderDiscAmt = r2(
    orderDiscount
      ? orderDiscount.type === "percentage"
        ? lineSubtotal * (num(orderDiscount.value) / 100)
        : num(orderDiscount.value)
      : 0,
  );

  const netAfterDisc = r2(Math.max(
    0,
    lineSubtotal - orderDiscAmt - num(loyaltyDiscAmt),
  ));
  const vat = r2(netAfterDisc * vatRate);
  const total = r2(netAfterDisc + vat);

  return {
    line_subtotal: lineSubtotal,
    order_disc_amt: orderDiscAmt,
    loyalty_disc_amt: loyaltyDiscAmt,
    net_after_disc: netAfterDisc,
    vat,
    total,
  };
}

function computeLineTotal(
  line: Omit<CartLine, "line_total" | "needs_approval" | "low_stock">,
): number {
  return r2(
    Math.max(
      0,
      num(line.unit_price) * num(line.quantity) - num(line.discount_amount),
    ),
  );
}

// ── Store definition ──────────────────────────────────────────────────────────

interface PosState {
  // Session / terminal
  terminal: PosTerminal | null;
  session: PosSession | null;

  // Current transaction
  customer: Contact | null;
  loyaltyInfo: LoyaltyInfo | null;
  loyaltyDisc: number; // Naira value of redeemed points
  lines: CartLine[];
  orderDiscount: OrderDiscount | null;
  applyVat: boolean; // VAT toggle for the current sale

  // Parked
  parked: ParkedTransaction[];

  // Offline sync
  pendingCount: number;
  isOnline: boolean;
  isSyncing: boolean;

  // Actions
  setTerminal: (t: PosTerminal | null) => void;
  setSession: (s: PosSession | null) => void;
  setCustomer: (c: Contact | null) => void;
  setLoyaltyInfo: (l: LoyaltyInfo | null) => void;
  setLoyaltyDisc: (n: number) => void;
  addLine: (product: {
    product_id: string;
    name: string;
    selling_price: number;
    min_selling_price: number;
    available_qty: number;
  }) => void;
  updateLineQty: (id: string, qty: number) => void;
  updateLinePrice: (id: string, price: number) => void;
  updateLineDisc: (id: string, discAmt: number) => void;
  removeLine: (id: string) => void;
  clearCart: () => void;
  setOrderDiscount: (d: OrderDiscount | null) => void;
  setApplyVat: (v: boolean) => void;
  parkCart: (label?: string) => Promise<void>;
  resumeParked: (parkId: string) => void;
  discardParked: (parkId: string) => Promise<void>;
  loadParked: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
  setIsOnline: (v: boolean) => void;
  setIsSyncing: (v: boolean) => void;
  setPendingCount: (n: number) => void;
}

export const usePOSStore = create<PosState>((set, get) => ({
  terminal: null,
  session: null,
  customer: null,
  loyaltyInfo: null,
  loyaltyDisc: 0,
  lines: [],
  orderDiscount: null,
  applyVat: true,
  parked: [],
  pendingCount: 0,
  isOnline: navigator.onLine,
  isSyncing: false,

  setTerminal: (t) => set({ terminal: t }),
  setSession: (s) => set({ session: s }),
  setCustomer: (c) => set({ customer: c, loyaltyInfo: null, loyaltyDisc: 0 }),
  setLoyaltyInfo: (l) => set({ loyaltyInfo: l }),
  setLoyaltyDisc: (n) => set({ loyaltyDisc: n }),

  addLine: (product) => {
    const { lines } = get();

    // If product already in cart, increment qty
    const existing = lines.find((l) => l.product_id === product.product_id);
    if (existing) {
      const newQty = existing.quantity + 1;
      const isBlocked = newQty > existing.stock_qty;
      if (isBlocked) return; // blocked — qty = 0
      set({
        lines: lines.map((l) =>
          l.id === existing.id
            ? {
                ...l,
                quantity: newQty,
                line_total: computeLineTotal({ ...l, quantity: newQty }),
              }
            : l,
        ),
      });
      return;
    }

    const sellingPrice = num(product.selling_price);
    const availableQty = num(product.available_qty);
    const line: CartLine = {
      id: uuid(),
      product_id: product.product_id,
      description: product.name,
      unit_price: sellingPrice,
      selling_price: sellingPrice,
      min_price: num(product.min_selling_price),
      quantity: 1,
      discount_amount: 0,
      line_total: sellingPrice,
      needs_approval: false,
      stock_qty: availableQty,
      low_stock: availableQty <= 3 && availableQty > 0,
    };
    set({ lines: [...lines, line] });
  },

  updateLineQty: (id, qty) =>
    set((state) => ({
      lines: state.lines.map((l) => {
        if (l.id !== id) return l;
        const newQty = Math.max(1, Math.min(qty, l.stock_qty));
        return {
          ...l,
          quantity: newQty,
          line_total: computeLineTotal({ ...l, quantity: newQty }),
        };
      }),
    })),

  updateLinePrice: (id, price) =>
    set((state) => ({
      lines: state.lines.map((l) => {
        if (l.id !== id) return l;
        return {
          ...l,
          unit_price: price,
          needs_approval: price < l.min_price,
          line_total: computeLineTotal({ ...l, unit_price: price }),
        };
      }),
    })),

  updateLineDisc: (id, discAmt) =>
    set((state) => ({
      lines: state.lines.map((l) => {
        if (l.id !== id) return l;
        return {
          ...l,
          discount_amount: discAmt,
          line_total: computeLineTotal({ ...l, discount_amount: discAmt }),
        };
      }),
    })),

  removeLine: (id) =>
    set((state) => ({ lines: state.lines.filter((l) => l.id !== id) })),

  clearCart: () =>
    set({
      lines: [],
      customer: null,
      loyaltyInfo: null,
      loyaltyDisc: 0,
      orderDiscount: null,
      applyVat: true,
    }),

  setOrderDiscount: (d) => set({ orderDiscount: d }),
  setApplyVat: (v) => set({ applyVat: v }),

  parkCart: async (label) => {
    // M6 fix: preserve loyalty state when parking
    const { customer, lines, orderDiscount, loyaltyInfo, loyaltyDisc } = get();
    if (!lines.length) return;
    const parkedTx: ParkedTransaction = {
      park_id: uuid(),
      parked_at: new Date().toISOString(),
      customer,
      lines,
      order_discount: orderDiscount,
      loyalty_info: loyaltyInfo,
      loyalty_disc: loyaltyDisc,
      label: label || `Parked at ${new Date().toLocaleTimeString()}`,
    };
    await saveParkedTransaction(parkedTx);
    set((state) => ({
      parked: [...state.parked, parkedTx],
      lines: [],
      customer: null,
      loyaltyInfo: null,
      loyaltyDisc: 0,
      orderDiscount: null,
      applyVat: true,
    }));
  },

  resumeParked: (parkId) => {
    const { parked } = get();
    const tx = parked.find((p) => p.park_id === parkId);
    if (!tx) return;
    // M6 fix: restore loyalty state when resuming
    set({
      lines: tx.lines,
      customer: tx.customer,
      orderDiscount: tx.order_discount,
      loyaltyInfo: tx.loyalty_info ?? null,
      loyaltyDisc: tx.loyalty_disc ?? 0,
      parked: parked.filter((p) => p.park_id !== parkId),
    });
    removeParkedTransaction(parkId).catch(() => {});
  },

  discardParked: async (parkId) => {
    await removeParkedTransaction(parkId);
    set((state) => ({
      parked: state.parked.filter((p) => p.park_id !== parkId),
    }));
  },

  loadParked: async () => {
    const parked = await getParkedTransactions();
    set({ parked });
  },

  refreshPendingCount: async () => {
    const count = await getPendingCount();
    set({ pendingCount: count });
  },

  setIsOnline: (v) => set({ isOnline: v }),
  setIsSyncing: (v) => set({ isSyncing: v }),
  setPendingCount: (n) => set({ pendingCount: n }),
}));
