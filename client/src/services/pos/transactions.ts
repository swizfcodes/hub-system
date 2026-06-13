import { api } from "@services/api";
import { getToken } from "@services/auth";
import { useBusinessStore } from "@stores/useBusinessStore";
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
  currency?: string;
  exchange_rate?: number | null;
  change_handling?: "return" | "keep";
  apply_vat?: boolean;
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
  const token = getToken();
  const biz = useBusinessStore.getState().active;
  const params = [token ? `token=${token}` : "", biz ? `business=${biz}` : ""]
    .filter(Boolean)
    .join("&");
  return `${api.defaults.baseURL}/pos/transactions/${transactionId}/receipt.pdf${params ? `?${params}` : ""}`;
}

// ── Invoice from POS ──────────────────────────────────────────────────────────

export interface PosInvoiceResult {
  invoice_id: string;
  invoice_number: string;
  total_amount: number;
  status: string;
  already_existed?: boolean;
  bank_account: {
    account_id: string;
    bank_name: string;
    account_name: string;
    account_number: string;
    sort_code?: string;
    currency: string;
  } | null;
}

export async function generateInvoiceFromTransaction(
  transactionId: string,
  dueDate?: string,
): Promise<PosInvoiceResult> {
  const { data } = await api.post<PosInvoiceResult>(
    `/pos/transactions/${transactionId}/invoice`,
    { due_date: dueDate },
  );
  return data;
}

// ── Confirm bank-transfer payment ─────────────────────────────────────────────

export async function confirmTransactionPayment(
  transactionId: string,
  options?: { reference?: string; notes?: string },
): Promise<{
  confirmed: boolean;
  invoice_id: string;
  invoice_number: string;
  receipt_sent: boolean;
  receipt_error: string | null;
}> {
  const { data } = await api.post(
    `/pos/transactions/${transactionId}/confirm-payment`,
    options ?? {},
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
      change_handling: t.change_handling,
      apply_vat: t.apply_vat,
      currency: t.currency,
      exchange_rate: t.exchange_rate,
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
