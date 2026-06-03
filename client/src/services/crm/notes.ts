import { api } from "../api";
import type { DealNote } from "@typedefs/crm";

export async function listNotes(dealId: string): Promise<DealNote[]> {
  const { data } = await api.get<{ data: DealNote[] } | DealNote[]>(
    `/crm/deals/${dealId}/notes`,
  );
  return Array.isArray(data) ? data : data.data;
}

export async function addNote(
  dealId: string,
  payload: { content: string; is_pinned?: boolean },
): Promise<DealNote> {
  const { data } = await api.post<DealNote>(
    `/crm/deals/${dealId}/notes`,
    payload,
  );
  return data;
}
