/**
 * SocialComponents.tsx
 * Exports: PostStatusBadge, ChannelChip, ChannelSelector,
 *          MetricsPanel, PostCommentsPanel
 */
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  BarChart2,
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  Eye,
} from "lucide-react";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import { getMetrics, getComments } from "@services/social";
import {
  CHANNEL_META,
  POST_STATUS_META,
  ALL_CHANNELS,
} from "@lib/constants/socialConstants";
import { fmtDate } from "@lib/format";
import { cn } from "@lib/cn";
import type { PostStatus, SocialChannel, PostMetric } from "@typedefs/social";

// ── PostStatusBadge ───────────────────────────────────────────────────────────

export function PostStatusBadge({
  status,
  size = "sm",
}: {
  status: PostStatus;
  size?: "xs" | "sm";
}) {
  const meta = POST_STATUS_META[status];
  return (
    <Badge tone={meta.tone} size={size} dot={meta.dot}>
      {meta.label}
    </Badge>
  );
}

// ── ChannelChip ───────────────────────────────────────────────────────────────

export function ChannelChip({
  channel,
  size = "sm",
}: {
  channel: SocialChannel;
  size?: "xs" | "sm";
}) {
  const meta = CHANNEL_META[channel];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold",
        size === "xs"
          ? "px-1.5 py-0.5 text-[0.55rem]"
          : "px-2 py-0.5 text-[0.65rem]",
      )}
      style={{
        color: meta.color,
        borderColor: `${meta.color}40`,
        backgroundColor: meta.bg,
      }}
    >
      {meta.icon} {meta.label}
    </span>
  );
}

// ── ChannelSelector ───────────────────────────────────────────────────────────

export function ChannelSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: SocialChannel[];
  onChange: (channels: SocialChannel[]) => void;
  disabled?: boolean;
}) {
  function toggle(ch: SocialChannel) {
    if (disabled) return;
    const next = value.includes(ch)
      ? value.filter((c) => c !== ch)
      : [...value, ch];
    onChange(next);
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[0.7rem] font-medium uppercase tracking-widest text-brand-smoke">
        Publish To *
      </p>
      <div className="flex flex-wrap gap-2">
        {ALL_CHANNELS.map((ch) => {
          const meta = CHANNEL_META[ch];
          const selected = value.includes(ch);
          return (
            <button
              key={ch}
              type="button"
              onClick={() => toggle(ch)}
              disabled={disabled}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                selected
                  ? "border-2"
                  : "border border-white/10 text-brand-smoke hover:border-white/25",
                disabled && "opacity-50 cursor-not-allowed",
              )}
              style={
                selected
                  ? {
                      borderColor: meta.color,
                      backgroundColor: meta.bg,
                      color: meta.color,
                    }
                  : {}
              }
            >
              <span className="text-base">{meta.icon}</span>
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── MetricsPanel ──────────────────────────────────────────────────────────────

export function MetricsPanel({ postId }: { postId: string }) {
  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ["post-metrics", postId],
    queryFn: () => getMetrics(postId),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!metrics.length) {
    return (
      <div className="rounded-xl border border-white/5 py-8 text-center">
        <BarChart2 className="mx-auto h-8 w-8 text-brand-smoke/30 mb-2" />
        <p className="text-xs text-brand-smoke">
          Analytics will appear after publishing
        </p>
      </div>
    );
  }

  // Get latest snapshot per channel
  const latestByChannel = ALL_CHANNELS.reduce(
    (acc, ch) => {
      const rows = metrics.filter((m) => m.channel === ch);
      if (rows.length) acc[ch] = rows[0];
      return acc;
    },
    {} as Record<string, PostMetric>,
  );

  return (
    <div className="space-y-3">
      {Object.entries(latestByChannel).map(([channel, m]) => {
        const meta = CHANNEL_META[channel as SocialChannel];
        return (
          <div
            key={channel}
            className="rounded-xl border border-white/5 bg-brand-charcoal p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{meta.icon}</span>
              <p className="text-xs font-semibold text-brand-cream">
                {meta.label}
              </p>
              <span className="ml-auto text-[10px] text-brand-smoke/50">
                Updated {fmtDate(m.fetched_at)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Heart, label: "Likes", value: m.likes },
                { icon: MessageCircle, label: "Comments", value: m.comments },
                { icon: Share2, label: "Shares", value: m.shares },
                { icon: Bookmark, label: "Saves", value: m.saves },
                { icon: Eye, label: "Reach", value: m.reach },
                { icon: BarChart2, label: "Impressions", value: m.impressions },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-xs font-semibold tabular-nums text-brand-cream">
                    {(value || 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-brand-smoke">{label}</p>
                </div>
              ))}
            </div>
            {m.extras?.views && (
              <p className="text-xs text-brand-smoke">
                {m.extras.views.toLocaleString()} video views
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── PostCommentsPanel ─────────────────────────────────────────────────────────

export function PostCommentsPanel({ postId }: { postId: string }) {
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["post-comments", postId],
    queryFn: () => getComments(postId),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!comments.length) {
    return (
      <div className="py-8 text-center">
        <MessageCircle className="mx-auto h-8 w-8 text-brand-smoke/30 mb-2" />
        <p className="text-xs text-brand-smoke">No comments yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-brand-smoke/50 mb-3">
        To reply, click the external link to open the post in the native app.
      </p>
      {comments.map((c) => {
        const meta = CHANNEL_META[c.channel];
        return (
          <div
            key={c.id}
            className="flex items-start gap-3 rounded-xl border border-white/5 bg-brand-charcoal px-3 py-2.5"
          >
            <span className="text-sm shrink-0 mt-0.5">{meta.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-brand-cream">{c.author}</p>
              <p className="text-xs text-brand-smoke mt-0.5 line-clamp-2">
                {c.text}
              </p>
              <p className="text-[10px] text-brand-smoke/50 mt-1">
                {fmtDate(c.created_at)}
              </p>
            </div>
            <a
              href={c.native_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-smoke hover:text-brand-accent transition-colors shrink-0"
              title="Reply in native app"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        );
      })}
    </div>
  );
}
