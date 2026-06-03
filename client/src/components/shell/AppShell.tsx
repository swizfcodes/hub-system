import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { Sidebar } from "./Sidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { AppMenuFab } from "./AppMenuFab";
import { BusinessSwitchManager } from "./BusinessSwitchManager";
import { CrmQuickActionsFab } from "@components/crm/fab/CrmQuickActionsFab";
import { useUiStore } from "@stores/useUiStore";
import { useAuthStore } from "@stores/useAuthStore";
import { useIsDesktop } from "@hooks/useMediaQuery";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { cn } from "@lib/cn";

export function AppShell() {
  const { sidebarCollapsed } = useUiStore();
  const isDesktop = useIsDesktop();
  const { user, isHydrated, hydrate } = useAuthStore((s) => ({
    user: s.user,
    isHydrated: s.isHydrated,
    hydrate: s.hydrate,
  }));

  const { pathname } = useLocation();
  // Only show the global CRM FAB on the pipeline/list view.
  // Deal detail (/crm/:id) renders its own LogActivityFab — showing both causes duplicate buttons.
  const onCrm = pathname === "/crm";

  // Re-hydrate user from localStorage on first mount.
  // IMPORTANT: we must wait for hydration to complete before deciding
  // to redirect — otherwise every page refresh sends the user to /login
  // because the store initialises with user=null before localStorage is read.
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  useActiveBusiness();

  // Still loading from localStorage — show a blank screen, not a redirect.
  if (!isHydrated) {
    return <div className="min-h-screen bg-orika-black" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-orika-black text-orika-cream bg-grid-noise">
      <Sidebar />
      <div
        className={cn(
          "transition-all duration-300 min-h-screen flex flex-col",
          isDesktop ? (sidebarCollapsed ? "pl-[72px]" : "pl-[260px]") : "pl-0",
        )}
      >
        <main className="flex-1 pb-24 lg:pb-8">
          <Outlet />
        </main>
      </div>

      <MobileBottomNav />
      <AppMenuFab />
      {onCrm && <CrmQuickActionsFab />}

      {/* Guarded business-context switch: confirm → blurred 5s reload overlay */}
      <BusinessSwitchManager />

      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: "#1A1814",
            border: "1px solid #2A2520",
            color: "#F0EAE0",
          },
          className: "font-body",
        }}
      />
    </div>
  );
}
