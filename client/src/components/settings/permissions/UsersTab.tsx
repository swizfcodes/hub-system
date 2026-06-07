import { EmptyState } from "@components/ui/EmptyState";
import { Users } from "lucide-react";

/**
 * Users tab — assigns roles per business to staff and manages
 * permitted_businesses / default_business. This component is wired to
 * the permissions service endpoints, but it needs a `/staff` or
 * `/users` listing endpoint to populate the user picker on the left
 * rail. That endpoint isn't part of the Settings backend you shared
 * (it lives in `shared/staff/staff.routes.js`), so we stub the empty
 * state here until that module's frontend is built.
 *
 * Once you wire `services/staff.ts → listStaff()`, swap out the
 * EmptyState below for a user picker rail + the access editor that
 * calls:
 *   setPermittedBusinesses(userId, [...])
 *   setDefaultBusiness(userId, key)
 *   setRoleAtBusiness(userId, business, { role_id, expires_at? })
 *   removeRoleAtBusiness(userId, business)
 */
export function UsersTab() {
  return (
    <EmptyState
      icon={<Users className="w-7 h-7" />}
      title="User access editor"
      description="This panel will list staff and let you set their permitted businesses, default business, and role at each business. Wiring depends on the staff/users listing endpoint (Module: Staff & HR). Permissions endpoints are already wired in services/settings/permissions.ts and ready to call from here."
    />
  );
}
