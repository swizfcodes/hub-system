import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { Skeleton } from "@components/ui/Skeleton";
import { DealCard } from "./DealCard";
import { moveDealStage } from "@services/crm/deals";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtMoney } from "@lib/format";
import type { PipelineStageWithDeals } from "@typedefs/crm";
import { cn } from "@lib/cn";

interface Props {
  pipeline?: PipelineStageWithDeals[];
  loading?: boolean;
  onNewDeal: (initialStage?: string) => void;
}

export function PipelineBoard({ pipeline, loading, onNewDeal }: Props) {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      moveDealStage(id, stage),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
    onError: (e) => showToast.error("Could not move", errMsg(e)),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const dealId = String(active.id);
    const newStage = String(over.id);
    const fromStage = (pipeline ?? []).find((s) =>
      s.deals.some((d) => d.deal_id === dealId),
    )?.stage_key;
    if (fromStage === newStage) return;
    move.mutate({ id: dealId, stage: newStage });
  };

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-96 w-72 flex-shrink-0" />
        ))}
      </div>
    );
  }

  const allDeals = (pipeline ?? []).flatMap((s) => s.deals);
  const draggingDeal = allDeals.find((d) => d.deal_id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar">
        {(pipeline ?? []).map((stage) => (
          <Column key={stage.stage_key} stage={stage} onNewDeal={onNewDeal} />
        ))}
      </div>
      <DragOverlay>
        {draggingDeal ? (
          <DealCard deal={draggingDeal} dragging className="w-72" />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  stage,
  onNewDeal,
}: {
  stage: PipelineStageWithDeals;
  onNewDeal: (s?: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.stage_key });
  const count = stage.deals.length;
  return (
    <div className="w-72 shrink-0 flex flex-col rounded-2xl bg-brand-charcoal/40 border border-brand-graphite overflow-hidden">
      <div className="h-1" style={{ background: stage.colour }} />
      <div className="px-3 py-2.5 flex items-center justify-between gap-2 border-b border-brand-graphite/70">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-brand-cream uppercase tracking-wide truncate">
            {stage.stage_label}
          </span>
          <span className="text-[0.6rem] text-brand-smoke">{count}</span>
        </div>
        <span className="text-[0.6rem] font-mono text-brand-accent">
          {fmtMoney(stage.total_value, "NGN")}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 p-2 space-y-2 min-h-[200px] overflow-y-auto transition-colors",
          isOver && "bg-brand-accent/[0.05]",
        )}
      >
        {stage.deals.map((deal) => (
          <DraggableDealCard key={deal.deal_id} deal={deal} />
        ))}
        {count === 0 && !isOver && (
          <div className="text-center py-8 text-[0.65rem] text-brand-smoke italic">
            No deals
          </div>
        )}
      </div>

      <button
        onClick={() => onNewDeal(stage.stage_key)}
        className="w-full px-3 py-2 text-[0.65rem] uppercase tracking-widest font-semibold text-brand-smoke hover:text-brand-accent hover:bg-brand-charcoal/60 border-t border-brand-graphite/70 inline-flex items-center justify-center gap-1.5 transition-colors"
      >
        <Plus className="w-3 h-3" /> Add to {stage.stage_label}
      </button>
    </div>
  );
}

function DraggableDealCard({
  deal,
}: {
  deal: PipelineStageWithDeals["deals"][number];
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.deal_id,
  });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}>
      <DealCard deal={deal} dragging={isDragging} />
    </div>
  );
}
