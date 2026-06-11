import { api } from "@services/api";
import type {
  SalesDashboard,
  FinanceDashboard,
  StockDashboard,
  CustomerDashboard,
  LogisticsDashboard,
  OverviewData,
  YesterdaySummary,
  TodaySummary,
  MyRecentSale,
  AppNotification,
  NotificationPreference,
} from "@typedefs/dashboard";

// ── Dashboard API ─────────────────────────────────────────────────────────────

export async function getSalesData(params?: {
  start_date?: string;
  end_date?: string;
}): Promise<SalesDashboard | null> {
  try {
    const { data } = await api.get<SalesDashboard>("/dashboards/sales", {
      params,
    });
    return data;
  } catch {
    return null;
  }
}

export async function getFinanceData(params?: {
  start_date?: string;
  end_date?: string;
}): Promise<FinanceDashboard | null> {
  try {
    const { data } = await api.get<FinanceDashboard>("/dashboards/finance", {
      params,
    });
    return data;
  } catch {
    return null;
  }
}

export async function getStockData(): Promise<StockDashboard | null> {
  try {
    const { data } = await api.get<StockDashboard>("/dashboards/stock");
    return data;
  } catch {
    return null;
  }
}

export async function getCustomerData(params?: {
  start_date?: string;
  end_date?: string;
}): Promise<CustomerDashboard | null> {
  try {
    const { data } = await api.get<CustomerDashboard>("/dashboards/customers", {
      params,
    });
    return data;
  } catch {
    return null;
  }
}

export async function getLogisticsData(params?: {
  start_date?: string;
  end_date?: string;
}): Promise<LogisticsDashboard | null> {
  try {
    const { data } = await api.get<LogisticsDashboard>(
      "/dashboards/logistics",
      { params },
    );
    return data;
  } catch {
    return null;
  }
}

export async function getOverviewData(params?: {
  start_date?: string;
  end_date?: string;
}): Promise<OverviewData | null> {
  try {
    const { data } = await api.get<OverviewData>("/dashboards/overview", {
      params,
    });
    return data;
  } catch {
    return null;
  }
}

export async function getYesterdaySummary(): Promise<YesterdaySummary | null> {
  try {
    const { data } = await api.get<YesterdaySummary>("/dashboards/yesterday");
    return data;
  } catch {
    return null;
  }
}

export async function getTodaySummary(): Promise<TodaySummary | null> {
  try {
    const { data } = await api.get<TodaySummary>("/dashboards/today");
    return data;
  } catch {
    return null;
  }
}

export async function getMyRecentSales(): Promise<MyRecentSale[]> {
  try {
    const { data } = await api.get<{ data: MyRecentSale[] }>(
      "/dashboards/my-recent-sales",
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function getRetailPartnersData() {
  try {
    const { data } = await api.get("/dashboards/retail-partners");
    return data;
  } catch {
    return null;
  }
}

// ── Notifications API ─────────────────────────────────────────────────────────

export async function listNotifications(params?: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<{ data: AppNotification[]; unread_count: number }> {
  try {
    const { data } = await api.get("/notifications", { params });
    return data;
  } catch {
    return { data: [], unread_count: 0 };
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch("/notifications/read-all");
}

export async function getUnreadCount(): Promise<number> {
  try {
    const { data } = await api.get<{
      data: AppNotification[];
      unread_count: number;
    }>("/notifications", {
      params: { limit: 1 },
    });
    return data.unread_count;
  } catch {
    return 0;
  }
}

export async function listNotificationPreferences(): Promise<
  NotificationPreference[]
> {
  try {
    const { data } = await api.get<{ data: NotificationPreference[] }>(
      "/notifications/preferences",
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function setNotificationPreference(values: {
  notification_type: string;
  in_app?: boolean;
  email_enabled?: boolean;
  whatsapp_enabled?: boolean;
}): Promise<void> {
  await api.put("/notifications/preferences", values);
}
