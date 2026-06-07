// ── services/messaging/messaging.ts ──────────────────────────────────────────
// API wrappers for the SmartComm Messaging module. Endpoint paths follow
// shared/messaging/messaging.routes.js conventions on the backend.

import { api } from "@services/api";
import type {
  Channel,
  Message,
  Customer360,
  ChannelType,
  Platform,
  MessageType,
} from "@typedefs/messaging";

// ── Channels ──────────────────────────────────────────────────────────────

export async function listChannels(
  params: {
    business?: string;
    channel_type?: string;
    platform?: Platform | "internal";
    status?: string;
    search?: string;
    q?: string;
    limit?: number;
  } = {},
): Promise<{ data: Channel[] }> {
  try {
    const { data } = await api.get<{ data: Channel[] } | Channel[]>(
      "/messaging/channels",
      {
        params,
      },
    );
    return Array.isArray(data) ? { data } : { data: data.data ?? [] };
  } catch {
    return { data: [] };
  }
}

export async function getChannel(channelId: string): Promise<Channel> {
  const { data } = await api.get<Channel>(`/messaging/channels/${channelId}`);
  return data;
}

export async function createChannel(payload: {
  channel_type: ChannelType;
  name?: string;
  contact_id?: string;
  business?: string | null;
  member_user_ids?: string[];
}): Promise<Channel> {
  const { data } = await api.post<Channel>("/messaging/channels", payload);
  return data;
}

// ── Messages ──────────────────────────────────────────────────────────────

export async function listMessages(
  channelId: string,
  params: { before?: string; limit?: number } = {},
): Promise<Message[]> {
  try {
    const { data } = await api.get<{ data: Message[] } | Message[]>(
      `/messaging/channels/${channelId}/messages`,
      { params },
    );
    return Array.isArray(data) ? data : (data.data ?? []);
  } catch {
    return [];
  }
}

export async function sendMessage(
  channelId: string,
  payload: {
    content?: string;
    body?: string;
    message_type?: MessageType;
    attachments?: Array<{ url: string; media_type: string; name?: string }>;
    reply_to_id?: string;
    reply_to_message_id?: string;
  },
): Promise<Message> {
  const { data } = await api.post<Message>(
    `/messaging/channels/${channelId}/messages`,
    payload,
  );
  return data;
}

export async function markRead(
  channelId: string,
  lastMessageId?: string,
): Promise<{ ok: boolean }> {
  try {
    const { data } = await api.post<{ ok: boolean }>(
      `/messaging/channels/${channelId}/mark-read`,
      lastMessageId ? { up_to_message_id: lastMessageId } : {},
    );
    return data;
  } catch {
    return { ok: false };
  }
}

// ── Thread management ─────────────────────────────────────────────────────

export async function assignThread(
  channelId: string,
  payload: {
    assigned_to?: string | null;
    user_id?: string;
    handoff_note?: string;
  },
): Promise<Channel> {
  // Backend expects { assigned_to, handoff_note? }. Some callers pass
  // { user_id } — accept both and normalise.
  const body = {
    assigned_to: payload.assigned_to ?? payload.user_id ?? null,
    handoff_note: payload.handoff_note,
  };
  const { data } = await api.patch<Channel>(
    `/messaging/channels/${channelId}/assign`,
    body,
  );
  return data;
}

export async function resolveThread(channelId: string): Promise<Channel> {
  const { data } = await api.patch<Channel>(
    `/messaging/channels/${channelId}/resolve`,
    {},
  );
  return data;
}

export async function toggleReaction(
  messageId: string,
  emoji: string,
): Promise<{ added: boolean; emoji: string }> {
  const { data } = await api.post<{ added: boolean; emoji: string }>(
    `/messaging/messages/${messageId}/react`,
    { emoji },
  );
  return data;
}

// ── Customer 360 panel ────────────────────────────────────────────────────

export async function getCustomer360(contactId: string): Promise<Customer360> {
  const { data } = await api.get<Customer360>(
    `/messaging/customer-360/${contactId}`,
  );
  return data;
}

// ── Unread count (for the nav badge in AppLayout) ─────────────────────────

export async function getUnreadCount(): Promise<number> {
  try {
    const { data } = await api.get<{ count: number }>(
      "/messaging/unread-count",
    );
    return data?.count ?? 0;
  } catch {
    return 0;
  }
}
