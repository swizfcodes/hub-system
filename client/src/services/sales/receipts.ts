import { api } from "@services/api";
import type { Receipt, SalesListResponse } from "@typedefs/sales";

const BASE = "/sales/receipts";

export async function listReceipts(params: {
  invoice_id?: string;
  page?: number;
  limit?: number;
}): Promise<SalesListResponse<Receipt>> {
  try {
    const { data } = await api.get<SalesListResponse<Receipt>>(BASE, {
      params,
    });
    return data;
  } catch (err: unknown) {
    const e = err as { response?: { status?: number } };
    if (e?.response?.status === 404) return { data: [] };
    throw err;
  }
}

export async function getReceipt(id: string): Promise<Receipt> {
  const { data } = await api.get<Receipt>(`${BASE}/${id}`);
  return data;
}

export async function openReceiptPdf(id: string): Promise<void> {
  const { openPdf } = await import("@lib/openPdf");
  return openPdf(`/sales/receipts/${id}/pdf`, `receipt-${id}.pdf`);
}
