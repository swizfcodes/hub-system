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
    }),
    {
      name: "orika_ui",
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);
