import type { Platform } from "@typedefs/messaging";

// ── Platform meta ─────────────────────────────────────────────────────────────
// EXTERNAL-COMMS-DISABLED: the external platform entries stay so old
// customer threads (and the future re-enable) keep their styling.

export const PLATFORM_META: Record<
  Platform | "internal",
  {
    label: string;
    color: string;
    bg: string;
    icon: string;
  }
> = {
  whatsapp_business_account: {
    label: "WhatsApp",
    color: "#25D366",
    bg: "#25D36615",
    icon: "💬",
  },
  instagram: {
    label: "Instagram",
    color: "#E1306C",
    bg: "#E1306C15",
    icon: "📷",
  },
  page: { label: "Messenger", color: "#0084FF", bg: "#0084FF15", icon: "💙" },
  email: { label: "Email", color: "#4E9AF1", bg: "#4E9AF115", icon: "📧" },
  internal: {
    label: "Internal",
    color: "#C9A86C",
    bg: "#C9A86C15",
    icon: "🏢",
  },
};

// ── Inbox tab filters ─────────────────────────────────────────────────────────
// In-house communication: chats, groups, plus the outbound email audit log.
// EXTERNAL-COMMS-DISABLED: the WhatsApp / Instagram / Messenger customer-
// thread tabs are parked below until Meta API access returns.

export const INBOX_TABS = [
  { key: "all", label: "All", channelType: undefined },
  { key: "unread", label: "Unread", channelType: undefined },
  { key: "groups", label: "Groups", channelType: "group" },
  { key: "emails", label: "Emails", channelType: undefined },
] as const;

export type InboxTabKey = (typeof INBOX_TABS)[number]["key"];

// export const EXTERNAL_INBOX_TABS = [
//   { key: "whatsapp",  label: "WhatsApp",  channelType: "customer_thread", platform: "whatsapp_business_account" },
//   { key: "instagram", label: "Instagram", channelType: "customer_thread", platform: "instagram" },
//   { key: "messenger", label: "Messenger", channelType: "customer_thread", platform: "page" },
//   { key: "email",     label: "Email",     channelType: "customer_thread", platform: "email" },
// ] as const;

// ── Emoji ─────────────────────────────────────────────────────────────────────

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "✅"];

// A compact picker set for the composer — common WhatsApp-style emoji.
export const EMOJI_SET = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎",
  "🤔", "😅", "😢", "😭", "😡", "🥳", "🤝", "🙌",
  "👍", "👎", "👏", "🙏", "💪", "👀", "❤️", "🔥",
  "🎉", "✨", "✅", "❌", "⚠️", "💰", "📦", "🚚",
];

// ── Channel name fallback ─────────────────────────────────────────────────────

export function getChannelDisplayName(
  channel: {
    name?: string | null;
    channel_type: string;
    members?: { user_id?: string | null; display_name?: string | null }[] | null;
  },
  selfUserId?: string,
): string {
  if (channel.name) return channel.name;
  if (channel.channel_type === "direct" && channel.members?.length) {
    // A direct chat is named after the OTHER person, like WhatsApp.
    const others = channel.members.filter(
      (m) => m.user_id && m.user_id !== selfUserId,
    );
    const named = (others.length ? others : channel.members)
      .map((m) => m.display_name)
      .filter(Boolean);
    return named.join(", ") || "Direct Message";
  }
  return "Conversation";
}

/** The other participant of a direct chat (for presence / last seen). */
export function getDirectPeer(
  channel: {
    channel_type: string;
    members?:
      | {
          user_id?: string | null;
          display_name?: string | null;
          last_seen_at?: string | null;
        }[]
      | null;
  },
  selfUserId?: string,
) {
  if (channel.channel_type !== "direct") return null;
  return (
    channel.members?.find((m) => m.user_id && m.user_id !== selfUserId) ?? null
  );
}

// ── Platform from channel ─────────────────────────────────────────────────────

export function getChannelPlatform(channel: {
  channel_type: string;
  metadata?: { source?: string | null } | null;
}): Platform | "internal" {
  if (channel.channel_type === "group" || channel.channel_type === "direct")
    return "internal";
  return (channel.metadata?.source as Platform) || "whatsapp_business_account";
}

// ── Avatar colour from a name (stable, WhatsApp-style) ────────────────────────

const AVATAR_COLOURS = [
  "#C9A86C",
  "#7FB069",
  "#5B9BD5",
  "#C0626E",
  "#9B7EDE",
  "#4DB6AC",
  "#E2934D",
  "#D46BA3",
];

export function getAvatarColour(name?: string | null): string {
  if (!name) return AVATAR_COLOURS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length];
}

export function getInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// ── Timestamps ────────────────────────────────────────────────────────────────

export function fmtRelativeTime(iso: string): string {
  const now = new Date();
  const date = new Date(iso);
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
}

/** WhatsApp-style clock time on each bubble — e.g. "14:32". */
export function fmtClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** WhatsApp-style day separator label — Today / Yesterday / 4 June 2026. */
export function fmtDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function isSameDay(isoA: string, isoB: string): boolean {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "last seen today at 14:32" / "last seen 4 Jun" — or null when unknown. */
export function fmtLastSeen(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return `last seen today at ${fmtClockTime(iso)}`;
  return `last seen ${date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
  })}`;
}
