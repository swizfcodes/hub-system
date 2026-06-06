/**
 * purchaseOrders.ts — Purchase Order service
 *
 * Renamed from pos.ts (which was confusingly named the same as Point-of-Sale).
 * The old pos.ts is kept as a re-export for backward compatibility with any
 * remaining imports — update them to use purchaseOrders.ts directly.
 */
import { api } from "../api";
import type {
  PurchaseOrder,
  GoodsReceipt,
  POStatus,
} from "@typedefs/purchasing";

export async function listPOs(
  params: {
    status?: POStatus;
    supplier_id?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{ data: PurchaseOrder[] }> {
  const { data } = await api.get<{ data: PurchaseOrder[] }>(
    "/purchasing/purchase-orders",
    { params },
  );
  return data;
}

export async function getPO(id: string): Promise<PurchaseOrder> {
  const { data } = await api.get<PurchaseOrder>(
    `/purchasing/purchase-orders/${id}`,
  );
  return data;
}

export interface CreatePOPayload {
  supplier_id: string;
  rfq_id?: string;
  expected_delivery?: string;
  delivery_address?: string;
  shipping_cost?: number;
  import_duty?: number;
  other_charges?: number;
  currency: string;
  exchange_rate?: number;
  notes?: string;
  lines: Array<{
    product_id: string;
    quantity_ordered: number;
    unit_price: number;
  }>;
}

export async function createPO(
  payload: CreatePOPayload,
): Promise<PurchaseOrder> {
  const { data } = await api.post<PurchaseOrder>(
    "/purchasing/purchase-orders",
    payload,
  );
  return data;
}

export interface ReceivePayload {
  receiving_location_id?: string;
  notes?: string;
  lines: Array<{
    po_line_id: string;
    quantity_received: number;
    quantity_accepted: number;
    quantity_rejected: number;
    rejection_reason?: string;
  }>;
}

export async function receiveGoods(
  poId: string,
  payload: ReceivePayload,
): Promise<GoodsReceipt> {
  const { data } = await api.post<GoodsReceipt>(
    `/purchasing/purchase-orders/${poId}/receive`,
    payload,
  );
  return data;
}

export async function sendPO(poId: string): Promise<PurchaseOrder> {
  const { data } = await api.post<PurchaseOrder>(
    `/purchasing/purchase-orders/${poId}/send`,
  );
  return data;
}

export async function listReceiptsForPO(poId: string): Promise<GoodsReceipt[]> {
  const { data } = await api.get<{ data: GoodsReceipt[] }>(
    `/purchasing/purchase-orders/${poId}/receipts`,
  );
  return data.data ?? [];
}
