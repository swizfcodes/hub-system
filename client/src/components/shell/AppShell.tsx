import { Outlet, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { Sidebar } from "./Sidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { AppMenuFab } from "./AppMenuFab";
import { BusinessSwitchManager } from "./BusinessSwitchManager";
import { CrmQuickActionsFab } from "@components/crm/fab/CrmQuickActionsFab";
import { PermissionGate } from "@components/shared/PermissionGate";
import { SessionExpiredOverlay } from "@components/shared/SessionExpiredOverlay";
import { FloatingLauncher } from "./FloatingLauncher";
import { ChatDock } from "@components/messaging/ChatDock";
import { ChatNotificationManager } from "@components/notifications/ChatNotificationManager";
import { useUiStore } from "@stores/useUiStore";
import { useAuthStore } from "@stores/useAuthStore";
import { useIsDesktop } from "@hooks/useMediaQuery";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { useSessionWatch } from "@hooks/useSessionWatch";
import { connectSocket, disconnectSocket } from "@lib/socket";
import { cn } from "@lib/cn";

export function AppShell() {
  const { sidebarCollapsed } = useUiStore();
  const isDesktop = useIsDesktop();
  const { user, isHydrated, hydrate, refreshFromServer } = useAuthStore((s) => ({
    user: s.user,
    isHydrated: s.isHydrated,
    hydrate: s.hydrate,
    refreshFromServer: s.refreshFromServer,
  }));

  // Proactively detect an expired session (e.g. after the laptop slept past the
  // token's 24h life) so we can show a friendly "logged out" screen with a
  // login link instead of a dead/dark page that only a refresh recovers.
  const sessionExpired = useSessionWatch();

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

  // Once a cached user is in place, pull the canonical name/avatar from the
  // server so the sidebar and greeting reflect the DB rather than a stale
  // login snapshot.
  useEffect(() => {
    if (isHydrated && user) refreshFromServer();
  }, [isHydrated, user?.user_id, refreshFromServer]); // eslint-disable-line react-hooks/exhaustive-deps
  useActiveBusiness();

  // Real-time socket — connect once the user is known, drop on sign-out.
  useEffect(() => {
    if (!user) return;
    connectSocket();
    return () => disconnectSocket();
  }, [user?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Global guard: scrolling the mouse wheel over a focused number input
  // silently increments/decrements its value. Blur the input on wheel so
  // the page scrolls but the figure never changes on its own.
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      const el = e.target as HTMLElement | null;
      if (
        el instanceof HTMLInputElement &&
        el.type === "number" &&
        el === document.activeElement
      ) {
        el.blur();
      }
    }
    document.addEventListener("wheel", onWheel, { passive: true });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  // Still loading from localStorage — show a blank screen, not a redirect.
  if (!isHydrated) {
    return <div className="min-h-screen bg-brand-black" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-brand-black text-brand-cream bg-grid-noise">
      <Sidebar />
      <div
        className={cn(
          "transition-all duration-300 min-h-screen flex flex-col",
          isDesktop ? (sidebarCollapsed ? "pl-[72px]" : "pl-[260px]") : "pl-0",
        )}
      >
        <main className="flex-1 pb-24 lg:pb-8">
          <PermissionGate>
            <Outlet />
          </PermissionGate>
        </main>
      </div>

      <MobileBottomNav />
      <AppMenuFab />
      {onCrm && <CrmQuickActionsFab />}
      <FloatingLauncher />
      <ChatDock />
      <ChatNotificationManager />

      {/* Guarded business-context switch: confirm → blurred 5s reload overlay */}
      <BusinessSwitchManager />

      {/* Session timed out (idle / woke from sleep past token life) → friendly
          "log in again" screen instead of a dead, dark page. */}
      {sessionExpired && <SessionExpiredOverlay />}

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
