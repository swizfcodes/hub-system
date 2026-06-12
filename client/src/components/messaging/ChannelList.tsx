/**
 * ChannelList — WhatsApp-style conversation list:
 *   tabs (All / Unread / Groups / Emails), search, pinned-first rows
 *   with avatar, online dot, last-message preview, time, unread badge,
 *   pin & mute indicators.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Check,
  CheckCheck,
  Pin,
  Bell,
  BellRing,
  BellOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Skeleton } from "@components/ui/Skeleton";
import { listChannels } from "@services/messaging";
import {
  chatNotifPermission,
  requestChatNotifPermission,
  isChatSoundEnabled,
  setChatSoundEnabled,
} from "@lib/notifications/chatAlerts";
import { ensurePushSubscription } from "@lib/notifications/push";
import { showToast } from "@hooks/useToast";
import { useChannelListUpdates, usePresence } from "@hooks/useMessaging";
import { isUserOnline } from "@lib/socket";
import {
  INBOX_TABS,
  type InboxTabKey,
  getChannelDisplayName,
  getDirectPeer,
  getAvatarColour,
  getInitials,
  fmtRelativeTime,
} from "@lib/constants/messagingConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { cn } from "@lib/cn";
import type { Channel } from "@typedefs/messaging";

interface ChannelListProps {
  activeChannelId: string | null;
  activeTab: InboxTabKey;
  onTabChange: (tab: InboxTabKey) => void;
  onSelect: (channel: Channel) => void;
  onNewChannel: () => void;
  userId?: string;
}

export function ChannelList({
  activeChannelId,
  activeTab,
  onTabChange,
  onSelect,
  onNewChannel,
  userId,
}: ChannelListProps) {
  const { active: business } = useActiveBusiness();
  const [search, setSearch] = useState("");
  const [notifPerm, setNotifPerm] = useState(chatNotifPermission());
  const [soundOn, setSoundOn] = useState(isChatSoundEnabled());

  useChannelListUpdates(business);
  usePresence();

  async function handleNotifToggle() {
    if (notifPerm === "denied") {
      showToast.info(
        "Notifications are blocked — allow them for this site in your browser settings",
      );
      return;
    }
    const perm = await requestChatNotifPermission();
    setNotifPerm(perm);
    if (perm === "granted") {
      showToast.success("Browser notifications are on");
      // Upgrade to true push (works with the app closed) where supported.
      void ensurePushSubscription();
    }
  }

  function handleSoundToggle() {
    const next = !soundOn;
    setChatSoundEnabled(next);
    setSoundOn(next);
  }

  const tab = INBOX_TABS.find((t) => t.key === activeTab) ?? INBOX_TABS[0];

  const { data, isLoading } = useQuery({
    queryKey: ["channels", business, tab.channelType ?? "all", search],
    queryFn: () =>
      listChannels({
        business: business ?? undefined,
        channel_type: tab.channelType,
        search: search || undefined,
        limit: 50,
      }),
    refetchInterval: 30_000,
  });

  const channels = (data?.data ?? []).filter((ch) =>
    activeTab === "unread" ? (ch.unread_count ?? 0) > 0 : true,
  );

  const totalUnread = (data?.data ?? []).reduce(
    (s, c) => s + (c.unread_count ?? 0),
    0,
  );

  return (
    <div className="flex h-full flex-col border-r border-white/5 bg-brand-black">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-brand-cream">Messages</h2>
          {totalUnread > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1 text-[10px] font-bold text-brand-black">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleNotifToggle}
            className={cn(
              "transition-colors",
              notifPerm === "granted"
                ? "text-brand-accent"
                : "text-brand-smoke hover:text-brand-accent",
            )}
            title={
              notifPerm === "granted"
                ? "Browser notifications are on"
                : notifPerm === "denied"
                  ? "Notifications blocked in browser settings"
                  : "Enable browser notifications"
            }
          >
            {notifPerm === "granted" ? (
              <BellRing className="h-4 w-4" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={handleSoundToggle}
            className={cn(
              "transition-colors",
              soundOn
                ? "text-brand-accent"
                : "text-brand-smoke hover:text-brand-accent",
            )}
            title={soundOn ? "Message sound on" : "Message sound off"}
          >
            {soundOn ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onNewChannel}
            className="text-brand-smoke transition-colors hover:text-brand-accent"
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-smoke/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-xl border border-white/5 bg-brand-charcoal py-2 pl-8 pr-3 text-xs text-brand-cream placeholder-brand-smoke/40 focus:border-brand-accent/30 focus:outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-none">
        {INBOX_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[0.65rem] font-medium transition-all",
              activeTab === t.key
                ? "bg-brand-accent text-brand-black"
                : "text-brand-smoke hover:bg-brand-charcoal hover:text-brand-cream",
            )}
          >
            {t.label}
            {t.key === "unread" && totalUnread > 0 && (
              <span
                className={cn(
                  "rounded-full px-1 text-[9px] font-bold",
                  activeTab === t.key
                    ? "bg-brand-black/20 text-brand-black"
                    : "bg-brand-accent/20 text-brand-accent",
                )}
              >
                {totalUnread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Channel list (the Emails tab renders in the main panel) */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "emails" ? (
          <div className="py-12 px-4 text-center">
            <p className="text-xs text-brand-smoke">
              Outbound emails are shown in the panel →
            </p>
          </div>
        ) : isLoading ? (
          <div className="space-y-px p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs text-brand-smoke">
              {activeTab === "unread"
                ? "You're all caught up 🎉"
                : "No conversations yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-px p-2">
            {channels.map((channel) => (
              <ChannelRow
                key={channel.channel_id}
                channel={channel}
                isActive={channel.channel_id === activeChannelId}
                onClick={() => onSelect(channel)}
                userId={userId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ChannelRow ────────────────────────────────────────────────────────────────

function ChannelRow({
  channel,
  isActive,
  onClick,
  userId,
}: {
  channel: Channel;
  isActive: boolean;
  onClick: () => void;
  userId?: string;
}) {
  const name = getChannelDisplayName(channel, userId);
  const peer = getDirectPeer(channel, userId);
  const online = isUserOnline(peer?.user_id);
  const hasUnread = (channel.unread_count ?? 0) > 0;
  const last = channel.last_message;
  const lastIsOwn = last?.sender_user_id === userId;

  const preview = !last
    ? "No messages yet"
    : last.is_deleted
      ? "This message was deleted"
      : last.message_type === "image"
        ? "📷 Photo"
        : last.message_type === "voice_note"
          ? "🎤 Voice note"
          : last.message_type === "document"
            ? "📄 Document"
            : (last.content ?? "");

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
        isActive
          ? "border border-white/10 bg-brand-charcoal"
          : "hover:bg-brand-charcoal/50",
      )}
    >
      {/* Avatar + online dot */}
      <div className="relative shrink-0">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: getAvatarColour(name) }}
        >
          {getInitials(name)}
        </div>
        {online && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-brand-black bg-green-400" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1">
          <p
            className={cn(
              "flex items-center gap-1 truncate text-xs font-medium",
              hasUnread ? "text-brand-cream" : "text-brand-cloud",
            )}
          >
            <span className="truncate">{name}</span>
            {channel.is_pinned && (
              <Pin className="h-2.5 w-2.5 shrink-0 text-brand-accent/70" />
            )}
            {channel.is_muted && (
              <BellOff className="h-2.5 w-2.5 shrink-0 text-brand-smoke/50" />
            )}
          </p>
          {last?.created_at && (
            <span
              className={cn(
                "shrink-0 text-[10px]",
                hasUnread ? "font-semibold text-brand-accent" : "text-brand-smoke/60",
              )}
            >
              {fmtRelativeTime(last.created_at)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <p
            className={cn(
              "flex min-w-0 items-center gap-1 truncate text-[11px]",
              hasUnread ? "text-brand-cloud" : "text-brand-smoke/70",
            )}
          >
            {lastIsOwn && !last?.is_deleted && (
              <CheckCheck className="h-3 w-3 shrink-0 text-brand-smoke/40" />
            )}
            {channel.channel_type === "group" &&
              last &&
              !lastIsOwn &&
              last.sender_name !== "System" && (
                <span className="shrink-0">
                  {last.sender_name.split(" ")[0]}:
                </span>
              )}
            <span className="truncate">{preview}</span>
          </p>
          {hasUnread ? (
            <span
              className={cn(
                "flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-bold",
                channel.is_muted
                  ? "bg-brand-smoke/30 text-brand-black"
                  : "bg-brand-accent text-brand-black",
              )}
            >
              {channel.unread_count}
            </span>
          ) : last && lastIsOwn ? (
            <Check className="h-3 w-3 shrink-0 text-brand-smoke/30" />
          ) : null}
        </div>
      </div>
    </button>
  );
}
