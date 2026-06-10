// Supplier bills (supplier_invoices in the schema).

import { api, errMsg } from "../api";
import type {
  SupplierInvoice,
  SupplierInvoiceLine,
} from "@typedefs/purchasing";

export async function listBills(
  params: { status?: string; supplier_id?: string; po_id?: string } = {},
): Promise<SupplierInvoice[]> {
  try {
    const { data } = await api.get<
      { data: SupplierInvoice[] } | SupplierInvoice[]
    >("/purchasing/bills", { params });
    return Array.isArray(data) ? data : data.data;
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404)
      return [];
    throw e;
  }
}

export async function getBill(id: string): Promise<SupplierInvoice> {
  const { data } = await api.get<SupplierInvoice>(`/purchasing/bills/${id}`);
  return data;
}

export interface CreateBillPayload {
  supplier_id: string;
  po_id?: string;
  supplier_invoice_number: string;
  invoice_date: string;
  due_date: string;
  currency: string;
  amount?: number;
  amount_ngn?: number;
  notes?: string;
  document_id?: string;
  lines?: SupplierInvoiceLine[];
}

export async function createBill(
  payload: CreateBillPayload,
): Promise<SupplierInvoice> {
  const { data } = await api.post<SupplierInvoice>(
    "/purchasing/bills",
    payload,
  );
  return data;
}

export async function approveBill(id: string): Promise<SupplierInvoice> {
  const { data } = await api.post<SupplierInvoice>(
    `/purchasing/bills/${id}/approve`,
  );
  return data;
}

export async function payBill(
  id: string,
  payload: { amount: number; bank_account_code?: string },
): Promise<SupplierInvoice> {
  const { data } = await api.post<SupplierInvoice>(
    `/purchasing/bills/${id}/pay`,
    payload,
  );
  return data;
}

export async function disputeBill(
  id: string,
  reason: string,
): Promise<SupplierInvoice> {
  const { data } = await api.post<SupplierInvoice>(
    `/purchasing/bills/${id}/dispute`,
    { reason },
  );
  return data;
}

export { errMsg };
