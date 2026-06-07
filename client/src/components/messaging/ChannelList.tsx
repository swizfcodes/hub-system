import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, CheckCheck } from "lucide-react";
import { Skeleton } from "@components/ui/Skeleton";
import { listChannels } from "@services/messaging";
import { useChannelListUpdates } from "@hooks/useMessaging";
import {
  INBOX_TABS,
  PLATFORM_META,
  getChannelDisplayName,
  getChannelPlatform,
  fmtRelativeTime,
} from "@lib/constants/messagingConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { cn } from "@lib/cn";
import type { Channel } from "@typedefs/messaging";

interface ChannelListProps {
  activeChannelId: string | null;
  onSelect: (channel: Channel) => void;
  onNewChannel: () => void;
}

export function ChannelList({
  activeChannelId,
  onSelect,
  onNewChannel,
}: ChannelListProps) {
  const { active: business } = useActiveBusiness();
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  useChannelListUpdates(business);

  const tab = INBOX_TABS.find((t) => t.key === activeTab) ?? INBOX_TABS[0];

  const { data, isLoading } = useQuery({
    queryKey: ["channels", business, activeTab, search],
    queryFn: () =>
      listChannels({
        business: business ?? undefined,
        channel_type: tab.channelType,
        search: search || undefined,
        limit: 50,
      }),
    refetchInterval: 30_000,
  });

  const channels = (data?.data ?? []).filter((ch) => {
    const key = tab.key as string;
    if (!tab.platform || key === "all" || key === "internal") return true;
    return getChannelPlatform(ch) === tab.platform;
  });

  const totalUnread = (data?.data ?? []).reduce(
    (s, c) => s + (c.unread_count ?? 0),
    0,
  );

  return (
    <div className="flex h-full flex-col border-r border-white/5 bg-orika-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-orika-cream">Messages</h2>
          {totalUnread > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orika-gold text-[10px] font-bold text-orika-black px-1">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </div>
        <button
          onClick={onNewChannel}
          className="text-orika-smoke hover:text-orika-gold transition-colors"
          title="New conversation"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-orika-smoke/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-xl border border-white/5 bg-orika-charcoal py-2 pl-8 pr-3 text-xs text-orika-cream placeholder-orika-smoke/40 focus:border-orika-gold/30 focus:outline-none"
          />
        </div>
      </div>

      {/* Platform tabs */}
      <div className="flex overflow-x-auto px-3 pb-2 gap-1 scrollbar-none">
        {INBOX_TABS.map((t) => {
          const tabUnread =
            t.key === "all"
              ? totalUnread
              : (data?.data ?? [])
                  .filter((ch) => {
                    if (t.key === "internal")
                      return ch.channel_type !== "customer_thread";
                    return getChannelPlatform(ch) === t.platform;
                  })
                  .reduce((s, c) => s + (c.unread_count ?? 0), 0);

          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[0.65rem] font-medium transition-all",
                activeTab === t.key
                  ? "bg-orika-gold text-orika-black"
                  : "text-orika-smoke hover:text-orika-cream hover:bg-orika-charcoal",
              )}
            >
              {t.label}
              {tabUnread > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1 text-[9px] font-bold",
                    activeTab === t.key
                      ? "bg-orika-black/20 text-orika-black"
                      : "bg-orika-gold/20 text-orika-gold",
                  )}
                >
                  {tabUnread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-px p-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs text-orika-smoke">No conversations yet</p>
          </div>
        ) : (
          <div className="space-y-px p-2">
            {channels.map((channel) => (
              <ChannelRow
                key={channel.channel_id}
                channel={channel}
                isActive={channel.channel_id === activeChannelId}
                onClick={() => onSelect(channel)}
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
}: {
  channel: Channel;
  isActive: boolean;
  onClick: () => void;
}) {
  const platform = getChannelPlatform(channel);
  const meta = PLATFORM_META[platform];
  const name = getChannelDisplayName(channel);
  const hasUnread = (channel.unread_count ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
        isActive
          ? "bg-orika-charcoal border border-white/10"
          : "hover:bg-orika-charcoal/50",
      )}
    >
      {/* Platform avatar */}
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm"
        style={{
          backgroundColor: meta.bg,
          border: `1.5px solid ${meta.color}40`,
        }}
      >
        <span>{meta.icon}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <p
            className={cn(
              "truncate text-xs font-medium",
              hasUnread ? "text-orika-cream" : "text-orika-cloud",
            )}
          >
            {name}
          </p>
          {channel.last_message?.created_at && (
            <span className="shrink-0 text-[10px] text-orika-smoke/60">
              {fmtRelativeTime(channel.last_message.created_at)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="truncate text-[11px] text-orika-smoke/70">
            {channel.last_message?.content ?? "No messages yet"}
          </p>
          {hasUnread ? (
            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-orika-gold text-[9px] font-bold text-orika-black px-1">
              {channel.unread_count}
            </span>
          ) : channel.last_message ? (
            <CheckCheck className="h-3 w-3 shrink-0 text-orika-smoke/30" />
          ) : null}
        </div>
      </div>
    </button>
  );
}
