// ── lib/constants/unread.ts ───────────────────────────────────────────────
// One shared urgency scale for unread chat messages, used everywhere a
// count is shown (app-grid tile, floating launcher, favicon, tab title):
//   1–10  green  — fresh, you're on top of it
//   11–30 amber  — backlog building
//   31+   red    — people are waiting on you
// The number itself is always shown too, so colour is never the only cue.

export type UnreadTone = "green" | "amber" | "red";

export function unreadTone(count: number): UnreadTone | null {
  if (count <= 0) return null;
  if (count <= 10) return "green";
  if (count <= 30) return "amber";
  return "red";
}

export const UNREAD_TONE_HEX: Record<UnreadTone, string> = {
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
};

/** Solid badge pill classes per tone (border matches dark surfaces). */
export const UNREAD_TONE_CLASS: Record<UnreadTone, string> = {
  green: "bg-green-500 text-white",
  amber: "bg-amber-500 text-brand-black",
  red: "bg-red-500 text-white",
};

export function formatUnread(count: number): string {
  return count > 99 ? "99+" : String(count);
}
