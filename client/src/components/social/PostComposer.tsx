/**
 * PostComposer.tsx
 * The primary post creation/editing UI.
 * Handles: channel selection, media, caption with templates + hashtag sets,
 * TikTok title/description, and draft / schedule / publish-now modes.
 */
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Image as Video,
  Hash,
  BookOpen,
  Plus,
  X,
  Clock,
  Send,
  FileText,
} from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { ChannelSelector } from "@components/social/SocialComponents";
import {
  createPost,
  updatePost,
  publishNow,
  listTemplates,
  listHashtagSets,
} from "@services/social";
import {
  createPostSchema,
  type CreatePostValues,
  CHANNEL_META,
} from "@lib/constants/socialConstants";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import type { SocialPost, SocialChannel } from "@typedefs/social";

interface PostComposerProps {
  open: boolean;
  onClose: () => void;
  existing?: SocialPost | null;
  defaultDate?: string;
}

type PublishMode = "draft" | "schedule" | "now";

export function PostComposer({
  open,
  onClose,
  existing,
  defaultDate,
}: PostComposerProps) {
  const qc = useQueryClient();
  const isEdit = !!existing;

  const [mode, setMode] = useState<PublishMode>("schedule");
  const [mediaUrlInput, setMediaUrlInput] = useState("");

  const form = useForm<CreatePostValues>({
    resolver: zodResolver(createPostSchema),
    defaultValues: {
      channels: existing?.channels ?? ["instagram"],
      caption: existing?.caption ?? "",
      title: existing?.title ?? "",
      description: existing?.description ?? "",
      media_paths: existing?.media_paths ?? [],
      video_path: existing?.video_path ?? "",
      scheduled_at: existing?.scheduled_at
        ? new Date(existing.scheduled_at).toISOString().slice(0, 16)
        : defaultDate
          ? new Date(defaultDate).toISOString().slice(0, 16)
          : "",
      status: "scheduled",
    },
  });

  const channels = form.watch("channels") as SocialChannel[];
  const caption = form.watch("caption") ?? "";
  const mediaPaths = form.watch("media_paths") ?? [];
  const needsVideo = channels.some((c) => c === "tiktok");
  const needsImage = channels.some(
    (c) => c === "instagram" || c === "facebook",
  );

  // Caption character limit = tightest limit of selected channels
  const charLimit = Math.min(
    ...channels.map((c) => CHANNEL_META[c]?.charLimit ?? 2200),
  );

  // Templates + hashtag sets
  const { data: templates = [] } = useQuery({
    queryKey: ["social-templates"],
    queryFn: listTemplates,
  });
  const { data: hashtagSets = [] } = useQuery({
    queryKey: ["social-hashtag-sets"],
    queryFn: listHashtagSets,
  });

  const mutation = useMutation({
    mutationFn: async (values: CreatePostValues) => {
      const payload = {
        ...values,
        status: (mode === "draft" ? "draft" : "scheduled") as
          | "draft"
          | "scheduled",
        scheduled_at:
          mode === "draft"
            ? undefined
            : mode === "now"
              ? new Date().toISOString()
              : values.scheduled_at
                ? new Date(values.scheduled_at).toISOString()
                : undefined,
      };

      if (isEdit) {
        return updatePost(existing!.post_id, payload);
      }
      const post = await createPost(payload as CreatePostValues);
      if (mode === "now") await publishNow(post.post_id);
      return post;
    },
    onSuccess: () => {
      showToast.success(
        mode === "draft"
          ? "Draft saved"
          : mode === "now"
            ? "Publishing…"
            : "Post scheduled",
      );
      qc.invalidateQueries({ queryKey: ["social-posts"] });
      form.reset();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  function applyTemplate(templateText: string) {
    form.setValue("caption", templateText);
  }

  function appendHashtagSet(hashtags: string[]) {
    const current = form.getValues("caption") ?? "";
    const hashStr =
      "\n\n" + hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
    form.setValue("caption", (current + hashStr).trim());
  }

  function addMediaUrl() {
    if (!mediaUrlInput.trim()) return;
    const current = form.getValues("media_paths") ?? [];
    form.setValue("media_paths", [...current, mediaUrlInput.trim()]);
    setMediaUrlInput("");
  }

  function removeMedia(idx: number) {
    const current = form.getValues("media_paths") ?? [];
    form.setValue(
      "media_paths",
      current.filter((_, i) => i !== idx),
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Post" : "New Post"}
      size="lg"
      surface="light"
      footer={
        <div className="flex items-center gap-2">
          {/* Mode switcher */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden mr-auto">
            {(
              [
                { key: "draft", icon: FileText, label: "Draft" },
                { key: "schedule", icon: Clock, label: "Schedule" },
                { key: "now", icon: Send, label: "Now" },
              ] as const
            ).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === key
                    ? "bg-brand-accent text-brand-black"
                    : "text-gray-500 hover:bg-gray-50",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit((v) => mutation.mutate(v))}
            loading={mutation.isPending}
          >
            {mode === "draft"
              ? "Save Draft"
              : mode === "now"
                ? "Publish Now"
                : "Schedule"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Channel selector */}
        <Controller
          name="channels"
          control={form.control}
          render={({ field, fieldState }) => (
            <div>
              <ChannelSelector
                value={field.value as SocialChannel[]}
                onChange={field.onChange}
              />
              {fieldState.error && (
                <p className="mt-1 text-xs text-state-danger">
                  {fieldState.error.message}
                </p>
              )}
            </div>
          )}
        />

        {/* Schedule datetime — only show in schedule mode */}
        {mode === "schedule" && (
          <Controller
            name="scheduled_at"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input
                {...field}
                label="Schedule Date & Time *"
                type="datetime-local"
                surface="light"
                error={fieldState.error?.message}
              />
            )}
          />
        )}

        {/* Media section */}
        {needsImage && (
          <div className="space-y-2">
            <p className="text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted">
              Images{" "}
              {channels.includes("instagram") && (
                <span className="normal-case font-normal">
                  (up to 10 for carousel)
                </span>
              )}
            </p>
            {mediaPaths.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {mediaPaths.map((url, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={url}
                      alt={`Media ${i + 1}`}
                      className="h-20 w-20 rounded-xl object-cover border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => removeMedia(i)}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="url"
                value={mediaUrlInput}
                onChange={(e) => setMediaUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addMediaUrl();
                  }
                }}
                placeholder="Paste image URL or CDN path…"
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-brand-accent/60 focus:outline-none"
              />
              <Button
                size="sm"
                type="button"
                variant="secondary"
                onClick={addMediaUrl}
                disabled={!mediaUrlInput.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Video path — TikTok */}
        {needsVideo && (
          <Controller
            name="video_path"
            control={form.control}
            render={({ field }) => (
              <Input
                {...field}
                label="Video Path (TikTok)"
                surface="light"
                placeholder="/uploads/videos/my-reel.mp4"
                hint="Server-side path to the video file for TikTok upload"
                leftIcon={<Video className="h-4 w-4 text-gray-400" />}
              />
            )}
          />
        )}

        {/* Caption */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted">
              Caption
            </p>
            <span
              className={cn(
                "text-[10px] tabular-nums",
                caption.length > charLimit * 0.9
                  ? "text-red-500"
                  : "text-gray-400",
              )}
            >
              {caption.length}/{charLimit}
            </span>
          </div>

          {/* Template + hashtag pickers */}
          <div className="flex gap-2 flex-wrap">
            {templates.length > 0 && (
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:border-brand-accent/40 hover:text-brand-accent transition-colors"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Templates
                </button>
                <div className="absolute left-0 top-full mt-1 z-20 hidden group-hover:block w-56 rounded-xl border border-gray-200 bg-white shadow-lg">
                  {templates.map((t) => (
                    <button
                      key={t.template_id}
                      type="button"
                      onClick={() => applyTemplate(t.template_text)}
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-xs text-gray-700 hover:bg-gray-50 text-left first:rounded-t-xl last:rounded-b-xl"
                    >
                      <span className="font-medium truncate">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hashtagSets.length > 0 && (
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:border-brand-accent/40 hover:text-brand-accent transition-colors"
                >
                  <Hash className="h-3.5 w-3.5" />
                  Hashtags
                </button>
                <div className="absolute left-0 top-full mt-1 z-20 hidden group-hover:block w-64 rounded-xl border border-gray-200 bg-white shadow-lg">
                  {hashtagSets.map((s) => (
                    <button
                      key={s.set_id}
                      type="button"
                      onClick={() => appendHashtagSet(s.hashtags)}
                      className="flex w-full flex-col gap-0.5 px-3 py-2.5 hover:bg-gray-50 text-left first:rounded-t-xl last:rounded-b-xl"
                    >
                      <span className="text-xs font-medium text-gray-700">
                        {s.name}
                      </span>
                      <span className="text-[10px] text-gray-400 truncate">
                        {s.hashtags.slice(0, 4).join(" ")}
                        {s.hashtags.length > 4 &&
                          ` +${s.hashtags.length - 4} more`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Controller
            name="caption"
            control={form.control}
            render={({ field }) => (
              <textarea
                {...field}
                placeholder="Write your caption… use the template and hashtag buttons above to speed things up."
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:border-brand-accent/60 focus:outline-none resize-none"
                rows={5}
              />
            )}
          />
        </div>

        {/* TikTok title + description */}
        {needsVideo && channels.includes("tiktok") && (
          <div className="space-y-3 rounded-xl border border-[#69C9D0]/20 bg-[#69C9D0]/5 p-4">
            <p className="text-xs font-semibold text-[#69C9D0]">
              🎵 TikTok video details
            </p>
            <Controller
              name="title"
              control={form.control}
              render={({ field }) => (
                <Input
                  {...field}
                  label="Video Title (max 150 chars)"
                  surface="light"
                  placeholder="e.g. Gold Collection 2025"
                />
              )}
            />
            <Controller
              name="description"
              control={form.control}
              render={({ field }) => (
                <Input
                  {...field}
                  label="Description"
                  surface="light"
                  placeholder="Additional context for the TikTok video"
                />
              )}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
