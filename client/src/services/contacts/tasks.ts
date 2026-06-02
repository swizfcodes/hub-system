import { api } from "../api";
import type { Task, Subtask, TaskBoard, TaskStatus } from "@typedefs/tasks";

export interface TaskListParams {
  business?: string;
  status?: TaskStatus;
  assigned_to?: string;
  reference_type?: string;
  reference_id?: string;
  page?: number;
  limit?: number;
}

export interface TaskListResponse {
  data: Task[];
  pagination: { page: number; limit: number; total: number };
}

export async function listTasks(
  params: TaskListParams = {},
): Promise<TaskListResponse> {
  const { data } = await api.get<TaskListResponse>("/tasks", { params });
  return data;
}

export async function getBoard(
  params: {
    business?: string;
    assigned_to?: string;
    reference_type?: string;
    reference_id?: string;
  } = {},
): Promise<TaskBoard> {
  const { data } = await api.get<TaskBoard>("/tasks/board", { params });
  return data;
}

export async function getTask(id: string): Promise<Task> {
  const { data } = await api.get<Task>(`/tasks/${id}`);
  return data;
}

export async function createTask(payload: Partial<Task>): Promise<Task> {
  const { data } = await api.post<Task>("/tasks", payload);
  return data;
}

export async function updateTask(
  id: string,
  patch: Partial<Task>,
): Promise<Task> {
  const { data } = await api.patch<Task>(`/tasks/${id}`, patch);
  return data;
}

export async function moveTask(id: string, status: TaskStatus): Promise<Task> {
  const { data } = await api.post<Task>(`/tasks/${id}/move`, { status });
  return data;
}

export async function deleteTask(
  id: string,
): Promise<{ task_id: string; is_deleted: boolean }> {
  const { data } = await api.delete<{ task_id: string; is_deleted: boolean }>(
    `/tasks/${id}`,
  );
  return data;
}

// ── Subtasks ──
export async function listSubtasks(taskId: string): Promise<Subtask[]> {
  const { data } = await api.get<{ data: Subtask[] }>(
    `/tasks/${taskId}/subtasks`,
  );
  return data.data;
}
export async function addSubtask(
  taskId: string,
  payload: { title: string; display_order?: number },
): Promise<Subtask> {
  const { data } = await api.post<Subtask>(
    `/tasks/${taskId}/subtasks`,
    payload,
  );
  return data;
}
export async function setSubtaskDone(
  subtaskId: string,
  is_done: boolean,
): Promise<Subtask> {
  const { data } = await api.patch<Subtask>(`/tasks/subtasks/${subtaskId}`, {
    is_done,
  });
  return data;
}
export async function deleteSubtask(
  subtaskId: string,
): Promise<{ deleted: boolean }> {
  const { data } = await api.delete<{ deleted: boolean }>(
    `/tasks/subtasks/${subtaskId}`,
  );
  return data;
}
