import { api } from "@services/api";
import type {
  CreditNote,
  CreditNoteListResponse,
  CreditNoteStatus,
} from "@typedefs/invoicing";
import type { CreateCreditNoteValues } from "@lib/schemas/invoicing";

export async function listCreditNotes(params?: {
  invoice_id?: string;
  status?: CreditNoteStatus;
  page?: number;
}): Promise<CreditNoteListResponse> {
  try {
    const { data } = await api.get<CreditNoteListResponse>(
      "/invoicing/credit-notes",
      { params },
    );
    return data;
  } catch {
    return { data: [] };
  }
}

export async function getCreditNote(id: string): Promise<CreditNote | null> {
  try {
    const { data } = await api.get<CreditNote>(`/invoicing/credit-notes/${id}`);
    return data;
  } catch {
    return null;
  }
}

export async function createCreditNote(
  invoiceId: string,
  values: CreateCreditNoteValues,
): Promise<CreditNote> {
  const { data } = await api.post<CreditNote>("/invoicing/credit-notes", {
    invoice_id: invoiceId,
    ...values,
  });
  return data;
}

export async function issueCreditNote(
  creditNoteId: string,
): Promise<CreditNote> {
  const { data } = await api.post<CreditNote>(
    `/invoicing/credit-notes/${creditNoteId}/issue`,
  );
  return data;
}

export async function setCreditNoteStatus(
  creditNoteId: string,
  status: "applied" | "refunded",
): Promise<CreditNote> {
  const { data } = await api.post<CreditNote>(
    `/invoicing/credit-notes/${creditNoteId}/status`,
    { status },
  );
  return data;
}
