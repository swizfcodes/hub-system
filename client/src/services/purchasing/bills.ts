// Supplier bills (supplier_invoices in the schema). The backend doesn't expose
// CRUD endpoints yet — see backend/PROCUREMENT_PATCH_NOTES.md §bills.
// All functions here fail soft (return empty / stub responses) so the UI loads.

import { api, errMsg } from '../api';
import type { SupplierInvoice } from '@typedefs/purchasing';

export async function listBills(params: { status?: string; supplier_id?: string } = {}): Promise<SupplierInvoice[]> {
  try {
    const { data } = await api.get<{ data: SupplierInvoice[] } | SupplierInvoice[]>('/purchasing/bills', { params });
    return Array.isArray(data) ? data : data.data;
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404) return [];
    throw e;
  }
}

export async function getBill(id: string): Promise<SupplierInvoice> {
  const { data } = await api.get<SupplierInvoice>(`/purchasing/bills/${id}`);
  return data;
}

export async function createBill(payload: Partial<SupplierInvoice>): Promise<SupplierInvoice> {
  const { data } = await api.post<SupplierInvoice>('/purchasing/bills', payload);
  return data;
}

export async function approveBill(id: string): Promise<SupplierInvoice> {
  const { data } = await api.post<SupplierInvoice>(`/purchasing/bills/${id}/approve`);
  return data;
}

export async function disputeBill(id: string, reason: string): Promise<SupplierInvoice> {
  const { data } = await api.post<SupplierInvoice>(`/purchasing/bills/${id}/dispute`, { reason });
  return data;
}

export { errMsg };
