import { api } from "./api";

export interface AuditFeedEntry {
  log_id: string;
  occurred_at: string;
  user_name: string;
  business: string;
  module: string;
  action: string;
  table_name: string;
  record_id?: string;
}

export interface AuditFeedResult {
  data: AuditFeedEntry[];
  /** '24h' if results are from the last 24 hours, 'all_time' if fallback */
  window: "24h" | "all_time";
}

export async function getMyAuditFeed(
  params: { business?: string; limit?: number } = {},
): Promise<AuditFeedResult> {
  try {
    const { data } = await api.get<AuditFeedResult>("/audit/my-feed", {
      params,
    });
    return data;
  } catch {
    return { data: [], window: "24h" };
  }
}
