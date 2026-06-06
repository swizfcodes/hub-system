import { api } from "@services/api";
import type { Invoice, SalesListResponse } from "@typedefs/sales";
import type { RecordPaymentValues } from "@lib/schemas/sales";

// Invoice CRUD lives under the existing /invoicing module.
// Only payment-link refresh and order→invoice generation are new endpoints
// added to /sales — see SALES_PATCH_NOTES.md.
const BASE = "/invoicing";

export interface ListInvoicesParams {
  page?: number;
  limit?: number;
  status?: string;
  contactId?: string;
  orderId?: string;
}

export async function listInvoices(
  params: ListInvoicesParams = {},
): Promise<SalesListResponse<Invoice>> {
  try {
    const { data } = await api.get<SalesListResponse<Invoice>>(BASE, {
      params,
    });
    return data;
  } catch (err: unknown) {
    const e = err as { response?: { status?: number } };
    if (e?.response?.status === 404) return { data: [] };
    throw err;
  }
}

export async function getInvoice(id: string): Promise<Invoice> {
  const { data } = await api.get<Invoice>(`${BASE}/${id}`);
  return data;
}

export async function recordPayment(
  invoiceId: string,
  values: RecordPaymentValues,
): Promise<{
  invoice: Invoice;
  receipt: { receipt_id: string; receipt_number: string };
}> {
  const { data } = await api.post<{
    invoice: Invoice;
    receipt: { receipt_id: string; receipt_number: string };
  }>(`${BASE}/${invoiceId}/payments`, values);
  return data;
}

/** Regenerate Paystack + Stripe payment links (NEW endpoint on invoicing module) */
export async function refreshPaymentLinks(
  invoiceId: string,
): Promise<{ paystack_payment_url: string; stripe_payment_url: string }> {
  const { data } = await api.post<{
    paystack_payment_url: string;
    stripe_payment_url: string;
  }>(`${BASE}/${invoiceId}/payment-links`);
  return data;
}

export async function sendInvoice(
  invoiceId: string,
  channel: "email" | "whatsapp",
): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(
    `${BASE}/${invoiceId}/send`,
    { channel },
  );
  return data;
}

export async function voidInvoice(
  invoiceId: string,
): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(
    `${BASE}/${invoiceId}/void`,
  );
  return data;
}

export async function openInvoicePdf(id: string): Promise<void> {
  const { openPdf } = await import("@lib/openPdf");
  return openPdf(`/invoicing/${id}/pdf`, `invoice-${id}.pdf`);
}

/** Fetch the invoice generated from a specific order */
export async function getInvoiceByOrderId(
  orderId: string,
): Promise<Invoice | null> {
  try {
    const result = await listInvoices({ orderId });
    return result.data[0] ?? null;
  } catch {
    return null;
  }
}
