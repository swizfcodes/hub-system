// Concierge profile services — preferences + milestones + wishlist.
//
// Backend status (as of this commit):
//   - shared.customer_preferences  → schema EXISTS, but no REST endpoints
//   - shared.customer_milestones   → schema EXISTS, but no REST endpoints
//   - wishlist                     → no schema yet; we use customer_preferences
//                                    with preference_key = 'wishlist:<sku>'
//
// All functions below fail soft — they return empty data instead of throwing
// when the backend endpoints aren't mounted yet. The UI surfaces an
// info banner explaining the backend ask.

import { api } from "../api";
import { errMsg } from "../api";
import type { CustomerPreference, CustomerMilestone } from "@typedefs/crm";

// ── Preferences ──
export async function listPreferences(
  contactId: string,
): Promise<CustomerPreference[]> {
  try {
    const { data } = await api.get<
      { data: CustomerPreference[] } | CustomerPreference[]
    >(`/crm/contacts/${contactId}/preferences`);
    return Array.isArray(data) ? data : data.data;
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404)
      return [];
    throw e;
  }
}
export async function upsertPreference(
  contactId: string,
  payload: { preference_key: string; preference_value: string; notes?: string },
): Promise<CustomerPreference> {
  const { data } = await api.put<CustomerPreference>(
    `/crm/contacts/${contactId}/preferences`,
    payload,
  );
  return data;
}
export async function deletePreference(
  contactId: string,
  preference_key: string,
): Promise<void> {
  await api.delete(`/crm/contacts/${contactId}/preferences/${preference_key}`);
}

// ── Milestones ──
export async function listMilestones(
  contactId: string,
): Promise<CustomerMilestone[]> {
  try {
    const { data } = await api.get<
      { data: CustomerMilestone[] } | CustomerMilestone[]
    >(`/crm/contacts/${contactId}/milestones`);
    return Array.isArray(data) ? data : data.data;
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404)
      return [];
    throw e;
  }
}
export async function addMilestone(
  contactId: string,
  payload: { milestone_type: string; milestone_date: string; notes?: string },
): Promise<CustomerMilestone> {
  const { data } = await api.post<CustomerMilestone>(
    `/crm/contacts/${contactId}/milestones`,
    payload,
  );
  return data;
}
export async function deleteMilestone(milestoneId: string): Promise<void> {
  await api.delete(`/crm/milestones/${milestoneId}`);
}

// ── Wishlist (workaround using customer_preferences) ──
// Each wishlist item is stored as a row in customer_preferences with
// preference_key = `wishlist:<sku>` and preference_value = SKU.
// Notes column carries the product name + notes.
export interface WishlistItem {
  preference_key: string; // 'wishlist:<sku>'
  sku: string; // extracted from key
  product_name: string; // stored in notes (first line)
  added_note?: string; // remaining lines
  created_at: string;
}

export function parseWishlistFromPreferences(
  prefs: CustomerPreference[],
): WishlistItem[] {
  return prefs
    .filter((p) => p.preference_key.startsWith("wishlist:"))
    .map((p) => {
      const [firstLine, ...rest] = (p.notes || "").split("\n");
      return {
        preference_key: p.preference_key,
        sku: p.preference_key.slice("wishlist:".length),
        product_name: firstLine || p.preference_value,
        added_note: rest.join("\n") || undefined,
        created_at: p.created_at,
      };
    });
}

/** Returns true if the backend appears to expose the concierge endpoints. */
export async function pingConciergeBackend(): Promise<boolean> {
  try {
    await api.head(
      "/crm/contacts/00000000-0000-0000-0000-000000000000/preferences",
    );
    return true;
  } catch (e) {
    const status = (e as { response?: { status?: number } }).response?.status;
    // 404 = endpoint exists but contact not found (good); 405 = endpoint exists, HEAD not allowed
    return status === 404 || status === 405;
  }
}

export { errMsg };
