/**
 * contacts.ts — Contact search and creation.
 * Shared by POS (customer lookup) and Sales (QuoteFormModal).
 * Endpoint: /api/contacts (shared schema, not business-scoped).
 *
 * The Contact type itself lives in `@typedefs/contacts` — this file
 * just re-exports it so existing call sites that import from
 * `@services/contacts` keep working without dragging in a duplicate,
 * narrower copy of the type. The duplicate shape would otherwise
 * conflict with the canonical typedef in places like posStore.
 */
import { api } from '@services/api';
import type { Contact } from '@typedefs/contacts';

export type { Contact };

export interface CreateContactData {
  display_name:    string;
  primary_phone:   string;
  contact_type:    string[];
  whatsapp_number?: string;
  email?:          string;
  first_name?:     string;
  last_name?:      string;
  source?:         string;
}

export async function searchContacts(
  search: string,
  limit = 10,
): Promise<Contact[]> {
  try {
    const { data } = await api.get<{ data: Contact[] }>('/contacts', {
      params: { search, limit },
    });
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function getContact(id: string): Promise<Contact | null> {
  try {
    const { data } = await api.get<Contact>(`/contacts/${id}`);
    return data;
  } catch {
    return null;
  }
}

export async function createContact(payload: CreateContactData): Promise<Contact> {
  const { data } = await api.post<Contact>('/contacts', {
    ...payload,
    contact_type: payload.contact_type ?? ['customer'],
    source:       payload.source ?? 'pos',
  });
  return data;
}
