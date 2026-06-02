// ── Enums ─────────────────────────────────────────────────────────────────────

export type SocialChannel = "instagram" | "facebook" | "tiktok";
export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial"
  | "failed"
  | "cancelled";

// ── External IDs (per-channel publish result) ─────────────────────────────────

export interface ChannelResult {
  status: "published" | "failed";
  postId?: string;
  error?: string;
}

export type ExternalIds = Partial<Record<SocialChannel, ChannelResult>>;

// ── Social post ───────────────────────────────────────────────────────────────

export interface SocialPost {
  post_id: string;
  business: string;
  channels: SocialChannel[];
  caption?: string | null;
  title?: string | null;
  description?: string | null;
  media_paths: string[];
  video_path?: string | null;
  scheduled_at?: string | null;
  published_at?: string | null;
  status: PostStatus;
  external_ids: ExternalIds;
  campaign_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Joined when fetched individually
  metrics?: PostMetric[];
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export interface PostMetric {
  metric_id: string;
  post_id: string;
  channel: SocialChannel;
  fetched_at: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  impressions: number;
  extras: Record<string, number>;
}

// ── Caption templates ─────────────────────────────────────────────────────────

export interface CaptionTemplate {
  template_id: string;
  business: string;
  name: string;
  template_text: string;
  platforms: SocialChannel[];
  created_at: string;
}

// ── Hashtag sets ──────────────────────────────────────────────────────────────

export interface HashtagSet {
  set_id: string;
  business: string;
  name: string;
  hashtags: string[];
  platforms: SocialChannel[];
  created_at: string;
}

// ── Connected accounts ────────────────────────────────────────────────────────

export interface SocialAccount {
  account_id: string;
  business: string;
  platform: SocialChannel;
  account_name: string;
  external_id: string;
  is_active: boolean;
  connected_at: string;
}

// ── Comments ──────────────────────────────────────────────────────────────────

export interface PostComment {
  channel: SocialChannel;
  id: string;
  author: string;
  text: string;
  created_at: string;
  native_url: string;
}
