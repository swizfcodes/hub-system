import { api } from "@services/api";
import type {
  DeliveryZone,
  DeliverySettings,
  DeliveryRateCard,
} from "@lib/deliveryFee";

// Admin management of the delivery rate card (logistics module).

export async function listDeliveryZones(): Promise<DeliveryZone[]> {
  try {
    const { data } = await api.get<{ data: DeliveryZone[] }>(
      "/logistics/delivery-zones",
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function createDeliveryZone(
  payload: Partial<DeliveryZone>,
): Promise<DeliveryZone> {
  const { data } = await api.post<DeliveryZone>(
    "/logistics/delivery-zones",
    payload,
  );
  return data;
}

export async function updateDeliveryZone(
  id: string,
  payload: Partial<DeliveryZone>,
): Promise<DeliveryZone> {
  const { data } = await api.patch<DeliveryZone>(
    `/logistics/delivery-zones/${id}`,
    payload,
  );
  return data;
}

export async function deleteDeliveryZone(id: string): Promise<void> {
  await api.delete(`/logistics/delivery-zones/${id}`);
}

export async function getDeliverySettings(): Promise<DeliverySettings | null> {
  try {
    const { data } = await api.get<DeliverySettings>(
      "/logistics/delivery-settings",
    );
    return data;
  } catch {
    return null;
  }
}

export async function updateDeliverySettings(
  payload: Partial<DeliverySettings>,
): Promise<DeliverySettings> {
  const { data } = await api.put<DeliverySettings>(
    "/logistics/delivery-settings",
    payload,
  );
  return data;
}

export async function getDeliveryRateCard(): Promise<DeliveryRateCard | null> {
  try {
    const { data } = await api.get<DeliveryRateCard>(
      "/logistics/delivery-rate-card",
    );
    return data;
  } catch {
    return null;
  }
}
