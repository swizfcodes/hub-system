// All paths and param names match documents.routes.js exactly.

import { api } from "@services/api";
import type {
  HubDocument,
  DocumentsResponse,
  DocumentsFilter,
  VerifyResult,
  TagStat,
  DocumentTag,
  UploadDocumentInput,
} from "@typedefs/documents";

export async function listDocuments(
  filters: DocumentsFilter,
): Promise<DocumentsResponse> {
  const params: Record<string, string | number> = {};
  if (filters.business) params.business = filters.business;
  if (filters.document_type) params.document_type = filters.document_type;
  if (filters.reference_type) params.reference_type = filters.reference_type;
  if (filters.reference_id) params.reference_id = filters.reference_id;
  if (filters.search) params.search = filters.search;
  if (filters.page) params.page = filters.page;
  if (filters.limit) params.limit = filters.limit;
  if (filters.tags?.length) params.tags = filters.tags.join(",");

  const { data } = await api.get<DocumentsResponse>("/documents", { params });
  return data;
}

export async function getDocument(id: string): Promise<HubDocument> {
  const { data } = await api.get<HubDocument>(`/documents/${id}`);
  return data;
}

export async function downloadDocument(
  doc: Pick<
    HubDocument,
    "document_id" | "document_number" | "title" | "mime_type"
  >,
): Promise<{ verified: boolean }> {
  const response = await api.get(`/documents/${doc.document_id}/download`, {
    responseType: "blob",
  });

  const verified = response.headers["x-document-verified"] === "true";

  const blob = new Blob([response.data as BlobPart], { type: doc.mime_type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.document_number} - ${doc.title}`
    .replace(/[^a-z0-9\-_. ]/gi, "_")
    .trim();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { verified };
}

export async function verifyDocument(id: string): Promise<VerifyResult> {
  const { data } = await api.get<VerifyResult>(`/documents/${id}/verify`);
  return data;
}

export async function uploadDocument(
  input: UploadDocumentInput,
): Promise<HubDocument> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("business", input.business);
  form.append("document_type", input.document_type);
  if (input.title) form.append("title", input.title);
  if (input.reference_type) form.append("reference_type", input.reference_type);
  if (input.reference_id) form.append("reference_id", input.reference_id);
  if (input.tags?.length) form.append("tags", input.tags.join(","));

  const { data } = await api.post<HubDocument>("/documents", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function addDocumentTag(
  id: string,
  tagName: string,
  colour?: string,
): Promise<DocumentTag> {
  const { data } = await api.post<DocumentTag>(`/documents/${id}/tags`, {
    tag_name: tagName,
    colour,
  });
  return data;
}

export async function removeDocumentTag(
  id: string,
  tagName: string,
): Promise<{ removed: boolean }> {
  const { data } = await api.delete<{ removed: boolean }>(
    `/documents/${id}/tags/${encodeURIComponent(tagName)}`,
  );
  return data;
}

export async function listDocumentTags(business: string): Promise<TagStat[]> {
  const { data } = await api.get<{ data: TagStat[] }>("/documents/tags", {
    params: { business },
  });
  return data.data;
}

export async function deleteDocument(
  id: string,
): Promise<{ document_id: string; is_deleted: boolean; deleted_at: string }> {
  const { data } = await api.delete(`/documents/${id}`);
  return data;
}
