// ── lib/constants/socialConstants.ts ─────────────────────────────────────────
import { z } from "zod";
import type { BadgeProps } from "@components/ui/Badge";
import type { PostStatus, SocialChannel } from "@typedefs/social";

// ── Channel meta ──────────────────────────────────────────────────────────────

export const CHANNEL_META: Record<
  SocialChannel,
  {
    label: string;
    color: string;
    bg: string;
    icon: string;
    charLimit: number;
  }
> = {
  instagram: {
    label: "Instagram",
    color: "#E1306C",
    bg: "#E1306C15",
    icon: "📷",
    charLimit: 2200,
  },
  facebook: {
    label: "Facebook",
    color: "#1877F2",
    bg: "#1877F215",
    icon: "👤",
    charLimit: 63206,
  },
  tiktok: {
    label: "TikTok",
    color: "#69C9D0",
    bg: "#69C9D015",
    icon: "🎵",
    charLimit: 2200,
  },
};

export const ALL_CHANNELS: SocialChannel[] = [
  "instagram",
  "facebook",
  "tiktok",
];

// ── Post status meta ──────────────────────────────────────────────────────────

export const POST_STATUS_META: Record<
  PostStatus,
  {
    label: string;
    tone: BadgeProps["tone"];
    dot?: boolean;
    color: string;
  }
> = {
  draft: { label: "Draft", tone: "neutral", color: "#9E9891" },
  scheduled: { label: "Scheduled", tone: "info", color: "#4E9AF1", dot: true },
  publishing: {
    label: "Publishing",
    tone: "gold",
    color: "#C9A86C",
    dot: true,
  },
  published: { label: "Published", tone: "sage", color: "#2D6A4F" },
  partial: { label: "Partial", tone: "warn", color: "#F97316" },
  failed: { label: "Failed", tone: "danger", color: "#EF4444" },
  cancelled: { label: "Cancelled", tone: "neutral", color: "#6B7280" },
};

// ── Zod schema ────────────────────────────────────────────────────────────────

export const createPostSchema = z.object({
  channels: z
    .array(z.enum(["instagram", "facebook", "tiktok"]))
    .min(1, "Select at least one channel"),
  caption: z.string().max(2200).optional().or(z.literal("")),
  title: z.string().max(150).optional().or(z.literal("")),
  description: z.string().max(2200).optional().or(z.literal("")),
  media_paths: z.array(z.string().url()).optional(),
  video_path: z.string().optional().or(z.literal("")),
  scheduled_at: z.string().optional().or(z.literal("")),
  status: z.enum(["draft", "scheduled"]).default("scheduled"),
  campaign_id: z.string().uuid().optional().or(z.literal("")),
});
export type CreatePostValues = z.infer<typeof createPostSchema>;

export const captionTemplateSchema = z.object({
  name: z.string().min(1, "Name required").max(100),
  template_text: z.string().min(1, "Template text required"),
  platforms: z.array(z.enum(["instagram", "facebook", "tiktok"])).optional(),
});

export const hashtagSetSchema = z.object({
  name: z.string().min(1, "Name required").max(100),
  hashtags: z.array(z.string()).min(1, "Add at least one hashtag"),
  platforms: z.array(z.enum(["instagram", "facebook", "tiktok"])).optional(),
});

// ── Calendar utilities ────────────────────────────────────────────────────────

export function generateMonthGrid(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startDate.getDay());
  const weeks: Date[][] = [];
  const current = new Date(startDate);
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
