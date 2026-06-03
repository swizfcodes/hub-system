// ── typedefs/scheduling.ts ────────────────────────────────────────────────────
// Unified type surface for the Calendar + Tasks + Workspace modules.
// Re-exports the underlying calendar and tasks types so consumers can import
// everything scheduling-related from one place.

export type {
  EventType,
  CalendarEvent,
  ClashResponse,
} from "@typedefs/calendar";

export type {
  TaskStatus,
  TaskPriority,
  Task,
  Subtask,
  TaskBoard,
} from "@typedefs/tasks";

import type { ClashResponse } from "@typedefs/calendar";

// A single clash entry (the element type of ClashResponse.clashes).
export type ClashInfo = ClashResponse["clashes"][number];
