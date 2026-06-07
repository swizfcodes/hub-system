import type { Platform } from "@typedefs/messaging";

// ── Platform meta ─────────────────────────────────────────────────────────────

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

export const INBOX_TABS = [
  { key: "all", label: "All", channelType: undefined, platform: undefined },
  {
    key: "whatsapp",
    label: "WhatsApp",
    channelType: "customer_thread",
    platform: "whatsapp_business_account",
  },
  {
    key: "instagram",
    label: "Instagram",
    channelType: "customer_thread",
    platform: "instagram",
  },
  {
    key: "messenger",
    label: "Messenger",
    channelType: "customer_thread",
    platform: "page",
  },
  {
    key: "email",
    label: "Email",
    channelType: "customer_thread",
    platform: "email",
  },
  {
    key: "internal",
    label: "Internal",
    channelType: "group",
    platform: "internal",
  },
] as const;

// ── Quick emoji reactions ─────────────────────────────────────────────────────

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "✅"];

// ── Channel name fallback ─────────────────────────────────────────────────────

export function getChannelDisplayName(channel: {
  name?: string | null;
  channel_type: string;
  members?: any[] | null;
}): string {
  if (channel.name) return channel.name;
  if (channel.channel_type === "direct" && channel.members?.length) {
    return (
      channel.members
        .map((m) => m.display_name)
        .filter(Boolean)
        .join(", ") || "Direct Message"
    );
  }
  return "Conversation";
}

// ── Platform from channel ─────────────────────────────────────────────────────

export function getChannelPlatform(channel: {
  channel_type: string;
  metadata?: any;
}): Platform | "internal" {
  if (channel.channel_type === "group" || channel.channel_type === "direct")
    return "internal";
  return (channel.metadata?.source as Platform) || "whatsapp_business_account";
}

// ── Relative timestamp ────────────────────────────────────────────────────────

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
