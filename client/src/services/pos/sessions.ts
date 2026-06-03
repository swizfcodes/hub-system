import { api } from "@services/api";
import type { PosSession, XReport, ZReport } from "@typedefs/pos";
import type { OpenSessionValues, CloseSessionValues } from "@lib/schemas/pos";

export async function openSession(
  values: OpenSessionValues,
): Promise<PosSession> {
  const { data } = await api.post<PosSession>("/pos/sessions/open", values);
  return data;
}

export async function getSession(
  sessionId: string,
): Promise<PosSession | null> {
  try {
    const { data } = await api.get<PosSession>(`/pos/sessions/${sessionId}`);
    return data;
  } catch {
    return null;
  }
}

export async function listSessions(params?: {
  terminal_id?: string;
  days?: number;
}): Promise<PosSession[]> {
  try {
    const { data } = await api.get<{ data: PosSession[] }>("/pos/sessions", {
      params,
    });
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function closeSession(
  sessionId: string,
  values: CloseSessionValues,
): Promise<{ session: PosSession; reconciliation: unknown }> {
  const { data } = await api.post(`/pos/sessions/${sessionId}/close`, values);
  return data;
}

export async function getXReport(sessionId: string): Promise<XReport> {
  const { data } = await api.get<XReport>(
    `/pos/sessions/${sessionId}/x-report`,
  );
  return data;
}

export async function getZReport(sessionId: string): Promise<ZReport> {
  const { data } = await api.get<ZReport>(
    `/pos/sessions/${sessionId}/z-report`,
  );
  return data;
}

export async function markReconciled(
  sessionId: string,
  notes?: string,
): Promise<void> {
  await api.post(`/pos/sessions/${sessionId}/reconcile`, {
    sign_off_notes: notes,
  });
}
