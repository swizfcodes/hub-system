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

export function computeTotals(
  lines: CartLine[],
  orderDiscount: OrderDiscount | null,
  loyaltyDiscAmt: number,
  vatRate: number,
): CartTotals {
  const lineSubtotal = lines.reduce((s, l) => s + l.line_total, 0);

  const orderDiscAmt = orderDiscount
    ? orderDiscount.type === "percentage"
      ? lineSubtotal * (orderDiscount.value / 100)
      : orderDiscount.value
    : 0;

  const netAfterDisc = Math.max(
    0,
    lineSubtotal - orderDiscAmt - loyaltyDiscAmt,
  );
  const vat = netAfterDisc * vatRate;
  const total = netAfterDisc + vat;

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
  return Math.max(0, line.unit_price * line.quantity - line.discount_amount);
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

    const line: CartLine = {
      id: uuid(),
      product_id: product.product_id,
      description: product.name,
      unit_price: product.selling_price,
      selling_price: product.selling_price,
      min_price: product.min_selling_price,
      quantity: 1,
      discount_amount: 0,
      line_total: product.selling_price,
      needs_approval: false,
      stock_qty: product.available_qty,
      low_stock: product.available_qty <= 3 && product.available_qty > 0,
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
    }),

  setOrderDiscount: (d) => set({ orderDiscount: d }),

  parkCart: async (label) => {
    const { customer, lines, orderDiscount } = get();
    if (!lines.length) return;
    const parkedTx: ParkedTransaction = {
      park_id: uuid(),
      parked_at: new Date().toISOString(),
      customer,
      lines,
      order_discount: orderDiscount,
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
    }));
  },

  resumeParked: (parkId) => {
    const { parked } = get();
    const tx = parked.find((p) => p.park_id === parkId);
    if (!tx) return;
    set({
      lines: tx.lines,
      customer: tx.customer,
      orderDiscount: tx.order_discount,
      loyaltyDisc: 0,
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
