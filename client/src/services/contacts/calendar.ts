import { api } from "../api";
import type { CalendarEvent } from "@typedefs/calendar";

export interface RangeParams {
  from: string;
  to: string;
  business?: string;
  event_type?: string;
  created_by?: string;
}

export async function listEvents(
  params: RangeParams,
): Promise<CalendarEvent[]> {
  const { data } = await api.get<{ data: CalendarEvent[] }>(
    "/calendar/events",
    { params },
  );
  return data.data;
}

export async function listEventsForReference(
  reference_type: string,
  reference_id: string,
): Promise<CalendarEvent[]> {
  const { data } = await api.get<{ data: CalendarEvent[] }>(
    "/calendar/events/for-reference",
    {
      params: { reference_type, reference_id },
    },
  );
  return data.data;
}

export async function getEvent(id: string): Promise<CalendarEvent> {
  const { data } = await api.get<CalendarEvent>(`/calendar/events/${id}`);
  return data;
}

export async function createEvent(
  payload: Partial<CalendarEvent> & { force?: boolean },
): Promise<CalendarEvent> {
  const { data } = await api.post<CalendarEvent>("/calendar/events", payload);
  return data;
}

export async function updateEvent(
  id: string,
  patch: Partial<CalendarEvent> & { force?: boolean },
): Promise<CalendarEvent> {
  const { data } = await api.patch<CalendarEvent>(
    `/calendar/events/${id}`,
    patch,
  );
  return data;
}

export async function deleteEvent(
  id: string,
): Promise<{ event_id: string; is_deleted: boolean }> {
  const { data } = await api.delete<{ event_id: string; is_deleted: boolean }>(
    `/calendar/events/${id}`,
  );
  return data;
}
