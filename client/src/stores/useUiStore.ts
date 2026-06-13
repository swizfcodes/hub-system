import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;

  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (v: boolean) => void;

  fabMenuOpen: boolean;
  setFabMenuOpen: (v: boolean) => void;

  // Pixel offset applied to the draggable "App Menu" button so users can
  // shift it out of the way (e.g. when Smart Comm covers the message input).
  appMenuFabOffset: { x: number; y: number };
  setAppMenuFabOffset: (offset: { x: number; y: number }) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

      mobileSidebarOpen: false,
      setMobileSidebarOpen: (v) => set({ mobileSidebarOpen: v }),

      fabMenuOpen: false,
      setFabMenuOpen: (v) => set({ fabMenuOpen: v }),

      appMenuFabOffset: { x: 0, y: 0 },
      setAppMenuFabOffset: (offset) => set({ appMenuFabOffset: offset }),
    }),
    {
      name: "orika_ui",
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        appMenuFabOffset: s.appMenuFabOffset,
      }),
    },
  ),
);
