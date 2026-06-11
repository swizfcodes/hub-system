/**
 * useDashboardPersona — derives WHICH dashboard layout a user should see
 * from their permission set, not their role name.
 *
 * Why permissions, not role names?
 * Roles are user-editable (Settings → Security → Roles). If layouts were
 * keyed on names ("cashier", "manager"), any newly created role — "Senior
 * Cashier", "Weekend Sales" — would silently fall through to the wrong
 * layout. By deriving the persona from what the role can actually DO,
 * every role (current or future) automatically gets a fitting layout the
 * moment its permissions are saved. No code changes needed per role.
 *
 * The ladder (first match wins), validated against the seeded system roles:
 *  1. OWNER   — can edit system settings (`settings:edit`). Only the owner
 *               role has the settings module (manager is seeded with
 *               everything EXCEPT settings — see migration 000067), so
 *               this is the cleanest "runs the business" signal.
 *               Full dashboard, all controls, section picker.
 *  2. MANAGER — supervisory power: can `approve` anything (expenses,
 *               discounts, accounting, …) or can view accounting.
 *               Matches seeded manager, accountant, stock_manager,
 *               logistics. Curated layout: today hero, quick actions,
 *               alerts, all permitted sections, period selector — but no
 *               section-picker configuration.
 *  3. CASHIER — sales-floor role: pos/sales view without any approve
 *               power. Matches the seeded "sales" role. Today-focused
 *               layout: hero number, quick actions, own recent sales.
 *  4. GENERIC — anything else (e.g. staff). Falls back to the
 *               permission-filtered section dashboard.
 */
import { usePermissions } from "@hooks/usePermissions";
import { useAuthStore } from "@stores/useAuthStore";

export type DashboardPersona = "owner" | "manager" | "cashier" | "generic";

export function useDashboardPersona(): {
  persona: DashboardPersona;
  isLoading: boolean;
} {
  const { permissions, hasPermission, isLoading } = usePermissions();
  const user = useAuthStore((s) => s.user);

  if (isLoading || !permissions.length) {
    return { persona: "generic", isLoading };
  }

  const canApproveAnything = permissions.some((p) => p.action === "approve");
  const canChangeSystemConfig = hasPermission("settings", "edit");
  const isOwnerRole = (user?.role_name ?? user?.role) === "owner";
  const isSalesFloor =
    hasPermission("pos", "view") || hasPermission("sales", "view");

  let persona: DashboardPersona;
  if (canChangeSystemConfig || isOwnerRole) {
    persona = "owner";
  } else if (canApproveAnything || hasPermission("accounting", "view")) {
    persona = "manager";
  } else if (isSalesFloor) {
    persona = "cashier";
  } else {
    persona = "generic";
  }

  return { persona, isLoading };
}
