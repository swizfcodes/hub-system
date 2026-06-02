import { api } from "../api";
import type { DocumentSequence } from "@typedefs/settings";

export async function listDocumentSequences(
  business?: string,
): Promise<DocumentSequence[]> {
  const { data } = await api.get<DocumentSequence[]>(
    "/settings/document-sequences",
    { params: { business } },
  );
  return data;
}
export async function upsertDocumentSequence(
  payload: Partial<DocumentSequence>,
): Promise<DocumentSequence> {
  const { data } = await api.post<DocumentSequence>(
    "/settings/document-sequences",
    payload,
  );
  return data;
}
export async function updateDocumentSequence(
  id: string,
  patch: Partial<DocumentSequence> & { reset_reason?: string },
): Promise<DocumentSequence> {
  const { data } = await api.patch<DocumentSequence>(
    `/settings/document-sequences/${id}`,
    patch,
  );
  return data;
}
