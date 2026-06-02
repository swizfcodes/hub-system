import { create } from "zustand";

/**
 * Drives the guarded business-context switch:
 *   idle → confirm ("are you sure?") → switching (blur + 5s load) → idle
 *
 * The BusinessSwitcher only *requests* a switch; BusinessSwitchManager
 * (mounted once in AppShell) owns the confirm dialog, the loading overlay,
 * flipping the active business and clearing the data cache. Keeping this in a
 * store means both switcher instances (sidebar + mobile topbar) share one flow.
 */
export type SwitchPhase = "idle" | "confirm" | "switching";

export interface SwitchTarget {
  fromKey: string;
  toKey: string;
  fromName: string;
  toName: string;
  accent: string;
}

interface BusinessSwitchState {
  phase: SwitchPhase;
  fromKey: string | null;
  toKey: string | null;
  fromName: string;
  toName: string;
  accent: string;
  /** Ask to switch — opens the confirmation dialog. */
  request: (t: SwitchTarget) => void;
  /** User declined — back to idle. */
  cancel: () => void;
  /** User confirmed — enter the loading phase. */
  begin: () => void;
  /** Load complete — tear down the overlay. */
  finish: () => void;
}

export const useBusinessSwitchStore = create<BusinessSwitchState>((set) => ({
  phase: "idle",
  fromKey: null,
  toKey: null,
  fromName: "",
  toName: "",
  accent: "#C9A86C",
  request: (t) =>
    set({
      phase: "confirm",
      fromKey: t.fromKey,
      toKey: t.toKey,
      fromName: t.fromName,
      toName: t.toName,
      accent: t.accent,
    }),
  cancel: () => set({ phase: "idle" }),
  begin: () => set({ phase: "switching" }),
  finish: () => set({ phase: "idle" }),
}));
