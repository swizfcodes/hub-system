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

// ── Newsletter subscribers ───────────────────────────────────────────────

export interface Subscriber {
  email:           string;
  subscribed_at:   string;
  unsubscribed_at: string | null;
  source:          string;
  is_active:       boolean;
}

export interface SubscriberList {
  data:   Subscriber[];
  counts: { total: number; active: number; unsubscribed: number };
}

export async function listSubscribers(params: {
  search?: string;
  status?: 'active' | 'unsubscribed';
} = {}): Promise<SubscriberList> {
  const { data } = await api.get<SubscriberList>('/campaigns/subscribers', {
    params,
  });
  return data;
}

// Returns the CSV export URL (caller can open it; auth is via the api client).
export function subscribersExportUrl(params: {
  search?: string;
  status?: string;
} = {}): string {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v) as [string, string][],
  ).toString();
  return `/campaigns/subscribers/export${qs ? `?${qs}` : ''}`;
}

// ── Storefront enquiries ─────────────────────────────────────────────────

export type EnquiryStatus = 'new' | 'read' | 'replied' | 'closed';

export interface Enquiry {
  id:         string;
  name:       string;
  email:      string;
  phone:      string;
  type:       string;
  message:    string;
  status:     EnquiryStatus;
  created_at: string;
}

export interface EnquiryList {
  data:   Enquiry[];
  counts: { total: number; new: number; replied: number; closed: number };
}

export async function listEnquiries(params: {
  search?: string;
  status?: EnquiryStatus;
  type?:   string;
} = {}): Promise<EnquiryList> {
  const { data } = await api.get<EnquiryList>('/campaigns/enquiries', { params });
  return data;
}

export async function setEnquiryStatus(
  id: string,
  status: EnquiryStatus,
): Promise<Enquiry> {
  const { data } = await api.patch<Enquiry>(`/campaigns/enquiries/${id}/status`, {
    status,
  });
  return data;
}

export async function replyToEnquiry(
  id: string,
  message: string,
): Promise<{ ok: boolean; channel_id: string }> {
  const { data } = await api.post<{ ok: boolean; channel_id: string }>(
    `/campaigns/enquiries/${id}/reply`,
    { message },
  );
  return data;
}
