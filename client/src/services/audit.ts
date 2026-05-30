import { api } from './api';

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

export async function getAuditFeed(params: { business?: string; module?: string; limit?: number } = {}): Promise<AuditFeedEntry[]> {
  try {
    const { data } = await api.get<{ data: AuditFeedEntry[] }>('/audit/feed', { params });
    return data.data ?? [];
  } catch {
    return [];
  }
}
