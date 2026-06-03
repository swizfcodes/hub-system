import { useQuery } from "@tanstack/react-query";
import { listStaff } from "@services/contacts/staff";
import type { StaffProfile } from "@typedefs/staff";

/**
 * Resolve the staff_profile linked to a given contact_id by searching
 * the staff list. The backend doesn't expose a "by contact_id" lookup,
 * but the directory list joins contacts, so we can find the row.
 *
 * Trade-off: lists 200 at a time. For ≤200 staff this is fine; if the
 * org grows beyond that we'll need a backend endpoint
 * `GET /staff?contact_id=…`.
 */
export function useStaffByContact(contactId: string | undefined): {
  staff: StaffProfile | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ["staff", "all-200"],
    queryFn: () => listStaff({ limit: 200 }),
  });
  const staff = contactId
    ? ((data?.data ?? []).find((s) => s.contact_id === contactId) ?? null)
    : null;
  return { staff, isLoading };
}
