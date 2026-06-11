import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  CheckSquare,
  Clock,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { Badge } from "@components/ui/Badge";
import { EmptyState } from "@components/ui/EmptyState";
import { Skeleton } from "@components/ui/Skeleton";
import { listTasks, createTask, moveTask } from "@services/contacts/tasks";
import {
  taskCreateSchema,
  TASK_PRIORITIES,
  type TaskCreateValues,
} from "@lib/schemas/task";
import { useBusinessStore } from "@stores/useBusinessStore";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtDate, fmtRelative } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { Task, TaskStatus } from "@typedefs/tasks";
import { cn } from "@lib/cn";

const PRIORITY_TONE: Record<string, "gold" | "rose" | "neutral" | "danger"> = {
  urgent: "danger",
  high: "rose",
  normal: "neutral",
  low: "neutral",
};
const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Inbox",
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  later: "Later",
  done: "Done",
  cancelled: "Cancelled",
};

export function TasksTab({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const qc = useQueryClient();
  const active = useBusinessStore((s) => s.active);
  const { active: businessKey } = useActiveBusiness();
  const [adding, setAdding] = useState(false);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["contacts", contactId, "tasks"],
    queryFn: () =>
      listTasks({
        reference_type: "contact",
        reference_id: contactId,
        limit: 100,
      }),
  });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      moveTask(id, status),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["contacts", contactId, "tasks"] }),
    onError: (e) => showToast.error("Could not update", errMsg(e)),
  });

  const list = tasks?.data ?? [];
  const open = list.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  );
  const done = list.filter(
    (t) => t.status === "done" || t.status === "cancelled",
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-brand-cloud">
          {open.length} open · {done.length} completed
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/tasks?reference_type=contact&reference_id=${contactId}`}
            className="inline-flex items-center gap-1.5 text-xs text-brand-smoke hover:text-brand-cream transition-colors"
          >
            Open in Tasks <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <Button
            variant="gold"
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setAdding(true)}
          >
            Assign task
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="w-6 h-6" />}
          title="No tasks yet"
          description={`Assign the first task related to ${contactName}.`}
          action={
            <Button
              variant="gold"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setAdding(true)}
            >
              Assign task
            </Button>
          }
        />
      ) : (
        <>
          <Section
            title="Open"
            tasks={open}
            onMove={(id, status) => move.mutate({ id, status })}
          />
          {done.length > 0 && (
            <Section
              title="Completed"
              tasks={done}
              onMove={(id, status) => move.mutate({ id, status })}
              muted
            />
          )}
        </>
      )}

      <AssignTaskModal
        open={adding}
        onClose={() => setAdding(false)}
        contactId={contactId}
        contactName={contactName}
        defaultBusiness={businessKey ?? active}
      />
    </div>
  );
}

function Section({
  title,
  tasks,
  onMove,
  muted,
}: {
  title: string;
  tasks: Task[];
  onMove: (id: string, status: TaskStatus) => void;
  muted?: boolean;
}) {
  return (
    <section>
      <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-3">
        {title}
      </h3>
      <div className="space-y-2">
        {tasks.map((t) => (
          <TaskRow key={t.task_id} task={t} onMove={onMove} muted={muted} />
        ))}
      </div>
    </section>
  );
}

function TaskRow({
  task,
  onMove,
  muted,
}: {
  task: Task;
  onMove: (id: string, status: TaskStatus) => void;
  muted?: boolean;
}) {
  return (
    <Card className={cn("p-3 sm:p-4", muted && "opacity-60")}>
      <div className="flex items-center gap-3">
        <button
          onClick={() =>
            onMove(task.task_id, task.status === "done" ? "today" : "done")
          }
          className={cn(
            "shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors",
            task.status === "done"
              ? "bg-accent2 border-accent2 text-brand-black"
              : "border-brand-smoke hover:border-brand-accent",
          )}
          aria-label={task.status === "done" ? "Reopen" : "Mark done"}
        >
          {task.status === "done" && <CheckSquare className="w-3 h-3" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "text-sm",
                task.status === "done" && "line-through text-brand-smoke",
                task.status !== "done" && "text-brand-cream",
              )}
            >
              {task.title}
            </span>
            <Badge tone={PRIORITY_TONE[task.priority]} size="xs">
              {task.priority}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[0.65rem] text-brand-smoke mt-1">
            {task.due_at && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {fmtDate(task.due_at)}
              </span>
            )}
            {task.assigned_to_name && <span>· {task.assigned_to_name}</span>}
            <span>· {fmtRelative(task.updated_at)}</span>
          </div>
        </div>
        <div className="relative">
          <select
            value={task.status}
            onChange={(e) => onMove(task.task_id, e.target.value as TaskStatus)}
            className="appearance-none bg-brand-graphite text-brand-cream text-[0.65rem] uppercase tracking-wide font-semibold pl-3 pr-7 py-1.5 rounded-lg border border-brand-graphite focus:outline-none focus:border-brand-accent"
          >
            {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-brand-smoke pointer-events-none" />
        </div>
      </div>
    </Card>
  );
}

function AssignTaskModal({
  open,
  onClose,
  contactId,
  contactName,
  defaultBusiness,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  defaultBusiness: string | null;
}) {
  const qc = useQueryClient();
  const { active: fallbackBiz } = useActiveBusiness();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TaskCreateValues>({
    resolver: zodResolver(taskCreateSchema),
    defaultValues: {
      business: defaultBusiness ?? fallbackBiz ?? "",
      title: "",
      description: "",
      status: "inbox",
      priority: "normal",
      assigned_to: "",
      due_at: "",
      reference_type: "contact",
      reference_id: contactId,
    },
  });

  const mutation = useMutation({
    mutationFn: (v: TaskCreateValues) => {
      if (!v.business) {
        return Promise.reject(
          new Error(
            "No active business context. Please select a business first.",
          ),
        );
      }
      return createTask({
        ...v,
        description: v.description || undefined,
        assigned_to: v.assigned_to || undefined,
        due_at: v.due_at ? new Date(v.due_at).toISOString() : undefined,
      } as Partial<Task>);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", contactId, "tasks"] });
      showToast.success("Task assigned");
      reset();
      onClose();
    },
    onError: (e) => showToast.error("Could not create", errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      surface="light"
      size="md"
      title="Assign task"
      description={`Linked to ${contactName}`}
      footer={
        <>
          <Button
            variant="outline-light"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            onClick={handleSubmit((v) => mutation.mutate(v))}
          >
            Assign task
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
      >
        <Input
          {...register("title")}
          label="Title"
          placeholder="Call to confirm pickup time…"
          error={errors.title?.message}
        />
        <Textarea
          {...register("description")}
          label="Description (optional)"
          hint="Any context useful for whoever picks this up"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            {...register("priority")}
            label="Priority"
            options={TASK_PRIORITIES.map((p) => ({
              value: p,
              label: p.charAt(0).toUpperCase() + p.slice(1),
            }))}
          />
          <Input
            {...register("due_at")}
            type="datetime-local"
            label="Due (optional)"
          />
        </div>
      </form>
    </Modal>
  );
}
