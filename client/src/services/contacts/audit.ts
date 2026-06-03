// Thin service for the contact's Audit tab.
// Backend: GET /api/audit/record/:table/:id (see backend/PATCH_NOTES.md — must be mounted)

import { api } from "../api";

export interface AuditEntry {
  log_id: string;
  occurred_at: string;
  user_name: string;
  user_email?: string | null;
  action: string;
  before_state?: unknown;
  after_state?: unknown;
}

export async function getRecordAudit(
  table: string,
  recordId: string,
  limit = 50,
): Promise<AuditEntry[]> {
  try {
    const { data } = await api.get<{ data: AuditEntry[] }>(
      `/audit/record/${table}/${recordId}`,
      { params: { limit } },
    );
    return data.data ?? [];
  } catch {
    // /audit may not be mounted yet on the backend — fail soft so the rest of the page still loads
    return [];
  }
}
