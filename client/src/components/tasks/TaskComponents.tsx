/**
 * TaskComponents.tsx
 * Exports: PriorityBadge, TaskStatusBadge, TaskCard, TaskFormModal, SubtaskChecklist, TaskDetailPanel
 */
import { useState, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  CheckSquare,
  Square,
  Calendar,
  User,
  Link2,
  Lock,
} from "lucide-react";
import { Badge } from "@components/ui/Badge";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import {
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  REF_TYPE_LABEL,
} from "@lib/constants/schedulingConstants";
import {
  createTaskSchema,
  type CreateTaskValues,
} from "@lib/schemas/scheduling";
import {
  createTask,
  updateTask,
  deleteTask,
  addSubtask,
  setSubtaskDone,
  deleteSubtask,
} from "@services/tasks";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtDate } from "@lib/format";
import { cn } from "@lib/cn";
import type { Task, Subtask } from "@typedefs/scheduling";

// ── Badges ────────────────────────────────────────────────────────────────────

export function PriorityBadge({
  priority,
  size = "xs",
}: {
  priority: string;
  size?: "xs" | "sm";
}) {
  const meta = TASK_PRIORITY_META[priority as keyof typeof TASK_PRIORITY_META];
  if (!meta) return null;
  return (
    <Badge tone={meta.tone} size={size}>
      {meta.label}
    </Badge>
  );
}

export function TaskStatusBadge({
  status,
  size = "xs",
}: {
  status: string;
  size?: "xs" | "sm";
}) {
  const meta = TASK_STATUS_META[status as keyof typeof TASK_STATUS_META];
  if (!meta) return null;
  return (
    <Badge tone={meta.tone} size={size} dot={meta.dot}>
      {meta.label}
    </Badge>
  );
}

// ── SubtaskChecklist ──────────────────────────────────────────────────────────

export function SubtaskChecklist({
  taskId,
  subtasks,
  canEdit = true,
}: {
  taskId: string;
  subtasks: Subtask[];
  canEdit?: boolean;
}) {
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const doneMut = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      setSubtaskDone(taskId, id, done),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task", taskId] }),
    onError: (err) => showToast.error(errMsg(err)),
  });

  const addMut = useMutation({
    mutationFn: (title: string) => addSubtask(taskId, title),
    onSuccess: () => {
      setNewTitle("");
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      inputRef.current?.focus();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const delMut = useMutation({
    mutationFn: (subtaskId: string) => deleteSubtask(taskId, subtaskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task", taskId] }),
    onError: (err) => showToast.error(errMsg(err)),
  });

  const doneCount = subtasks.filter((s) => s.is_done).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
          Subtasks {subtasks.length > 0 && `(${doneCount}/${subtasks.length})`}
        </p>
        {subtasks.length > 0 && (
          <div className="h-1.5 w-24 rounded-full bg-brand-graphite overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-accent transition-all"
              style={{
                width: `${Math.round((doneCount / subtasks.length) * 100)}%`,
              }}
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        {subtasks.map((sub) => (
          <div key={sub.subtask_id} className="group flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                doneMut.mutate({ id: sub.subtask_id, done: !sub.is_done })
              }
              className="shrink-0 text-brand-smoke hover:text-brand-accent transition-colors"
            >
              {sub.is_done ? (
                <CheckSquare className="h-4 w-4 text-brand-accent" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </button>
            <span
              className={cn(
                "flex-1 text-sm",
                sub.is_done && "line-through text-brand-smoke",
              )}
            >
              {sub.title}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => delMut.mutate(sub.subtask_id)}
                className="opacity-0 group-hover:opacity-100 text-brand-smoke hover:text-state-danger transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) {
                addMut.mutate(newTitle.trim());
              }
            }}
            placeholder="Add a subtask…"
            className="flex-1 rounded-lg border border-white/10 bg-brand-graphite/30 px-3 py-1.5 text-sm text-brand-cream placeholder-brand-smoke/40 focus:border-brand-accent/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              if (newTitle.trim()) addMut.mutate(newTitle.trim());
            }}
            disabled={!newTitle.trim() || addMut.isPending}
            className="text-brand-smoke hover:text-brand-accent transition-colors disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── TaskCard (for Kanban board) ───────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  onClick: (t: Task) => void;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
}

export function TaskCard({ task, onClick, onDragStart }: TaskCardProps) {
  const meta = TASK_PRIORITY_META[task.priority];
  const isOverdue =
    task.due_at && !task.completed_at && new Date(task.due_at) < new Date();

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.task_id)}
      onClick={() => onClick(task)}
      className="cursor-pointer rounded-xl border border-white/5 bg-brand-charcoal p-3 space-y-2
                 hover:border-white/15 hover:bg-brand-graphite/20 transition-all
                 active:opacity-80 select-none"
      style={{ borderLeft: `3px solid ${meta.color}` }}
    >
      <p className="text-sm font-medium text-brand-cream leading-snug line-clamp-2">
        {task.is_personal && (
          <Lock className="inline h-3 w-3 mr-1 text-brand-smoke" />
        )}
        {task.title}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        {task.reference_type && (
          <span className="text-[10px] text-brand-smoke flex items-center gap-0.5">
            <Link2 className="h-3 w-3" />
            {REF_TYPE_LABEL[task.reference_type] ?? task.reference_type}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        {task.due_at && (
          <span
            className={cn(
              "flex items-center gap-1 text-[10px]",
              isOverdue ? "text-red-400" : "text-brand-smoke",
            )}
          >
            <Calendar className="h-3 w-3" />
            {fmtDate(task.due_at)}
          </span>
        )}
        {task.assigned_to_name && (
          <span className="flex items-center gap-1 text-[10px] text-brand-smoke ml-auto">
            <User className="h-3 w-3" />
            {task.assigned_to_name.split(" ")[0]}
          </span>
        )}
      </div>

      {(task.subtask_count ?? 0) > 0 && (
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 rounded-full bg-brand-graphite overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-accent"
              style={{
                width: `${Math.round(((task.subtask_done_count ?? 0) / (task.subtask_count ?? 1)) * 100)}%`,
              }}
            />
          </div>
          <span className="text-[10px] text-brand-smoke whitespace-nowrap">
            {task.subtask_done_count}/{task.subtask_count}
          </span>
        </div>
      )}
    </div>
  );
}

// ── TaskFormModal ─────────────────────────────────────────────────────────────

const TASK_REMINDER_OPTIONS = [
  { value: "", label: "No reminder" },
  { value: "0", label: "At due time" },
  { value: "15", label: "15 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" },
];

// ISO (UTC) → value for an <input type="datetime-local"> in local wall-clock time.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

interface TaskFormModalProps {
  open: boolean;
  onClose: () => void;
  existing?: Task | null;
  defaultStatus?: string;
  isManager?: boolean;
}

export function TaskFormModal({
  open,
  onClose,
  existing,
  defaultStatus = "inbox",
  isManager = false,
}: TaskFormModalProps) {
  const qc = useQueryClient();
  const { active: business } = useActiveBusiness();
  const isEdit = !!existing;

  const form = useForm<CreateTaskValues>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: existing?.title ?? "",
      description: existing?.description ?? "",
      status: (existing?.status ?? defaultStatus) as any,
      priority: existing?.priority ?? "normal",
      assigned_to: existing?.assigned_to ?? "",
      due_at: existing?.due_at ? toLocalInput(existing.due_at) : "",
      reminder_minutes:
        existing?.reminder_minutes != null
          ? String(existing.reminder_minutes)
          : "",
      is_personal: existing?.is_personal ?? false,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateTaskValues) => {
      // Empty optionals must be dropped (undefined) on create, or sent as null
      // on edit (to clear). due_at is converted from local time to ISO.
      const blank = isEdit ? null : undefined;
      const payload = {
        title: values.title,
        description: values.description || blank,
        status: values.status,
        priority: values.priority,
        is_personal: values.is_personal,
        assigned_to: values.assigned_to ? values.assigned_to : blank,
        due_at: values.due_at ? new Date(values.due_at).toISOString() : blank,
        reminder_minutes:
          values.reminder_minutes === "" || values.reminder_minutes == null
            ? blank
            : Number(values.reminder_minutes),
      };
      return isEdit
        ? updateTask(existing!.task_id, payload)
        : createTask({ ...payload, business: business! });
    },
    onSuccess: () => {
      showToast.success(isEdit ? "Task updated" : "Task created");
      qc.invalidateQueries({ queryKey: ["task-board"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      form.reset();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const isPersonal = form.watch("is_personal");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Task" : "New Task"}
      size="md"
      surface="light"
      footer={
        <div className="flex items-center justify-between gap-3">
          {isEdit && (
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                if (!confirm("Delete this task?")) return;
                await deleteTask(existing!.task_id);
                qc.invalidateQueries({ queryKey: ["task-board"] });
                onClose();
              }}
            >
              Delete
            </Button>
          )}
          <div className="flex gap-3 ml-auto">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit((v) => mutation.mutate(v))}
              loading={mutation.isPending}
            >
              {isEdit ? "Save" : "Create Task"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Controller
          name="title"
          control={form.control}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              label="Title *"
              placeholder="What needs to be done?"
              surface="light"
              error={fieldState.error?.message}
            />
          )}
        />

        <Controller
          name="description"
          control={form.control}
          render={({ field }) => (
            <Input
              {...field}
              label="Description"
              placeholder="More details..."
              surface="light"
            />
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="priority"
            control={form.control}
            render={({ field }) => (
              <Select
                label="Priority"
                options={TASK_PRIORITY_OPTIONS}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                surface="light"
              />
            )}
          />
          <Controller
            name="status"
            control={form.control}
            render={({ field }) => (
              <Select
                label="Status"
                options={TASK_STATUS_OPTIONS}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                surface="light"
              />
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="due_at"
            control={form.control}
            render={({ field }) => (
              <Input
                {...field}
                label="Due Date & Time"
                type="datetime-local"
                surface="light"
                hint="Adds it to your calendar"
              />
            )}
          />
          <Controller
            name="reminder_minutes"
            control={form.control}
            render={({ field }) => (
              <Select
                label="Reminder"
                options={TASK_REMINDER_OPTIONS}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value)}
                surface="light"
              />
            )}
          />
        </div>

        {isManager && !isPersonal && (
          <Controller
            name="assigned_to"
            control={form.control}
            render={({ field }) => (
              <Input
                {...field}
                label="Assign To (User ID)"
                placeholder="UUID of assignee"
                surface="light"
                hint="Manager/owner can assign to any staff"
              />
            )}
          />
        )}

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            {...form.register("is_personal")}
            className="rounded"
          />
          <Lock className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-text-on-light-muted">
            Personal task — visible to you only
          </span>
        </label>
      </div>
    </Modal>
  );
}

// ── TaskDetailPanel ───────────────────────────────────────────────────────────

interface TaskDetailPanelProps {
  task: Task;
  onEdit: () => void;
  onClose: () => void;
}

export function TaskDetailPanel({
  task,
  onEdit,
  onClose,
}: TaskDetailPanelProps) {
  const isOverdue =
    task.due_at && !task.completed_at && new Date(task.due_at) < new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <div>
          <p className="font-semibold text-brand-cream text-lg leading-tight">
            {task.title}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <PriorityBadge priority={task.priority} />
            <TaskStatusBadge status={task.status} />
          </div>
        </div>
      </div>

      {task.description && (
        <p className="text-sm text-brand-smoke whitespace-pre-wrap">
          {task.description}
        </p>
      )}

      <div className="space-y-2 text-sm">
        {task.assigned_to_name && (
          <div className="flex items-center gap-2 text-brand-cloud">
            <User className="h-4 w-4 text-brand-smoke" />
            {task.assigned_to_name}
          </div>
        )}
        {task.due_at && (
          <div
            className={cn(
              "flex items-center gap-2",
              isOverdue ? "text-red-400" : "text-brand-cloud",
            )}
          >
            <Calendar className="h-4 w-4" />
            {fmtDate(task.due_at)}
            {isOverdue && (
              <span className="text-xs font-semibold">OVERDUE</span>
            )}
          </div>
        )}
        {task.reference_type && (
          <div className="flex items-center gap-2 text-brand-smoke text-xs">
            <Link2 className="h-3.5 w-3.5" />
            {REF_TYPE_LABEL[task.reference_type] ?? task.reference_type}
          </div>
        )}
      </div>

      {task.subtasks && task.subtasks.length > 0 && (
        <SubtaskChecklist taskId={task.task_id} subtasks={task.subtasks} />
      )}
      {(!task.subtasks || task.subtasks.length === 0) && (
        <SubtaskChecklist taskId={task.task_id} subtasks={[]} />
      )}

      <div className="flex gap-2 pt-2 border-t border-white/5">
        <Button size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
