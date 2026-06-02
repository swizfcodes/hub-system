import { api } from "../api";

export interface StockAlert {
  notification_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  location_id?: string;
  location_name?: string;
  on_hand: number;
  reorder_level: number;
  type: "low_stock" | "out_of_stock" | "expiring_batch" | "expired_batch";
  created_at: string;
  is_read: boolean;
}

export async function listAlerts(): Promise<StockAlert[]> {
  try {
    const { data } = await api.get<{ data: StockAlert[] } | StockAlert[]>(
      "/stock/alerts",
    );
    return Array.isArray(data) ? data : data.data;
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404)
      return [];
    throw e;
  }
}

export async function markAlertRead(notificationId: string): Promise<void> {
  await api.post(`/notifications/${notificationId}/read`);
}
