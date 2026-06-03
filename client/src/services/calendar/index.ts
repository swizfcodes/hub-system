// ── services/calendar/index.ts ────────────────────────────────────────────────
// Calendar service for the Calendar / Workspace module. Re-exports the core
// event CRUD from the existing contacts calendar service and adds participant
// management (introduced by the scheduling patch).

import { api } from "@services/api";

export {
  listEvents,
  listEventsForReference,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
} from "@services/contacts/calendar";

export interface EventParticipant {
  participant_id: string;
  event_id?: string;
  user_id?: string | null;
  contact_id?: string | null;
  display_name?: string | null;
  status?: "invited" | "accepted" | "declined" | "tentative" | string;
}

export async function listParticipants(
  eventId: string,
): Promise<EventParticipant[]> {
  try {
    const { data } = await api.get<{ data: EventParticipant[] }>(
      `/calendar/events/${eventId}/participants`,
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function addParticipant(
  eventId: string,
  payload: { user_id?: string; contact_id?: string },
): Promise<EventParticipant> {
  const { data } = await api.post<EventParticipant>(
    `/calendar/events/${eventId}/participants`,
    payload,
  );
  return data;
}

export async function removeParticipant(
  eventId: string,
  participantId: string,
): Promise<void> {
  await api.delete(`/calendar/events/${eventId}/participants/${participantId}`);
}
