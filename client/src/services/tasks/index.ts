// ── services/tasks/index.ts ───────────────────────────────────────────────────
// Tasks service for the Tasks / Workspace module. Re-exports the core task CRUD
// from the existing contacts tasks service and adapts the subtask helpers to the
// (taskId, …) call signatures used by the scheduling UI components.

import {
  moveTask as moveTaskCore,
  addSubtask as addSubtaskCore,
  setSubtaskDone as setSubtaskDoneCore,
  deleteSubtask as deleteSubtaskCore,
} from "@services/contacts/tasks";
import type { Subtask, Task, TaskStatus } from "@typedefs/tasks";

export {
  listTasks,
  getBoard,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  listSubtasks,
} from "@services/contacts/tasks";

// The UI calls addSubtask(taskId, title, display_order?); the core service takes a payload.
// display_order is forwarded so drag-and-drop ordering is preserved.
export function addSubtask(
  _taskId: string,
  title: string,
  display_order?: number,
): Promise<Subtask> {
  return addSubtaskCore(_taskId, { title, display_order });
}

// The UI calls setSubtaskDone(taskId, subtaskId, done); core keys off subtaskId.
export function setSubtaskDone(
  _taskId: string,
  subtaskId: string,
  isDone: boolean,
): Promise<Subtask> {
  return setSubtaskDoneCore(subtaskId, isDone);
}

// The UI calls deleteSubtask(taskId, subtaskId); core keys off subtaskId.
export function deleteSubtask(
  _taskId: string,
  subtaskId: string,
): Promise<{ deleted: boolean }> {
  return deleteSubtaskCore(subtaskId);
}

// The board UI passes status as a plain string from the drag target.
export function moveTask(id: string, status: string): Promise<Task> {
  return moveTaskCore(id, status as TaskStatus);
}
