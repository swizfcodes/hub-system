/**
 * useVisibleModules — the single source of truth for which navigation
 * tiles a user can see. Driven by the user's live permission list
 * (role → module → view), NOT by hard-coded role names, so custom
 * roles created in Security → Roles work automatically and edits in
 * the Role Editor take effect without a frontend redeploy.
 *
 * Rules, in order:
 *   1. `alwaysVisible` modules (personal workspace, …) always show.
 *   2. `businesses` restriction must include the active business.
 *   3. The user needs `view` on the module's permissionModule —
 *      string or array (any match unlocks, mirroring canAny()).
 *   4. Modules with NO permissionModule and no alwaysVisible flag are
 *      hidden for everyone except roles holding settings.view —
 *      a conservative default for unmapped future tiles.
 *
 * Shared by HubHome (app grid), Sidebar, MobileBottomNav, and the
 * PermissionGate route guard so all four can never disagree.
 */
import { useMemo } from "react";
import { usePermissions } from "@hooks/usePermissions";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import {
  HUB_MODULES,
  SETTINGS_SUBMODULES,
  type AppModule,
} from "@lib/constants/modules";

export function useVisibleModules() {
  const { permissions, hasPermission, isLoading } = usePermissions();
  const { active: activeBusiness } = useActiveBusiness();

  const canSeeModule = useMemo(() => {
    return (m: AppModule): boolean => {
      if (m.alwaysVisible) return true;
      if (
        m.businesses &&
        (!activeBusiness || !m.businesses.includes(activeBusiness))
      )
        return false;
      if (!m.permissionModule) return hasPermission("settings", "view");
      const required = Array.isArray(m.permissionModule)
        ? m.permissionModule
        : [m.permissionModule];
      return required.some((mod) => hasPermission(mod, "view"));
    };
    // hasPermission is stable per permissions array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissions, activeBusiness]);

  const visibleModules = useMemo(
    () => HUB_MODULES.filter(canSeeModule),
    [canSeeModule],
  );

  const visibleSettingsSubmodules = useMemo(
    () => SETTINGS_SUBMODULES.filter(canSeeModule),
    [canSeeModule],
  );

  const visibleKeys = useMemo(
    () => new Set(visibleModules.map((m) => m.key)),
    [visibleModules],
  );

  return {
    /** HUB_MODULES the current user may see (order preserved) */
    visibleModules,
    /** Settings sub-tiles the current user may see */
    visibleSettingsSubmodules,
    /** Quick lookup: visibleKeys.has("payroll") */
    visibleKeys,
    /** Predicate for arbitrary AppModule values */
    canSeeModule,
    /** True while the permission list is still loading */
    isLoading,
  };
}
