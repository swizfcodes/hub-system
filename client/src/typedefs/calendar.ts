// Types mirror shared.calendar_events.

export type EventType =
  | "meeting"
  | "call"
  | "delivery"
  | "pickup"
  | "fitting"
  | "photoshoot"
  | "training"
  | "review"
  | "reminder"
  | "other"
  | string;

export interface CalendarEvent {
  is_private?: boolean;
  event_id: string;
  business: string;
  title: string;
  event_type: EventType;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location?: string | null;
  description?: string | null;
  recurrence_rule?: string | null; // RFC 5545 RRULE
  reference_type?: string | null;
  reference_id?: string | null;
  created_by: string;
  created_by_name?: string | null;
  created_at: string;
  is_deleted?: boolean;
}

export interface ClashResponse {
  code: "CLASH_DETECTED";
  message: string;
  clashes: Array<{
    event_id: string;
    title: string;
    start_at: string;
    end_at: string;
    location?: string;
  }>;
}
