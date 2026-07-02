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
  location?: string; // city/state filter (matches contact + saved addresses)
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

// Per-business "Walk-in Customer" placeholder. POS requires a customer on
// every sale (sales_orders.contact_id is NOT NULL); this gives anonymous
// walk-ins a single reusable named contact instead of loosening the schema.
// Found-or-created by display_name so we never spawn duplicates.
export const WALK_IN_NAME = "Walk-in Customer";

export async function getOrCreateWalkInCustomer(): Promise<Contact> {
  const matches = await searchContacts(WALK_IN_NAME, 10);
  const existing = matches.find((c) => c.display_name === WALK_IN_NAME);
  if (existing) return existing;
  return createContact({
    display_name: WALK_IN_NAME,
    first_name: "Walk-in",
    last_name: "Customer",
    primary_phone: "0000000000",
    contact_type: ["customer"],
  });
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
