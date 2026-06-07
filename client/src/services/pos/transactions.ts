import { api } from "@services/api";
import type {
  PosTransaction,
  PendingTransaction,
  SyncResponse,
} from "@typedefs/pos";
import type { ReturnValues } from "@lib/schemas/pos";

// ── Online transaction ────────────────────────────────────────────────────────

export interface CreateTransactionPayload {
  session_id: string;
  contact_id?: string;
  lines: {
    product_id?: string;
    description: string;
    quantity: number;
    unit_price: number;
    discount_amount?: number;
  }[];
  payments: {
    payment_method: string;
    amount: number;
    reference?: string;
    paystack_reference?: string;
  }[];
  fulfilment_type?: "walk_in" | "dispatch";
}

export async function createTransaction(
  payload: CreateTransactionPayload,
): Promise<PosTransaction> {
  const { data } = await api.post<PosTransaction>("/pos/transactions", payload);
  return data;
}

export async function getTransaction(
  id: string,
): Promise<PosTransaction | null> {
  try {
    const { data } = await api.get<PosTransaction>(`/pos/transactions/${id}`);
    return data;
  } catch {
    return null;
  }
}

export async function voidTransaction(
  id: string,
  void_reason: string,
): Promise<void> {
  await api.post(`/pos/transactions/${id}/void`, { void_reason });
}

// ── Receipt ───────────────────────────────────────────────────────────────────

export async function sendReceipt(
  transactionId: string,
  options: {
    channel?: "whatsapp" | "email" | "both" | "auto";
    overrideTo?: string;
  },
): Promise<{ sent: boolean; channel: string; results: unknown }> {
  const { data } = await api.post(
    `/pos/transactions/${transactionId}/receipt`,
    options,
  );
  return data;
}

export function receiptPdfUrl(transactionId: string): string {
  return `${api.defaults.baseURL}/pos/transactions/${transactionId}/receipt.pdf`;
}

// ── Invoice from POS ──────────────────────────────────────────────────────────

export async function generateInvoiceFromTransaction(
  transactionId: string,
  dueDate?: string,
): Promise<{
  invoice_id: string;
  invoice_number: string;
  paystack_payment_url?: string;
}> {
  const { data } = await api.post(
    `/pos/transactions/${transactionId}/invoice`,
    { due_date: dueDate },
  );
  return data;
}

// ── Return ────────────────────────────────────────────────────────────────────

export async function createReturn(
  transactionId: string,
  values: ReturnValues,
): Promise<{
  refund_total: number;
  refund_method: string;
  returned_lines: unknown[];
}> {
  const { data } = await api.post(
    `/pos/transactions/${transactionId}/return`,
    values,
  );
  return data;
}

// ── Manager PIN verification ──────────────────────────────────────────────────

export async function verifyManager(
  email: string,
  password: string,
): Promise<{ approved: boolean; manager_id: string; display_name: string }> {
  const { data } = await api.post("/auth/verify-manager", { email, password });
  return data;
}

// ── Offline batch sync ────────────────────────────────────────────────────────

export async function syncOfflineTransactions(
  sessionId: string,
  transactions: PendingTransaction[],
): Promise<SyncResponse> {
  const { data } = await api.post<SyncResponse>("/pos/sync", {
    session_id: sessionId,
    transactions: transactions.map((t) => ({
      offline_id: t.offline_id,
      lines: t.lines,
      payments: t.payments,
      contact_id: t.contact_id,
      created_at_offline: t.created_at_offline,
    })),
  });
  return data;
}

// ── Loyalty (at POS) ─────────────────────────────────────────────────────────

export async function getLoyaltyInfo(contactId: string) {
  try {
    const { data } = await api.get(`/loyalty/${contactId}`);
    return data;
  } catch {
    return null;
  }
}

export async function redeemLoyaltyPoints(
  contactId: string,
  points: number,
  transactionId: string,
): Promise<{ balance_after: number }> {
  const { data } = await api.post(`/loyalty/${contactId}/redeem`, {
    points,
    reference_type: "pos_transaction",
    reference_id: transactionId,
  });
  return data;
}
