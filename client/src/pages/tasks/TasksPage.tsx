import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import {
  TaskCard,
  TaskFormModal,
  TaskDetailPanel,
} from "@components/tasks/TaskComponents";
import { getBoard, getTask, moveTask } from "@services/tasks";
import {
  TASK_STATUS_META,
  TASK_STATUS_COLUMNS,
} from "@lib/constants/schedulingConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";
import type { Task, TaskStatus } from "@typedefs/scheduling";
import { Topbar } from "@/components/shell/Topbar";

export default function TasksPage() {
  const { active: business } = useActiveBusiness();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  // Support deep-link filters from the contacts tab:
  //   /tasks?reference_type=contact&reference_id=UUID
  const filterRefType = searchParams.get("reference_type") ?? undefined;
  const filterRefId = searchParams.get("reference_id") ?? undefined;

  // Support notification deep-link: /tasks?task=:id — open that task's detail panel
  const taskFromUrl = searchParams.get("task") ?? null;

  const [showCreate, setShowCreate] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<TaskStatus>("inbox");
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(taskFromUrl);
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);

  const { data: board, isLoading } = useQuery({
    queryKey: ["task-board", business, filterRefType, filterRefId],
    queryFn: () =>
      getBoard({
        business: business!,
        reference_type: filterRefType,
        reference_id: filterRefId,
      }),
    enabled: !!business,
    refetchInterval: 30_000,
  });

  const { data: detailTask } = useQuery({
    queryKey: ["task", detailTaskId],
    queryFn: () => getTask(detailTaskId!),
    enabled: !!detailTaskId,
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      moveTask(id, status),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["task-board", business] }),
    onError: (err) => showToast.error(errMsg(err)),
  });

  // ── Drag-and-drop ─────────────────────────────────────────────────────────

  const draggedId = useRef<string | null>(null);

  function handleDragStart(e: React.DragEvent, taskId: string) {
    draggedId.current = taskId;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(status);
  }

  function handleDrop(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault();
    setDragOver(null);
    if (draggedId.current && draggedId.current) {
      moveMutation.mutate({ id: draggedId.current, status });
      draggedId.current = null;
    }
  }

  // ── Filter cards by search ────────────────────────────────────────────────

  function filterColumn(tasks: Task[]): Task[] {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.assigned_to_name?.toLowerCase().includes(q),
    );
  }

  const totalCount = TASK_STATUS_COLUMNS.reduce(
    (s, col) => s + (board?.[col]?.length ?? 0),
    0,
  );

  return (
    <>
      <Topbar title="Tasks" subtitle="To-Do" />
      <div className="flex h-screen flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-8 py-6 flex-shrink-0">
          <PageHeader
            title="Tasks"
            subtitle={`${totalCount} total tasks across all columns`}
            crumbs={[{ label: "Hub", to: "/" }, { label: "Tasks" }]}
            actions={
              <Button
                onClick={() => {
                  setDefaultStatus("inbox");
                  setShowCreate(true);
                }}
              >
                <Plus className="h-4 w-4" />
                New Task
              </Button>
            }
          />

          {/* Search */}
          <div className="mt-4 relative max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-smoke" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="w-full rounded-xl border border-white/10 bg-brand-charcoal py-2 pl-9 pr-4 text-sm text-brand-cream placeholder-brand-smoke/40 focus:border-brand-accent/40 focus:outline-none"
            />
          </div>
        </div>

        {/* Kanban board */}
        <div className="flex-1 overflow-x-auto px-4 sm:px-8 pb-8">
          {isLoading ? (
            <div className="flex gap-4">
              {TASK_STATUS_COLUMNS.map((col) => (
                <Skeleton
                  key={col}
                  className="h-64 w-64 rounded-2xl shrink-0"
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-4" style={{ minWidth: "max-content" }}>
              {TASK_STATUS_COLUMNS.map((col) => {
                const meta = TASK_STATUS_META[col];
                const tasks = filterColumn(board?.[col] ?? []);
                const isDragTarget = dragOver === col;

                return (
                  <div
                    key={col}
                    onDragOver={(e) => handleDragOver(e, col)}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => handleDrop(e, col)}
                    className={cn(
                      "flex flex-col rounded-2xl border transition-all",
                      "w-64 shrink-0",
                      isDragTarget
                        ? "border-brand-accent/40 bg-brand-accent/5"
                        : "border-white/5 bg-brand-charcoal",
                    )}
                  >
                    {/* Column header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
                          {meta.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-brand-smoke/60">
                          {tasks.length}
                        </span>
                        <button
                          onClick={() => {
                            setDefaultStatus(col);
                            setShowCreate(true);
                          }}
                          className="text-brand-smoke/40 hover:text-brand-accent transition-colors"
                          title={`Add to ${meta.label}`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Cards */}
                    <div
                      className="flex-1 overflow-y-auto p-3 space-y-2"
                      style={{ maxHeight: "calc(100vh - 260px)" }}
                    >
                      {tasks.map((task) => (
                        <TaskCard
                          key={task.task_id}
                          task={task}
                          onClick={(t) => setDetailTaskId(t.task_id)}
                          onDragStart={handleDragStart}
                        />
                      ))}
                      {tasks.length === 0 && (
                        <p className="text-center text-xs text-brand-smoke/30 py-4">
                          {search ? "No matches" : "Drop tasks here"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Task detail side panel */}
        {detailTask && (
          <div className="fixed inset-y-0 right-0 w-80 border-l border-white/5 bg-brand-black shadow-2xl overflow-y-auto z-30">
            <div className="p-5">
              <TaskDetailPanel
                task={detailTask}
                onEdit={() => {
                  setEditTask(detailTask);
                  setDetailTaskId(null);
                }}
                onClose={() => setDetailTaskId(null)}
              />
            </div>
          </div>
        )}

        {/* Modals */}
        <TaskFormModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          defaultStatus={defaultStatus}
          isManager={true}
        />
        {editTask && (
          <TaskFormModal
            open={!!editTask}
            onClose={() => setEditTask(null)}
            existing={editTask}
            isManager={true}
          />
        )}
      </div>
    </>
  );
}
