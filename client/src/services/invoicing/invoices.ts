// ── services/invoicing/invoices.ts ────────────────────────────────────────────
import { api } from "@services/api";
import type {
  Invoice,
  InvoiceListResponse,
  InvoiceKpis,
  InvoicePayment,
} from "@typedefs/invoicing";
import type {
  CreateInvoiceValues,
  RecordPaymentValues,
  SendInvoiceValues,
  WriteOffValues,
} from "@lib/schemas/invoicing";

// ── List ──────────────────────────────────────────────────────────────────────

export interface InvoiceListParams {
  page?: number;
  limit?: number;
  status?: string;
  contactId?: string;
}

export async function listInvoices(
  params: InvoiceListParams = {},
): Promise<InvoiceListResponse> {
  try {
    const { data } = await api.get<InvoiceListResponse>("/invoicing", {
      params,
    });
    return data;
  } catch {
    return { data: [] };
  }
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export async function getInvoice(id: string): Promise<Invoice | null> {
  try {
    const { data } = await api.get<Invoice>(`/invoicing/${id}`);
    return data;
  } catch {
    return null;
  }
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createInvoice(
  values: CreateInvoiceValues,
): Promise<Invoice> {
  const { data } = await api.post<Invoice>("/invoicing", values);
  return data;
}

// ── Record payment ────────────────────────────────────────────────────────────

export async function recordPayment(
  invoiceId: string,
  values: RecordPaymentValues,
): Promise<InvoicePayment> {
  const { data } = await api.post<InvoicePayment>(
    `/invoicing/${invoiceId}/payments`,
    values,
  );
  return data;
}

// ── Send ──────────────────────────────────────────────────────────────────────

export async function sendInvoice(
  invoiceId: string,
  values: SendInvoiceValues,
): Promise<void> {
  await api.post(`/invoicing/${invoiceId}/send`, values);
}

// ── Void ──────────────────────────────────────────────────────────────────────

export async function voidInvoice(invoiceId: string): Promise<void> {
  await api.post(`/invoicing/${invoiceId}/void`);
}

// ── Write-off ─────────────────────────────────────────────────────────────────

export async function writeOffInvoice(
  invoiceId: string,
  values: WriteOffValues,
): Promise<{ invoice_id: string; status: string; amount_written_off: number }> {
  const { data } = await api.post(`/invoicing/${invoiceId}/write-off`, values);
  return data;
}

// ── PDF ───────────────────────────────────────────────────────────────────────
// Must go through axios so the Authorization header is included.
// window.open(url) is a raw browser request — no token, always 401.

export async function openInvoicePdf(invoiceId: string): Promise<void> {
  const response = await api.get(`/invoicing/${invoiceId}/pdf`, {
    responseType: "blob",
  });
  const blob = new Blob([response.data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  // Revoke the object URL after the tab has had time to load it
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  if (!win) {
    // Fallback: trigger a download if the browser blocked the popup
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${invoiceId}.pdf`;
    a.click();
  }
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

export async function getInvoiceKpis(): Promise<InvoiceKpis | null> {
  try {
    const { data } = await api.get<InvoiceKpis>("/invoicing/kpis");
    return data;
  } catch {
    return null;
  }
}
