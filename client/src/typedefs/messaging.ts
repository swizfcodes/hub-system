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
  joined_at: string;
  last_read_at?: string | null;
}

export interface LastMessage {
  message_id: string;
  content?: string | null;
  message_type: MessageType;
  created_at: string;
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
}

// ── Messages ──────────────────────────────────────────────────────────────────

export interface MessageAttachment {
  attachment_id: string;
  document_id: string;
  display_name?: string | null;
}

export interface MessageReaction {
  reaction_id: string;
  user_id: string;
  emoji: string;
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
  reply_to_id?: string | null;
  external_ref?: string | null;
  created_at: string;
  attachments: MessageAttachment[];
  reactions?: MessageReaction[];
}

// ── Customer 360 (sidebar) ────────────────────────────────────────────────────

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
