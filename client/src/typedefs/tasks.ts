// Types mirror shared.tasks + shared.task_subtasks.

export type TaskStatus =
  | "inbox"
  | "today"
  | "this_week"
  | "this_month"
  | "later"
  | "done"
  | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface Task {
  is_personal?: boolean;
  task_id: string;
  business: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to?: string | null;
  due_at?: string | null;
  reminder_minutes?: number | null;
  remind_at?: string | null;
  calendar_event_id?: string | null;
  parent_task_id?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  completed_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_deleted?: boolean;
  // Joined
  assigned_to_name?: string | null;
  created_by_name?: string | null;
  subtask_count?: number;
  subtask_done_count?: number;
  subtasks?: Subtask[];
}

export interface Subtask {
  subtask_id: string;
  task_id: string;
  title: string;
  is_done: boolean;
  display_order: number;
  completed_at?: string | null;
  created_at: string;
}

export type TaskBoard = Record<TaskStatus, Task[]>;
