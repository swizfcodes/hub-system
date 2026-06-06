import axios from "axios";
import { api } from "../api";
import type {
  Contact,
  ContactAddress,
  ContactTimeline,
  ContactListResponse,
} from "@typedefs/contacts";

export interface ListParams {
  search?: string;
  type?: string; // single backend filter; we filter multi-types client-side
  page?: number;
  limit?: number;
}

export async function listContacts(
  params: ListParams = {},
): Promise<ContactListResponse> {
  const { data } = await api.get<ContactListResponse>("/contacts", { params });
  return data;
}

export async function getContact(id: string): Promise<Contact> {
  const { data } = await api.get<Contact>(`/contacts/${id}`);
  return data;
}

export async function createContact(
  payload: Partial<Contact>,
): Promise<Contact> {
  const { data } = await api.post<Contact>("/contacts", payload);
  return data;
}

export async function updateContact(
  id: string,
  patch: Partial<Contact>,
): Promise<Contact> {
  const { data } = await api.patch<Contact>(`/contacts/${id}`, patch);
  return data;
}

export async function deleteContact(id: string): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(`/contacts/${id}`);
  return data;
}

export async function getTimeline(id: string): Promise<ContactTimeline> {
  const { data } = await api.get<ContactTimeline>(`/contacts/${id}/timeline`);
  return data;
}

export async function addAddress(
  id: string,
  payload: Partial<ContactAddress>,
): Promise<ContactAddress> {
  const { data } = await api.post<ContactAddress>(
    `/contacts/${id}/addresses`,
    payload,
  );
  return data;
}

/**
 * searchContacts — quick search for typeaheads.
 * Returns an array (never throws) — suitable for live search dropdowns.
 */
export async function searchContacts(
  search: string,
  limit = 10,
): Promise<Contact[]> {
  try {
    const { data } = await api.get<{ data: Contact[] }>("/contacts", {
      params: { search, limit },
    });
    return data.data ?? [];
  } catch {
    return [];
  }
}

// ── Walk-in QR (permanent, per-business) ──────────────────────────────────────

export async function getWalkinQR(
  business: string,
): Promise<{ qr_code_url: string; join_url: string }> {
  const { data } = await api.get<{ qr_code_url: string; join_url: string }>(
    `/contacts/register-qr/${business}`,
  );
  return data;
}

export interface WalkinRegistrationPayload {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address_city?: string;
  address_state?: string;
  wants_birthday?: boolean;
  birthday_month?: number;
  birthday_day?: number;
}

const walkinApi = axios.create({ baseURL: "/api/contacts" });

export async function submitWalkinRegistration(
  business: string,
  payload: WalkinRegistrationPayload,
): Promise<void> {
  await walkinApi.post(`/register/${business}`, payload);
}
