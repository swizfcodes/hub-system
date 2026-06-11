import { useQuery } from "@tanstack/react-query";
import { listStaff } from "@services/contacts/staff";
import type { StaffProfile } from "@typedefs/staff";

/**
 * Resolve the staff_profile linked to a contact via the backend's
 * contact_id filter — one indexed lookup instead of the old
 * fetch-200-and-search-in-the-browser pattern.
 */
export function useStaffByContact(contactId: string | undefined): {
  staff: StaffProfile | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["staff", "by-contact", contactId],
    queryFn: () => listStaff({ contact_id: contactId, limit: 1 }),
    enabled: !!contactId,
  });
  return { staff: data?.data?.[0] ?? null, isLoading };
}
