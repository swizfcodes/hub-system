/**
 * usePermissions — fetches the current user's module permissions and exposes
 * a `hasPermission(module, action)` helper.
 *
 * Permissions are keyed by role, not by user, so they change only when the
 * role changes. We use a 10-minute stale time to avoid hammering the server
 * while still picking up permission changes after a role update.
 *
 * Usage:
 *   const { hasPermission } = usePermissions();
 *   if (hasPermission("accounting", "view")) { ... }
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@services/api";
import { useAuthStore } from "@stores/useAuthStore";

export interface UserPermission {
  module: string;
  action: string;
  record_scope: string;
}

async function fetchMyPermissions(): Promise<UserPermission[]> {
  const { data } = await api.get<{ permissions: UserPermission[] }>(
    "/auth/me/permissions",
  );
  return data.permissions ?? [];
}

export function usePermissions() {
  const { user } = useAuthStore();

  const { data: permissions = [], isLoading } = useQuery({
    queryKey: ["my-permissions", user?.role_id],
    queryFn: fetchMyPermissions,
    staleTime: 10 * 60_000, // 10 min — permissions are role-level, rarely change mid-session
    enabled: !!user?.role_id,
  });

  /**
   * Returns true if the user has the given module + action combination.
   * Pass `action = undefined` to check if the user has *any* action on a module.
   */
  function hasPermission(module: string, action?: string): boolean {
    if (!permissions.length) return false;
    return permissions.some(
      (p) =>
        p.module === module && (action === undefined || p.action === action),
    );
  }

  /**
   * Returns true if the user has *any* of the listed module+action combos.
   * Useful for sections that are unlocked by multiple modules.
   */
  function hasAnyPermission(
    checks: Array<{ module: string; action?: string }>,
  ): boolean {
    return checks.some(({ module, action }) => hasPermission(module, action));
  }

  return { permissions, isLoading, hasPermission, hasAnyPermission };
}
