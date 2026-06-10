// ── Enums ─────────────────────────────────────────────────────────────────────

export type ChannelType = "group" | "direct" | "customer_thread";
export type MessageType =
  | "text"
  | "image"
  | "document"
  | "voice_note"
  | "system";
export type SenderKind = "staff" | "customer" | "system";
export type ParticipantRole = "member" | "admin";
export type ChannelStatus = "open" | "resolved";
// EXTERNAL-COMMS-DISABLED: external platforms are dormant until Meta API
// access is available — only "internal" is in active use.
export type Platform =
  | "whatsapp_business_account"
  | "instagram"
  | "page"
  | "email"
  | "internal";

// ── Channel ───────────────────────────────────────────────────────────────────

export interface ChannelMember {
  user_id?: string | null;
  contact_id?: string | null;
  display_name?: string | null;
  role: ParticipantRole;
  joined_at?: string;
  last_read_at?: string | null;
  last_seen_at?: string | null;
}

export interface LastMessage {
  message_id: string;
  content?: string | null;
  is_deleted?: boolean;
  message_type: MessageType;
  created_at: string;
  sender_user_id?: string | null;
  sender_name: string;
}

export interface ChannelMetadata {
  source?: Platform | null;
  external_id?: string | null;
  [key: string]: unknown;
}

export interface Channel {
  channel_id: string;
  channel_type: ChannelType;
  name?: string | null;
  description?: string | null;
  business?: string | null;
  is_archived: boolean;
  status?: ChannelStatus;
  metadata: ChannelMetadata;
  assigned_to?: string | null;
  assigned_at?: string | null;
  created_at: string;
  updated_at: string;
  // Enriched by listChannelsForUser
  last_message?: LastMessage | null;
  unread_count: number;
  members?: ChannelMember[] | null;
  is_pinned?: boolean | null;
  is_muted?: boolean | null;
  my_role?: ParticipantRole | null;
}

// ── Messages ──────────────────────────────────────────────────────────────────

export interface MessageAttachment {
  attachment_id: string;
  document_id: string;
  display_name?: string | null;
}

export interface MessageReaction {
  emoji: string;
  user_id: string;
  user_name?: string | null;
}

export interface ReplyPreview {
  message_id: string;
  content?: string | null;
  is_deleted?: boolean;
  message_type: MessageType;
  sender_user_id?: string | null;
  sender_name: string;
}

export interface Message {
  message_id: string;
  channel_id: string;
  sender_user_id?: string | null;
  sender_contact_id?: string | null;
  sender_name: string;
  sender_kind: SenderKind;
  message_type: MessageType;
  content?: string | null;
  is_deleted?: boolean;
  edited_at?: string | null;
  is_forwarded?: boolean;
  reply_to_id?: string | null;
  reply_to?: ReplyPreview | null;
  external_ref?: string | null;
  created_at: string;
  attachments: MessageAttachment[];
  reactions?: MessageReaction[];
  /** How many other members have read this message (for ✓✓ ticks). */
  read_count?: number;
  /** How many members (besides the sender) should read it. */
  recipient_count?: number;
  is_starred?: boolean;
}

// ── Search & starred results ──────────────────────────────────────────────────

export interface MessageSearchResult {
  message_id: string;
  channel_id: string;
  sender_user_id?: string | null;
  message_type: MessageType;
  content?: string | null;
  created_at: string;
  starred_at?: string;
  channel_name?: string | null;
  channel_type: ChannelType;
  sender_name: string;
}

// ── Email log (the "Emails" tab) ──────────────────────────────────────────────

export interface EmailLogEntry {
  email_id: string;
  recipient: string;
  subject?: string | null;
  business?: string | null;
  status: "sent" | "failed";
  error?: string | null;
  created_at: string;
  sender_name?: string | null;
}

// ── Customer 360 (sidebar) ────────────────────────────────────────────────────
// EXTERNAL-COMMS-DISABLED: only used by dormant customer threads.

export interface Customer360 {
  contact: {
    contact_id: string;
    display_name: string;
    primary_phone?: string | null;
    email?: string | null;
    whatsapp_number?: string | null;
    company_name?: string | null;
    tags?: string[];
  };
  orders: {
    order_id: string;
    order_number: string;
    status: string;
    total: number;
  }[];
  invoices: {
    invoice_id: string;
    invoice_number: string;
    amount_due: number;
    due_date: string;
  }[];
  deliveries: {
    delivery_id: string;
    delivery_number: string;
    status: string;
  }[];
}
