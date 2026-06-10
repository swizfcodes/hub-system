// ── services/messaging/messaging.ts ──────────────────────────────────────────
// API wrappers for the SmartComm Messaging module. Endpoint paths follow
// shared/messaging/messaging.routes.js conventions on the backend.

import { api } from "@services/api";
import type {
  Channel,
  Message,
  MessageSearchResult,
  EmailLogEntry,
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
  description?: string;
  contact_id?: string;
  business?: string | null;
  member_user_ids?: string[];
}): Promise<Channel> {
  const { data } = await api.post<Channel>("/messaging/channels", payload);
  return data;
}

export async function updateChannel(
  channelId: string,
  payload: { name?: string; description?: string },
): Promise<Channel> {
  const { data } = await api.patch<Channel>(
    `/messaging/channels/${channelId}`,
    payload,
  );
  return data;
}

export async function archiveChannel(
  channelId: string,
): Promise<{ channel_id: string; is_archived: boolean }> {
  const { data } = await api.post<{ channel_id: string; is_archived: boolean }>(
    `/messaging/channels/${channelId}/archive`,
    {},
  );
  return data;
}

export async function pinChannel(
  channelId: string,
  pinned: boolean,
): Promise<{ channel_id: string; is_pinned: boolean }> {
  const { data } = await api.post<{ channel_id: string; is_pinned: boolean }>(
    `/messaging/channels/${channelId}/pin`,
    { pinned },
  );
  return data;
}

export async function muteChannel(
  channelId: string,
  muted: boolean,
): Promise<{ channel_id: string; is_muted: boolean }> {
  const { data } = await api.post<{ channel_id: string; is_muted: boolean }>(
    `/messaging/channels/${channelId}/mute`,
    { muted },
  );
  return data;
}

// ── Members ───────────────────────────────────────────────────────────────

export async function addChannelMember(
  channelId: string,
  payload: { user_id: string; role?: "member" | "admin" },
): Promise<{ added: boolean }> {
  const { data } = await api.post<{ added: boolean }>(
    `/messaging/channels/${channelId}/members`,
    payload,
  );
  return data;
}

export async function removeChannelMember(
  channelId: string,
  userId: string,
): Promise<{ removed: boolean }> {
  const { data } = await api.delete<{ removed: boolean }>(
    `/messaging/channels/${channelId}/members`,
    { data: { user_id: userId } },
  );
  return data;
}

export async function changeMemberRole(
  channelId: string,
  payload: { user_id: string; role: "member" | "admin" },
): Promise<{ updated: boolean }> {
  const { data } = await api.patch<{ updated: boolean }>(
    `/messaging/channels/${channelId}/members/role`,
    payload,
  );
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
    message_type?: MessageType;
    attachments?: Array<{ document_id: string; display_name?: string }>;
    reply_to_id?: string;
  },
): Promise<Message> {
  const { data } = await api.post<Message>(
    `/messaging/channels/${channelId}/messages`,
    payload,
  );
  return data;
}

export async function editMessage(
  messageId: string,
  content: string,
): Promise<Message> {
  const { data } = await api.patch<Message>(`/messaging/messages/${messageId}`, {
    content,
  });
  return data;
}

export async function deleteMessage(
  messageId: string,
): Promise<{ message_id: string; is_deleted: boolean }> {
  const { data } = await api.delete<{
    message_id: string;
    is_deleted: boolean;
  }>(`/messaging/messages/${messageId}`);
  return data;
}

export async function forwardMessage(
  messageId: string,
  channelIds: string[],
): Promise<{ forwarded_count: number }> {
  const { data } = await api.post<{ forwarded_count: number }>(
    `/messaging/messages/${messageId}/forward`,
    { channel_ids: channelIds },
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

// ── Reactions & stars ─────────────────────────────────────────────────────

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

export async function toggleStar(
  messageId: string,
): Promise<{ starred: boolean }> {
  const { data } = await api.post<{ starred: boolean }>(
    `/messaging/messages/${messageId}/star`,
    {},
  );
  return data;
}

export async function listStarred(): Promise<MessageSearchResult[]> {
  try {
    const { data } = await api.get<{ data: MessageSearchResult[] }>(
      "/messaging/starred",
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

// ── Search ────────────────────────────────────────────────────────────────

export async function searchMessages(params: {
  q: string;
  channel_id?: string;
  limit?: number;
}): Promise<MessageSearchResult[]> {
  try {
    const { data } = await api.get<{ data: MessageSearchResult[] }>(
      "/messaging/search",
      { params },
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

// ── Email log (the "Emails" tab) ──────────────────────────────────────────

export async function listEmailLog(
  params: {
    q?: string;
    business?: string;
    status?: "sent" | "failed";
    page?: number;
    limit?: number;
  } = {},
): Promise<EmailLogEntry[]> {
  try {
    const { data } = await api.get<{ data: EmailLogEntry[] }>(
      "/messaging/emails",
      { params },
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

// ── Thread management ─────────────────────────────────────────────────────
// EXTERNAL-COMMS-DISABLED: only used by dormant customer threads.

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

// ── Customer 360 panel ────────────────────────────────────────────────────
// EXTERNAL-COMMS-DISABLED: only used by dormant customer threads.

export async function getCustomer360(contactId: string): Promise<Customer360> {
  const { data } = await api.get<Customer360>(
    `/messaging/customer-360/${contactId}`,
  );
  return data;
}

// ── Unread count (for the nav badge in AppLayout) ─────────────────────────

export async function getUnreadCount(): Promise<number> {
  try {
    const { data } = await api.get<{ unread_count: number }>(
      "/messaging/unread-count",
    );
    return data?.unread_count ?? 0;
  } catch {
    return 0;
  }
}

// ── Attachments ───────────────────────────────────────────────────────────
// Messages attach shared.documents rows; upload goes through the
// documents module, then the returned document_id is referenced.

export async function uploadMessageAttachment(
  file: File,
  business: string,
): Promise<{ document_id: string; display_name: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("business", business);
  form.append("document_type", "message_attachment");
  form.append("title", file.name);
  const { data } = await api.post<{ document_id: string }>("/documents", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return { document_id: data.document_id, display_name: file.name };
}

/** Fetch an attachment as an object URL for inline preview / playback. */
export async function fetchAttachmentBlobUrl(
  documentId: string,
): Promise<string> {
  const response = await api.get(`/documents/${documentId}/download`, {
    responseType: "blob",
  });
  return URL.createObjectURL(response.data as Blob);
}
