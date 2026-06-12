// ── stores/useChatDockStore.ts ────────────────────────────────────────────
// Desktop mini chat dock state — opened from the floating launcher, so a
// reply never costs the page you're on. Not persisted: the dock is an
// in-session affordance.

import { create } from "zustand";
import type { Channel } from "@typedefs/messaging";

interface ChatDockState {
  open: boolean;
  /** Conversation shown in the dock; null = conversation list. */
  channel: Channel | null;
  openDock: () => void;
  closeDock: () => void;
  toggleDock: () => void;
  setChannel: (channel: Channel | null) => void;
}

export const useChatDockStore = create<ChatDockState>()((set) => ({
  open: false,
  channel: null,
  openDock: () => set({ open: true }),
  closeDock: () => set({ open: false }),
  toggleDock: () => set((s) => ({ open: !s.open })),
  setChannel: (channel) => set({ channel }),
}));
