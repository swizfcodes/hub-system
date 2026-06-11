import { api } from "../api";
import type { Supplier } from "@typedefs/purchasing";

export async function listSuppliers(
  params: {
    search?: string;
    contact_id?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{ data: Supplier[] }> {
  const { data } = await api.get<{ data: Supplier[] }>(
    "/purchasing/suppliers",
    { params },
  );
  return data;
}

export async function getSupplier(id: string): Promise<Supplier> {
  const { data } = await api.get<Supplier>(`/purchasing/suppliers/${id}`);
  return data;
}

export async function createSupplier(payload: {
  contact_id: string;
  payment_terms_days?: number;
  preferred_currency?: string;
  notes?: string;
}): Promise<Supplier> {
  const { data } = await api.post<Supplier>("/purchasing/suppliers", payload);
  return data;
}

/**
 * The backend doesn't yet expose an "invite supplier" endpoint that generates
 * a portal_access_token. Until it does, this helper:
 *   1. Creates a shared.contacts row with contact_type=['supplier']
 *   2. Calls createSupplier(contact_id) to create the supplier record
 *
 * When the backend adds POST /purchasing/suppliers/invite (returning {token}),
 * we'll switch to calling that and emailing the token URL.
 */
import { createContact } from "@services/contacts/contacts";
export async function inviteOrCreateSupplier(input: {
  contact_id?: string;
  display_name?: string;
  company_name?: string;
  email: string;
  primary_phone?: string;
  whatsapp_number?: string;
  visible_to: string[];
  payment_terms_days?: number;
  preferred_currency?: string;
  notes?: string;
}): Promise<Supplier> {
  let contactId = input.contact_id;
  if (!contactId) {
    const contact = await createContact({
      display_name: input.display_name || input.company_name || input.email,
      company_name: input.company_name || undefined,
      contact_type: ["supplier"],
      primary_phone: input.primary_phone || "",
      whatsapp_number: input.whatsapp_number || undefined,
      email: input.email,
      visible_to: input.visible_to,
      priority_level: "regular",
    });
    contactId = contact.contact_id;
  }
  return createSupplier({
    contact_id: contactId,
    payment_terms_days: input.payment_terms_days,
    preferred_currency: input.preferred_currency,
    notes: input.notes,
  });
}
