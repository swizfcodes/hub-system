import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Calendar,
  List,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import {
  PostStatusBadge,
  ChannelChip,
} from "@components/social/SocialComponents";
import { PostComposer } from "@components/social/PostComposer";
import { listPosts } from "@services/social";
import {
  CHANNEL_META,
  POST_STATUS_META,
  ALL_CHANNELS,
  generateMonthGrid,
  isSameDay,
  isToday,
  DAY_NAMES,
  MONTH_NAMES,
} from "@lib/constants/socialConstants";
import { fmtDate } from "@lib/format";
import { cn } from "@lib/cn";
import type { SocialChannel } from "@typedefs/social";
import { Topbar } from "@/components/shell/Topbar";

type CalView = "calendar" | "list";

const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "failed", label: "Failed" },
];

export default function SocialHome() {
  const navigate = useNavigate();

  const [view, setView] = useState<CalView>("calendar");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState<SocialChannel | "all">(
    "all",
  );
  const [showComposer, setShowComposer] = useState(false);
  const [composerDate, setComposerDate] = useState<string | undefined>();
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["social-posts", statusFilter],
    queryFn: () =>
      listPosts({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 200,
      }),
    refetchInterval: 60_000,
  });

  const allPosts = data?.data ?? [];

  // Apply channel filter
  const posts = allPosts.filter(
    (p) => channelFilter === "all" || p.channels.includes(channelFilter),
  );

  // KPI strip
  const published = allPosts.filter(
    (p) => p.status === "published" || p.status === "partial",
  ).length;
  const scheduled = allPosts.filter((p) => p.status === "scheduled").length;
  const failed = allPosts.filter((p) => p.status === "failed").length;
  const drafts = allPosts.filter((p) => p.status === "draft").length;

  function navigate2(dir: -1 | 1) {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    });
  }

  function handleDayClick(day: Date) {
    setSelectedDay(isSameDay(selectedDay ?? new Date(0), day) ? null : day);
  }

  function handleNewPostOnDay(day: Date) {
    const dt = new Date(day);
    dt.setHours(10, 0, 0);
    setComposerDate(dt.toISOString());
    setShowComposer(true);
  }

  const postsOnDay = (day: Date) =>
    posts.filter((p) => {
      const d = p.published_at ?? p.scheduled_at;
      return d && isSameDay(new Date(d), day);
    });

  const selectedDayPosts = selectedDay ? postsOnDay(selectedDay) : [];

  return (
    <>
      <Topbar title="Media" subtitle="Instagram · Facebook · TikTok" />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Social Media"
          subtitle="Schedule and publish posts across Instagram, Facebook, and TikTok."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Social" }]}
          actions={
            <Button
              onClick={() => {
                setComposerDate(undefined);
                setShowComposer(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New Post
            </Button>
          }
        />

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Published", value: published, color: "#2D6A4F" },
            { label: "Scheduled", value: scheduled, color: "#4E9AF1" },
            { label: "Drafts", value: drafts, color: "#9E9891" },
            {
              label: "Failed",
              value: failed,
              color: failed > 0 ? "#EF4444" : "#9E9891",
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3"
            >
              <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
                {kpi.label}
              </p>
              <p
                className="font-display text-2xl font-light tabular-nums"
                style={{ color: kpi.color }}
              >
                {kpi.value}
              </p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status filter */}
          <div className="flex gap-1 rounded-xl border border-white/5 bg-brand-charcoal p-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  statusFilter === f.key
                    ? "bg-brand-accent text-brand-black"
                    : "text-brand-smoke hover:text-brand-cream",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Channel filter */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setChannelFilter("all")}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium border transition-all",
                channelFilter === "all"
                  ? "border-white/30 text-brand-cream bg-brand-graphite"
                  : "border-white/10 text-brand-smoke hover:border-white/20",
              )}
            >
              All
            </button>
            {ALL_CHANNELS.map((ch) => {
              const meta = CHANNEL_META[ch];
              return (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium border transition-all",
                    channelFilter === ch
                      ? "border-2"
                      : "border border-white/10 text-brand-smoke hover:border-white/20",
                  )}
                  style={
                    channelFilter === ch
                      ? {
                          borderColor: meta.color,
                          color: meta.color,
                          backgroundColor: meta.bg,
                        }
                      : {}
                  }
                >
                  {meta.icon} {meta.label}
                </button>
              );
            })}
          </div>

          {/* View toggle */}
          <div className="ml-auto flex items-center gap-1 rounded-xl border border-white/5 bg-brand-charcoal p-1">
            {(
              [
                { key: "calendar", icon: Calendar },
                { key: "list", icon: List },
              ] as const
            ).map(({ key, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={cn(
                  "rounded-lg p-1.5 transition-colors",
                  view === key
                    ? "bg-brand-accent text-brand-black"
                    : "text-brand-smoke hover:text-brand-cream",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-96 rounded-2xl" />
        ) : view === "calendar" ? (
          <div
            className={cn(
              "flex gap-4",
              selectedDay ? "flex-col lg:flex-row" : "",
            )}
          >
            {/* Calendar grid */}
            <div className="flex-1">
              {/* Month nav */}
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => navigate2(-1)}
                  className="rounded-lg p-2 text-brand-smoke hover:text-brand-cream hover:bg-brand-graphite/30 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h3 className="text-base font-semibold text-brand-cream">
                  {MONTH_NAMES[currentDate.getMonth()]}{" "}
                  {currentDate.getFullYear()}
                </h3>
                <button
                  onClick={() => navigate2(1)}
                  className="rounded-lg p-2 text-brand-smoke hover:text-brand-cream hover:bg-brand-graphite/30 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentDate(new Date())}
                  className="ml-1 rounded-lg px-2.5 py-1 text-xs text-brand-smoke hover:text-brand-cream hover:bg-brand-graphite/30 transition-colors"
                >
                  Today
                </button>
              </div>

              <div className="rounded-2xl border border-white/5 bg-brand-charcoal overflow-hidden">
                <div className="grid grid-cols-7 border-b border-white/5">
                  {DAY_NAMES.map((d) => (
                    <div
                      key={d}
                      className="py-2 text-center text-[0.6rem] font-semibold uppercase tracking-widest text-brand-smoke"
                    >
                      {d}
                    </div>
                  ))}
                </div>
                <div className="divide-y divide-white/5">
                  {generateMonthGrid(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                  ).map((week, wi) => (
                    <div
                      key={wi}
                      className="grid grid-cols-7 divide-x divide-white/5"
                      style={{ minHeight: 80 }}
                    >
                      {week.map((day, di) => {
                        const dayPosts = postsOnDay(day);
                        const inMonth =
                          day.getMonth() === currentDate.getMonth();
                        const _isToday = isToday(day);
                        const isSelected =
                          selectedDay && isSameDay(day, selectedDay);

                        return (
                          <div
                            key={di}
                            onClick={() => handleDayClick(day)}
                            onDoubleClick={() => handleNewPostOnDay(day)}
                            className={cn(
                              "p-1.5 cursor-pointer transition-colors",
                              inMonth
                                ? "bg-transparent"
                                : "bg-brand-graphite/10",
                              isSelected
                                ? "bg-brand-accent/5"
                                : "hover:bg-brand-graphite/20",
                            )}
                          >
                            <div
                              className={cn(
                                "mb-1 h-6 w-6 flex items-center justify-center rounded-full text-xs font-medium",
                                _isToday
                                  ? "bg-brand-accent text-brand-black font-bold"
                                  : "",
                                !inMonth
                                  ? "text-brand-smoke/30"
                                  : "text-brand-cloud",
                              )}
                            >
                              {day.getDate()}
                            </div>
                            <div className="space-y-0.5">
                              {dayPosts.slice(0, 3).map((post) => {
                                const statusColor =
                                  POST_STATUS_META[post.status]?.color ??
                                  "#9E9891";
                                return (
                                  <button
                                    key={post.post_id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/social/${post.post_id}`);
                                    }}
                                    className="w-full truncate rounded px-1 py-0.5 text-left text-[0.6rem] font-medium leading-tight"
                                    style={{
                                      backgroundColor: `${statusColor}18`,
                                      color: statusColor,
                                      borderLeft: `2px solid ${statusColor}`,
                                    }}
                                  >
                                    {post.channels
                                      .map((c) => CHANNEL_META[c]?.icon)
                                      .join("")}{" "}
                                    {post.caption?.slice(0, 20) ?? "Post"}
                                  </button>
                                );
                              })}
                              {dayPosts.length > 3 && (
                                <p className="text-[9px] text-brand-smoke pl-1">
                                  +{dayPosts.length - 3} more
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Day detail panel */}
            {selectedDay && (
              <div className="w-full lg:w-64 shrink-0">
                <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-4 sticky top-6 space-y-3">
                  <p className="text-sm font-semibold text-brand-cream">
                    {selectedDay.toLocaleDateString("en-NG", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  {selectedDayPosts.length === 0 ? (
                    <p className="text-xs text-brand-smoke">No posts</p>
                  ) : (
                    selectedDayPosts.map((p) => (
                      <button
                        key={p.post_id}
                        onClick={() => navigate(`/social/${p.post_id}`)}
                        className="w-full text-left rounded-lg border border-white/5 bg-brand-graphite/30 px-3 py-2 hover:border-white/15 transition-colors"
                      >
                        <div className="flex gap-1 mb-1">
                          {p.channels.map((c) => (
                            <ChannelChip key={c} channel={c} size="xs" />
                          ))}
                        </div>
                        <p className="text-xs text-brand-cream truncate">
                          {p.caption?.slice(0, 40) ?? "—"}
                        </p>
                        <PostStatusBadge status={p.status} size="xs" />
                      </button>
                    ))
                  )}
                  <Button
                    size="sm"
                    fullWidth
                    variant="ghost"
                    onClick={() => handleNewPostOnDay(selectedDay)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add post
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* List view */
          <div className="overflow-x-auto rounded-2xl border border-white/5">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-brand-charcoal">
                  {["Preview", "Channels", "Caption", "Status", "Date", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-widest text-brand-smoke"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {posts.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm text-brand-smoke"
                    >
                      No posts match your filters.
                    </td>
                  </tr>
                )}
                {posts.map((post) => (
                  <tr
                    key={post.post_id}
                    className="bg-brand-charcoal hover:bg-brand-graphite/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      {post.media_paths?.[0] ? (
                        <img
                          src={post.media_paths[0]}
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover border border-white/5"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-brand-graphite flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-brand-smoke/40" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {post.channels.map((c) => (
                          <ChannelChip key={c} channel={c} size="xs" />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-brand-cream truncate">
                        {post.caption?.slice(0, 60) ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <PostStatusBadge status={post.status} size="xs" />
                    </td>
                    <td className="px-4 py-3 text-brand-smoke text-xs">
                      {fmtDate(
                        post.published_at ??
                          post.scheduled_at ??
                          post.created_at,
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/social/${post.post_id}`)}
                        className="text-xs text-brand-accent hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PostComposer
          open={showComposer}
          onClose={() => {
            setShowComposer(false);
            setComposerDate(undefined);
          }}
          defaultDate={composerDate}
        />
      </div>
    </>
  );
}
