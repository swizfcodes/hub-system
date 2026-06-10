import { api } from "@services/api";
import { getToken } from "@services/auth";
import { useBusinessStore } from "@stores/useBusinessStore";
import type {
  Delivery,
  DeliveryListResponse,
  DeliveryAddress,
  TrackingEntry,
  CourierSuggestResponse,
  SigningInfo,
} from "@typedefs/logistics";
import type {
  CreateDeliveryValues,
  MarkFailedValues,
  MarkReturnedValues,
  SignatureSubmitValues,
} from "@lib/schemas/logistics";

// ── List ──────────────────────────────────────────────────────────────────────

export interface DeliveryListParams {
  page?: number;
  limit?: number;
  status?: string;
}

export async function listDeliveries(
  params: DeliveryListParams = {},
): Promise<DeliveryListResponse> {
  try {
    const { data } = await api.get<DeliveryListResponse>("/logistics", {
      params,
    });
    return data;
  } catch {
    return { data: [] };
  }
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export async function getDelivery(id: string): Promise<Delivery | null> {
  try {
    const { data } = await api.get<Delivery>(`/logistics/${id}`);
    return data;
  } catch {
    return null;
  }
}

// ── Update details (waybill, fee) ────────────────────────────────────────────

export async function updateDeliveryDetails(
  id: string,
  fields: { waybill_number?: string; courier_order_id?: string; delivery_fee?: number },
): Promise<Delivery> {
  const { data } = await api.patch<Delivery>(`/logistics/${id}`, fields);
  return data;
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createDelivery(
  values: CreateDeliveryValues,
): Promise<Delivery> {
  const { data } = await api.post<Delivery>("/logistics", values);
  return data;
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export async function dispatchDelivery(deliveryId: string): Promise<Delivery> {
  const { data } = await api.post<Delivery>(
    `/logistics/${deliveryId}/dispatch`,
  );
  return data;
}

// ── Mark delivered (manual fallback) ─────────────────────────────────────────

export async function markDelivered(deliveryId: string): Promise<Delivery> {
  const { data } = await api.post<Delivery>(
    `/logistics/${deliveryId}/mark-delivered`,
  );
  return data;
}

// ── Mark failed ───────────────────────────────────────────────────────────────

export async function markFailed(
  deliveryId: string,
  values: MarkFailedValues,
): Promise<Delivery> {
  const { data } = await api.post<Delivery>(
    `/logistics/${deliveryId}/mark-failed`,
    values,
  );
  return data;
}

// ── Mark returned ─────────────────────────────────────────────────────────────

export async function markReturned(
  deliveryId: string,
  values: MarkReturnedValues,
): Promise<Delivery> {
  const { data } = await api.post<Delivery>(
    `/logistics/${deliveryId}/mark-returned`,
    values,
  );
  return data;
}

// ── Tracking ──────────────────────────────────────────────────────────────────

export async function getTracking(
  deliveryId: string,
): Promise<TrackingEntry[]> {
  try {
    const { data } = await api.get<TrackingEntry[]>(
      `/logistics/${deliveryId}/tracking`,
    );
    return data;
  } catch {
    return [];
  }
}

// ── Packing slip ──────────────────────────────────────────────────────────────

export function packingSlipUrl(deliveryId: string): string {
  const token = getToken();
  const biz = useBusinessStore.getState().active;
  const params = [token ? `token=${token}` : "", biz ? `business=${biz}` : ""]
    .filter(Boolean)
    .join("&");
  return `${api.defaults.baseURL}/logistics/${deliveryId}/packing-slip${params ? `?${params}` : ""}`;
}

// ── Courier suggest ───────────────────────────────────────────────────────────

export async function suggestCouriers(
  address: DeliveryAddress,
): Promise<CourierSuggestResponse | null> {
  try {
    const { data } = await api.post<CourierSuggestResponse>(
      "/logistics/suggest",
      {
        delivery_address: address,
      },
    );
    return data;
  } catch {
    return null;
  }
}

// ── Public sign endpoints (no auth) ──────────────────────────────────────────

export async function getSigningInfo(token: string): Promise<SigningInfo> {
  const { data } = await api.get<SigningInfo>(`/sign/${token}`);
  return data;
}

export async function submitSignatures(
  token: string,
  values: SignatureSubmitValues,
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post(`/sign/${token}`, values);
  return data;
}
