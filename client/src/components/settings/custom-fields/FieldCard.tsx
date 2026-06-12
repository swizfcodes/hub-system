import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import {
  GripVertical,
  Pencil,
  Trash2,
  ChevronDown,
  X,
  Plus,
} from "lucide-react";
import type { CustomField, FieldType } from "@typedefs/settings";
import { Badge } from "@components/ui/Badge";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Switch } from "@components/ui/Switch";
import { Button } from "@components/ui/Button";
import { FIELD_TYPES } from "@lib/schemas/customField";
import { cn } from "@lib/cn";

interface Props {
  field: CustomField;
  onUpdate: (patch: Partial<CustomField>) => void;
  onDelete: () => void;
}

export function FieldCard({ field, onUpdate, onDelete }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.field_id });
  const [expanded, setExpanded] = useState(false);
  const [optInput, setOptInput] = useState("");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const needsOptions =
    field.field_type === "select" || field.field_type === "multi_select";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-2xl border bg-brand-charcoal border-brand-graphite transition-all",
        isDragging && "opacity-50 ring-2 ring-brand-accent",
      )}
    >
      <div className="p-3 sm:p-4 flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-brand-smoke hover:text-brand-cream p-1"
          aria-label="Reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-brand-cream truncate">
              {field.field_label}
            </span>
            <Badge tone="neutral" size="xs">
              {field.field_type}
            </Badge>
            {field.is_required && (
              <Badge tone="rose" size="xs">
                required
              </Badge>
            )}
            {!field.is_active && (
              <Badge tone="danger" size="xs">
                archived
              </Badge>
            )}
          </div>
          <div className="text-[0.65rem] text-brand-smoke mt-0.5 font-mono">
            {field.field_key}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-2 text-brand-smoke hover:text-brand-cream transition-colors"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <X className="w-4 h-4" />
          ) : (
            <Pencil className="w-4 h-4" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-brand-graphite space-y-4 animate-slide-down">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              surface="dark"
              label="Label"
              value={field.field_label}
              onChange={(e) => onUpdate({ field_label: e.target.value })}
            />
            <Select
              surface="dark"
              label="Type"
              value={field.field_type}
              onChange={(e) =>
                onUpdate({
                  field_type: e.target.value as FieldType,
                  options: ["select", "multi_select"].includes(e.target.value)
                    ? field.options
                    : [],
                })
              }
              options={FIELD_TYPES.map((t) => ({
                value: t,
                label: t.replace("_", " "),
              }))}
            />
          </div>
          <Switch
            surface="dark"
            checked={field.is_required}
            onChange={(v) => onUpdate({ is_required: v })}
            label="Required"
            description="Staff must fill this in to save the record"
          />

          {needsOptions && (
            <div className="space-y-2">
              <div className="text-[0.65rem] tracking-widest uppercase text-brand-smoke">
                Options
              </div>
              <div className="flex flex-wrap gap-1.5">
                {field.options.map((opt, i) => (
                  <span
                    key={`${opt}-${i}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-brand-graphite text-brand-cream border border-brand-graphite"
                  >
                    {opt}
                    <button
                      onClick={() =>
                        onUpdate({
                          options: field.options.filter((_, j) => j !== i),
                        })
                      }
                      className="hover:text-state-danger"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  surface="dark"
                  placeholder="Add option…"
                  value={optInput}
                  onChange={(e) => setOptInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && optInput.trim()) {
                      onUpdate({
                        options: [...field.options, optInput.trim()],
                      });
                      setOptInput("");
                    }
                  }}
                />
                <Button
                  variant="secondary"
                  size="md"
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => {
                    if (optInput.trim()) {
                      onUpdate({
                        options: [...field.options, optInput.trim()],
                      });
                      setOptInput("");
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ChevronDown className="w-3.5 h-3.5" />}
              onClick={() => setExpanded(false)}
            >
              Done
            </Button>
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={onDelete}
            >
              Delete field
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
