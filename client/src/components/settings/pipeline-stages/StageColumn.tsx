import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Check, XCircle } from "lucide-react";
import type { PipelineStage } from "@typedefs/settings";
import { Input } from "@components/ui/Input";
import { Switch } from "@components/ui/Switch";
import { STAGE_SWATCHES } from "@lib/constants/palettes";
import { cn } from "@lib/cn";

interface Props {
  stage: PipelineStage;
  onUpdate: (patch: Partial<PipelineStage>) => void;
  onDelete: () => void;
}

export function StageColumn({ stage, onUpdate, onDelete }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.stage_id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-2xl border bg-brand-charcoal border-brand-graphite min-w-[240px] max-w-[260px] flex-shrink-0 overflow-hidden transition-all",
        isDragging && "opacity-50 ring-2 ring-brand-accent",
      )}
    >
      {/* Coloured header */}
      <div className="h-1.5" style={{ background: stage.colour }} />

      <div className="p-3 space-y-3">
        {/* Drag handle row */}
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 text-brand-smoke hover:text-brand-cream"
            aria-label="Reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <span className="text-[0.6rem] tracking-widest uppercase text-brand-smoke flex-1">
            Stage {stage.display_order + 1}
          </span>
          <button
            onClick={onDelete}
            className="p-1 text-brand-smoke hover:text-state-danger transition-colors"
            aria-label="Delete stage"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Label */}
        <Input
          surface="dark"
          value={stage.stage_label}
          onChange={(e) => onUpdate({ stage_label: e.target.value })}
          className="font-semibold text-base"
        />

        {/* Colour swatches */}
        <div>
          <div className="text-[0.6rem] tracking-widest uppercase text-brand-smoke mb-1.5">
            Colour
          </div>
          <div className="flex gap-1 flex-wrap">
            {STAGE_SWATCHES.map((sw) => (
              <button
                key={sw.hex}
                type="button"
                onClick={() => onUpdate({ colour: sw.hex })}
                className={cn(
                  "w-6 h-6 rounded transition-transform hover:scale-110",
                  stage.colour.toUpperCase() === sw.hex.toUpperCase() &&
                    "ring-2 ring-brand-cream ring-offset-1 ring-offset-brand-charcoal",
                )}
                style={{ background: sw.hex }}
                title={sw.name}
              />
            ))}
          </div>
        </div>

        {/* Terminal switches */}
        <div className="pt-1 space-y-2">
          <Switch
            surface="dark"
            checked={stage.is_terminal}
            onChange={(v) =>
              onUpdate({
                is_terminal: v,
                is_positive_terminal: v
                  ? (stage.is_positive_terminal ?? true)
                  : null,
              })
            }
            label="Terminal"
          />
          {stage.is_terminal && (
            <div className="ml-12 flex gap-2">
              <button
                onClick={() => onUpdate({ is_positive_terminal: true })}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[0.6rem] font-semibold uppercase tracking-wide transition-all",
                  stage.is_positive_terminal
                    ? "bg-accent2/20 text-accent2 border border-accent2/40"
                    : "bg-brand-graphite text-brand-smoke hover:text-brand-cream",
                )}
              >
                <Check className="w-3 h-3" /> Won
              </button>
              <button
                onClick={() => onUpdate({ is_positive_terminal: false })}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[0.6rem] font-semibold uppercase tracking-wide transition-all",
                  stage.is_positive_terminal === false
                    ? "bg-state-danger/20 text-state-danger border border-state-danger/40"
                    : "bg-brand-graphite text-brand-smoke hover:text-brand-cream",
                )}
              >
                <XCircle className="w-3 h-3" /> Lost
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
