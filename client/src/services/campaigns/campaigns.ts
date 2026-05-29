// ── services/campaigns/campaigns.ts ──────────────────────────────────────────
// API wrappers for the Campaigns module. Endpoint paths follow the backend
// modules/campaigns/campaigns.routes.js conventions.

import { api } from '@services/api';
import type {
  Campaign,
  CampaignStats,
  ABResult,
  RecipientActivity,
  Segment,
  FollowUpSuggestion,
  AudienceFilter,
  AudiencePreview,
  CampaignType,
} from '@typedefs/campaigns';

// ── Campaigns ─────────────────────────────────────────────────────────────

export async function listCampaigns(
  params: { status?: string; campaign_type?: string; limit?: number } = {},
): Promise<{ data: Campaign[] }> {
  try {
    const { data } = await api.get<{ data: Campaign[] } | Campaign[]>('/campaigns', {
      params,
    });
    return Array.isArray(data) ? { data } : { data: data.data ?? [] };
  } catch {
    return { data: [] };
  }
}

export async function getCampaign(id: string): Promise<Campaign> {
  const { data } = await api.get<Campaign>(`/campaigns/${id}`);
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createCampaign(payload: any): Promise<Campaign> {
  const { data } = await api.post<Campaign>('/campaigns', payload);
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateCampaign(id: string, payload: any): Promise<Campaign> {
  const { data } = await api.patch<Campaign>(`/campaigns/${id}`, payload);
  return data;
}

export async function scheduleCampaign(
  id: string,
  scheduledAt: string | { scheduled_at: string },
): Promise<Campaign> {
  const payload =
    typeof scheduledAt === 'string' ? { scheduled_at: scheduledAt } : scheduledAt;
  const { data } = await api.post<Campaign>(`/campaigns/${id}/schedule`, payload);
  return data;
}

export async function sendNow(id: string): Promise<{ sent: number; campaign?: Campaign }> {
  const { data } = await api.post<{ sent: number; campaign?: Campaign }>(
    `/campaigns/${id}/send-now`,
    {},
  );
  return data;
}

export async function cancelCampaign(id: string): Promise<Campaign> {
  const { data } = await api.post<Campaign>(`/campaigns/${id}/cancel`, {});
  return data;
}

// ── Audience ─────────────────────────────────────────────────────────────

export async function previewAudience(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: AudienceFilter | any,
  channelType: CampaignType | 'auto' = 'auto',
): Promise<AudiencePreview> {
  const { data } = await api.post<AudiencePreview>('/campaigns/audience/preview', {
    filter,
    channel_type: channelType,
  });
  return data;
}

export async function buildAudience(
  campaignId: string,
): Promise<{ recipient_count: number; count: number }> {
  const { data } = await api.post<{ recipient_count: number; count: number }>(
    `/campaigns/${campaignId}/build-audience`,
    {},
  );
  return data;
}

// ── Saved segments ───────────────────────────────────────────────────────

export async function listSegments(): Promise<Segment[]> {
  try {
    const { data } = await api.get<{ data: Segment[] } | Segment[]>('/campaigns/segments');
    return Array.isArray(data) ? data : data.data ?? [];
  } catch {
    return [];
  }
}

// ── Stats, results, activity ─────────────────────────────────────────────

export async function getCampaignStats(id: string): Promise<CampaignStats> {
  try {
    const { data } = await api.get<CampaignStats>(`/campaigns/${id}/stats`);
    return data;
  } catch {
    return {};
  }
}

export async function getABResults(id: string): Promise<ABResult | null> {
  try {
    const { data } = await api.get<ABResult>(`/campaigns/${id}/ab-results`);
    return data;
  } catch {
    return null;
  }
}

export async function getRecipientActivity(
  id: string,
  filter?: string | { status?: string; page?: number; limit?: number },
): Promise<RecipientActivity[]> {
  try {
    const params =
      typeof filter === 'string' ? { status: filter } : filter ?? {};
    const { data } = await api.get<
      { data: RecipientActivity[] } | RecipientActivity[]
    >(`/campaigns/${id}/recipients`, { params });
    return Array.isArray(data) ? data : data.data ?? [];
  } catch {
    return [];
  }
}

export async function getFollowUpSuggestions(id: string): Promise<FollowUpSuggestion[]> {
  try {
    const { data } = await api.get<{ data: FollowUpSuggestion[] } | FollowUpSuggestion[]>(
      `/campaigns/${id}/follow-up-suggestions`,
    );
    return Array.isArray(data) ? data : data.data ?? [];
  } catch {
    return [];
  }
}
