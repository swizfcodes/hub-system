import { api } from "@services/api";
import type { SalesOrder, SalesListResponse, Invoice, PaymentMethod, FulfilmentType } from "@typedefs/sales";
import type {
  HandToLogisticsValues,
  GenerateInvoiceValues,
} from "@lib/schemas/sales";

const BASE = "/sales/orders";

export interface ListOrdersParams {
  page?: number;
  limit?: number;
  status?: string;
  source?: string;
  fulfilment_type?: string;
}

// ── Quick Sale (Direct Order) ──────────────────────────────────────────────

export interface DirectOrderLineInput {
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface DirectOrderPaymentInput {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface CreateDirectOrderPayload {
  contact_id: string;
  lines: DirectOrderLineInput[];
  payments: DirectOrderPaymentInput[];
  fulfilment_type?: FulfilmentType;
  currency?: string;
  exchange_rate?: number;
  apply_vat?: boolean;
  delivery_address?: string;
  courier_preference?: string;
}

export async function createDirectOrder(
  payload: CreateDirectOrderPayload,
): Promise<SalesOrder> {
  const { data } = await api.post<SalesOrder>(BASE, payload);
  return data;
}

export async function approveCampaignProof(
  orderId: string,
): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(
    `${BASE}/${orderId}/approve-proof`,
  );
  return data;
}

export async function syncCurrencyRates(): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(
    "/settings/currency-rates/sync",
  );
  return data;
}

export async function listOrders(
  params: ListOrdersParams = {},
): Promise<SalesListResponse<SalesOrder>> {
  try {
    const { data } = await api.get<SalesListResponse<SalesOrder>>(BASE, {
      params,
    });
    return data;
  } catch (err: unknown) {
    const e = err as { response?: { status?: number } };
    if (e?.response?.status === 404) return { data: [] };
    throw err;
  }
}

export async function getOrder(id: string): Promise<SalesOrder> {
  const { data } = await api.get<SalesOrder>(`${BASE}/${id}`);
  return data;
}

/** Generate an invoice from a confirmed order */
export async function generateInvoice(
  orderId: string,
  values: GenerateInvoiceValues,
): Promise<Invoice> {
  const { data } = await api.post<Invoice>(
    `/sales/orders/${orderId}/invoice`,
    values,
  );
  return data;
}

/** Hand a delivery order to the Logistics module */
export async function handToLogistics(
  orderId: string,
  values: HandToLogisticsValues,
): Promise<{ message: string; logistics_id: string }> {
  const { data } = await api.post<{ message: string; logistics_id: string }>(
    `/sales/orders/${orderId}/dispatch`,
    values,
  );
  return data;
}

export async function cancelOrder(
  orderId: string,
): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(
    `/sales/orders/${orderId}/cancel`,
  );
  return data;
}
