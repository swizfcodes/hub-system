// ── services/social/social.ts ─────────────────────────────────────────────────
// API wrappers for the Social Media module — posts, metrics, comments,
// caption templates and hashtag sets.

import { api } from "@services/api";
import type {
  SocialPost,
  PostMetric,
  PostComment,
  CaptionTemplate,
  HashtagSet,
} from "@typedefs/social";
import type { CreatePostValues } from "@lib/constants/socialConstants";

export interface PostListResponse {
  data: SocialPost[];
}

// ── Posts ─────────────────────────────────────────────────────────────────────
export async function listPosts(
  params: { status?: string; limit?: number; channel?: string } = {},
): Promise<PostListResponse> {
  try {
    const { data } = await api.get<PostListResponse>("/social/posts", {
      params,
    });
    return data;
  } catch {
    return { data: [] };
  }
}

export async function getPost(id: string): Promise<SocialPost | null> {
  try {
    const { data } = await api.get<SocialPost>(`/social/posts/${id}`);
    return data;
  } catch {
    return null;
  }
}

export async function createPost(
  values: CreatePostValues,
): Promise<SocialPost> {
  const { data } = await api.post<SocialPost>("/social/posts", values);
  return data;
}

export async function updatePost(
  id: string,
  values: Partial<CreatePostValues>,
): Promise<SocialPost> {
  const { data } = await api.patch<SocialPost>(`/social/posts/${id}`, values);
  return data;
}

export async function publishNow(id: string): Promise<SocialPost> {
  const { data } = await api.post<SocialPost>(
    `/social/posts/${id}/publish`,
    {},
  );
  return data;
}

export async function cancelPost(id: string): Promise<SocialPost> {
  const { data } = await api.post<SocialPost>(`/social/posts/${id}/cancel`, {});
  return data;
}

// ── Metrics & comments ────────────────────────────────────────────────────────
export async function getMetrics(postId: string): Promise<PostMetric[]> {
  try {
    const { data } = await api.get<{ data: PostMetric[] }>(
      `/social/posts/${postId}/metrics`,
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function getComments(postId: string): Promise<PostComment[]> {
  try {
    const { data } = await api.get<{ data: PostComment[] }>(
      `/social/posts/${postId}/comments`,
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

// ── Templates & hashtag sets ──────────────────────────────────────────────────
export async function listTemplates(): Promise<CaptionTemplate[]> {
  try {
    const { data } = await api.get<{ data: CaptionTemplate[] }>(
      "/social/templates",
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function listHashtagSets(): Promise<HashtagSet[]> {
  try {
    const { data } = await api.get<{ data: HashtagSet[] }>(
      "/social/hashtag-sets",
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}
