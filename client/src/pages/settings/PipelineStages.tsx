import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, Workflow } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Tabs } from "@components/ui/Tabs";
import { Modal } from "@components/ui/Modal";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { StageColumn } from "@components/settings/pipeline-stages/StageColumn";
import {
  listPipelineStages,
  createPipelineStage,
  updatePipelineStage,
  deletePipelineStage,
} from "@services/settings/pipelineStages";
import { useBusinessStore } from "@stores/useBusinessStore";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { PipelineStage } from "@typedefs/settings";

const PIPELINE_TYPES = ["crm", "sales"];

export default function PipelineStages() {
  const qc = useQueryClient();
  const active = useBusinessStore((s) => s.active);
  const [pipelineType, setPipelineType] = useState("crm");
  const [adding, setAdding] = useState(false);

  const { data: stages = [], isLoading } = useQuery({
    queryKey: [
      "settings",
      "pipeline-stages",
      { business: active, pipeline_type: pipelineType },
    ],
    queryFn: () =>
      listPipelineStages({
        business: active ?? undefined,
        pipeline_type: pipelineType,
      }),
    enabled: !!active,
  });

  const sorted = [...stages].sort((a, b) => a.display_order - b.display_order);

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<PipelineStage>;
    }) => updatePipelineStage(id, patch),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings", "pipeline-stages"] }),
    onError: (e) => showToast.error("Update failed", errMsg(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => deletePipelineStage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "pipeline-stages"] });
      showToast.success("Stage removed");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });
  const create = useMutation({
    mutationFn: (payload: Partial<PipelineStage>) =>
      createPipelineStage(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "pipeline-stages"] });
      showToast.success("Stage added");
      setAdding(false);
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  const sensors = useSensors(useSensor(PointerSensor));
  const handleDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const oldIndex = sorted.findIndex((s) => s.stage_id === a.id);
    const newIndex = sorted.findIndex((s) => s.stage_id === over.id);
    const reordered = arrayMove(sorted, oldIndex, newIndex);
    reordered.forEach((s, i) => {
      if (s.display_order !== i)
        update.mutate({ id: s.stage_id, patch: { display_order: i } });
    });
  };

  return (
    <>
      <Topbar
        title="Pipeline Stages"
        subtitle={`Pipeline definitions · ${active ?? "—"}`}
      />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-7xl mx-auto">
        <PageHeader
          title="Pipeline Stages"
          subtitle="Visual editor for the stages of each pipeline type. Drag to reorder — what staff see in the CRM will mirror this."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Settings", to: "/settings" },
            { label: "Pipeline Stages" },
          ]}
          actions={
            <Button
              variant="gold"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setAdding(true)}
              disabled={!active}
            >
              Add Stage
            </Button>
          }
        />

        <Tabs
          tabs={PIPELINE_TYPES.map((t) => ({ key: t, label: t.toUpperCase() }))}
          active={pipelineType}
          onChange={setPipelineType}
          className="mb-8"
        />

        {isLoading ? (
          <div className="flex gap-4 overflow-x-auto pb-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 w-60 flex-shrink-0" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<Workflow className="w-7 h-7" />}
            title="No stages yet"
            description="Add the first stage to build out this pipeline."
            action={
              <Button
                variant="gold"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setAdding(true)}
              >
                Add stage
              </Button>
            }
          />
        ) : (
          <div>
            <div className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-3">
              Kanban preview · drag to reorder
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sorted.map((s) => s.stage_id)}
                strategy={horizontalListSortingStrategy}
              >
                <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar">
                  {sorted.map((s) => (
                    <StageColumn
                      key={s.stage_id}
                      stage={s}
                      onUpdate={(p) =>
                        update.mutate({ id: s.stage_id, patch: p })
                      }
                      onDelete={() => del.mutate(s.stage_id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      <AddStageModal
        open={adding}
        onClose={() => setAdding(false)}
        business={active ?? ""}
        pipelineType={pipelineType}
        nextOrder={sorted.length}
        existingKeys={sorted.map((s) => s.stage_key)}
        onSubmit={(p) => create.mutate(p)}
        submitting={create.isPending}
      />
    </>
  );
}

function AddStageModal({
  open,
  onClose,
  business,
  pipelineType,
  nextOrder,
  existingKeys,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  business: string;
  pipelineType: string;
  nextOrder: number;
  existingKeys: string[];
  onSubmit: (p: Partial<PipelineStage>) => void;
  submitting: boolean;
}) {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [colour, setColour] = useState("#60A5FA");
  const autoKey = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\s]/g, "")
    .replace(/\s+/g, "_");
  const finalKey = key || autoKey;
  const conflict = existingKeys.includes(finalKey);

  const reset = () => {
    setLabel("");
    setKey("");
    setColour("#60A5FA");
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      surface="light"
      size="md"
      title="Add pipeline stage"
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
            loading={submitting}
            disabled={!label || conflict}
            onClick={() => {
              onSubmit({
                business,
                pipeline_type: pipelineType,
                stage_key: finalKey,
                stage_label: label,
                colour,
                display_order: nextOrder,
                is_terminal: false,
                is_positive_terminal: null,
              });
              reset();
            }}
          >
            Add stage
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Stage label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Offer Sent"
        />
        <Input
          label="Stage key (auto)"
          value={key || autoKey}
          onChange={(e) => setKey(e.target.value)}
          hint="Lowercase, letters/digits/underscores"
          error={conflict ? "Duplicate key" : undefined}
        />
        <div>
          <div className="text-[0.7rem] tracking-widest uppercase text-text-on-light-muted mb-2">
            Stage colour
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              "#94A3B8",
              "#60A5FA",
              "#FBBF24",
              "#F97316",
              "#34D399",
              "#F87171",
              "#A855F7",
              "#C9A86C",
            ].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColour(c)}
                className={`w-9 h-9 rounded-lg transition-transform hover:scale-110 ${colour === c ? "ring-2 ring-brand-black ring-offset-2 ring-offset-surface-light" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
