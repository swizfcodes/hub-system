import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  XCircle,
  Edit2,
  ExternalLink,
  BarChart2,
  MessageCircle,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Tabs } from "@components/ui/Tabs";
import { Skeleton } from "@components/ui/Skeleton";
import { Badge } from "@components/ui/Badge";
import {
  PostStatusBadge,
  ChannelChip,
  MetricsPanel,
  PostCommentsPanel,
} from "@components/social/SocialComponents";
import { PostComposer } from "@components/social/PostComposer";
import { getPost, publishNow, cancelPost } from "@services/social";
import { CHANNEL_META } from "@lib/constants/socialConstants";
import { fmtDateTime } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import type { SocialChannel } from "@typedefs/social";

const DETAIL_TABS = [
  { key: "overview", label: "Overview" },
  { key: "metrics", label: "Analytics" },
  { key: "comments", label: "Comments" },
];

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState("overview");
  const [showEdit, setShowEdit] = useState(false);

  const { data: post, isLoading } = useQuery({
    queryKey: ["social-post", id],
    queryFn: () => getPost(id!),
    enabled: !!id,
    refetchInterval: 15_000,
  });

  const publishMutation = useMutation({
    mutationFn: () => publishNow(id!),
    onSuccess: (result) => {
      showToast.success(`Published — ${result.status}`);
      qc.invalidateQueries({ queryKey: ["social-post", id] });
      qc.invalidateQueries({ queryKey: ["social-posts"] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelPost(id!),
    onSuccess: () => {
      showToast.success("Post cancelled");
      qc.invalidateQueries({ queryKey: ["social-post", id] });
      qc.invalidateQueries({ queryKey: ["social-posts"] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  if (isLoading) {
    return (
      <div className="px-4 sm:px-8 py-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-brand-smoke">Post not found.</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate("/social")}
        >
          Back
        </Button>
      </div>
    );
  }

  const canEdit = ["draft", "scheduled"].includes(post.status);
  const canPublish = ["draft", "scheduled"].includes(post.status);
  const canCancel = ["draft", "scheduled"].includes(post.status);
  const isPublished = ["published", "partial"].includes(post.status);

  return (
    <div className="px-4 sm:px-8 py-6 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title={post.caption?.slice(0, 60) ?? "Social Post"}
        subtitle={post.title ?? ""}
        crumbs={[{ label: "Social", to: "/social" }, { label: "Post" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {post.channels.map((c) => (
              <ChannelChip key={c} channel={c} />
            ))}
            <PostStatusBadge status={post.status} />
            {canEdit && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowEdit(true)}
              >
                <Edit2 className="h-4 w-4" />
                Edit
              </Button>
            )}
            {canPublish && (
              <Button
                size="sm"
                onClick={() => publishMutation.mutate()}
                loading={publishMutation.isPending}
              >
                <Send className="h-4 w-4" />
                Publish Now
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="danger"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                <XCircle className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <Tabs
        tabs={DETAIL_TABS}
        active={activeTab}
        onChange={setActiveTab}
        surface="dark"
        variant="underline"
      />

      {/* Overview tab */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left — content */}
          <div className="space-y-4">
            {/* Media preview */}
            {post.media_paths?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
                  Media
                </p>
                <div className="flex flex-wrap gap-2">
                  {post.media_paths.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Media ${i + 1}`}
                      className="h-24 w-24 rounded-xl object-cover border border-white/10"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Caption */}
            {post.caption && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
                  Caption
                </p>
                <p className="text-sm text-brand-cream whitespace-pre-wrap leading-relaxed">
                  {post.caption}
                </p>
              </div>
            )}

            {/* TikTok title + description */}
            {(post.title || post.description) && (
              <div className="rounded-xl border border-[#69C9D0]/20 bg-[#69C9D0]/5 p-4 space-y-2">
                <p className="text-xs font-semibold text-[#69C9D0]">
                  🎵 TikTok
                </p>
                {post.title && (
                  <p className="text-sm font-medium text-brand-cream">
                    {post.title}
                  </p>
                )}
                {post.description && (
                  <p className="text-xs text-brand-smoke">{post.description}</p>
                )}
              </div>
            )}
          </div>

          {/* Right — schedule + per-channel results */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <InfoCard
                label="Scheduled"
                value={post.scheduled_at ? fmtDateTime(post.scheduled_at) : "—"}
              />
              <InfoCard
                label="Published"
                value={post.published_at ? fmtDateTime(post.published_at) : "—"}
              />
            </div>

            {/* Per-channel results */}
            {Object.keys(post.external_ids || {}).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
                  Channel Results
                </p>
                {Object.entries(post.external_ids).map(([channel, result]) => {
                  const meta = CHANNEL_META[channel as SocialChannel];
                  if (!meta) return null;
                  return (
                    <div
                      key={channel}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-4 py-3",
                        result.status === "published"
                          ? "border-emerald-500/20 bg-emerald-900/10"
                          : "border-red-500/20 bg-red-900/10",
                      )}
                    >
                      <span className="text-base">{meta.icon}</span>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-brand-cream">
                          {meta.label}
                        </p>
                        {result.postId && (
                          <p className="text-[10px] text-brand-smoke font-mono">
                            {result.postId}
                          </p>
                        )}
                        {result.error && (
                          <p className="text-[10px] text-red-400">
                            {result.error}
                          </p>
                        )}
                      </div>
                      {result.status === "published" && result.postId && (
                        <a
                          href={
                            channel === "instagram"
                              ? `https://www.instagram.com/p/${result.postId}/`
                              : channel === "facebook"
                                ? `https://www.facebook.com/${result.postId}`
                                : channel === "tiktok"
                                  ? `https://www.tiktok.com/@yourhandle/video/${result.postId}`
                                  : "#"
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-smoke hover:text-brand-accent transition-colors"
                          title="View on platform"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <Badge
                        tone={result.status === "published" ? "sage" : "danger"}
                        size="xs"
                      >
                        {result.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analytics tab */}
      {activeTab === "metrics" &&
        (!isPublished ? (
          <div className="py-12 text-center rounded-2xl border border-white/5 bg-brand-charcoal">
            <BarChart2 className="mx-auto h-10 w-10 text-brand-smoke/30 mb-3" />
            <p className="text-sm text-brand-smoke">
              Analytics appear after the post is published.
            </p>
          </div>
        ) : (
          <MetricsPanel postId={post.post_id} />
        ))}

      {/* Comments tab */}
      {activeTab === "comments" &&
        (!isPublished ? (
          <div className="py-12 text-center rounded-2xl border border-white/5 bg-brand-charcoal">
            <MessageCircle className="mx-auto h-10 w-10 text-brand-smoke/30 mb-3" />
            <p className="text-sm text-brand-smoke">
              Comments appear after the post is published.
            </p>
          </div>
        ) : (
          <PostCommentsPanel postId={post.post_id} />
        ))}

      {/* Edit modal */}
      {showEdit && (
        <PostComposer
          open={showEdit}
          onClose={() => setShowEdit(false)}
          existing={post}
        />
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-brand-charcoal px-4 py-3">
      <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
        {label}
      </p>
      <p className="text-sm font-medium text-brand-cream">{value}</p>
    </div>
  );
}
