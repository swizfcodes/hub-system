import { Switch } from "@components/ui/Switch";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, ListChecks } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Tabs } from "@components/ui/Tabs";
import { Modal } from "@components/ui/Modal";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { FieldCard } from "@components/settings/custom-fields/FieldCard";
import { FieldPreview } from "@components/settings/custom-fields/FieldPreview";
import {
  listCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
} from "@services/settings/customFields";
import { useBusinessStore } from "@stores/useBusinessStore";
import { ENTITY_TYPES } from "@lib/schemas/customField";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { CustomField, EntityType } from "@typedefs/settings";

const ENTITY_LABELS: Record<EntityType, string> = {
  product: "Products",
  contact: "Contacts",
  supplier: "Suppliers",
  retail_partner: "Retail Partners",
  deal: "Deals",
  invoice: "Invoices",
};

export default function CustomFields() {
  const qc = useQueryClient();
  const active = useBusinessStore((s) => s.active);
  const [entity, setEntity] = useState<EntityType>("product");
  const [adding, setAdding] = useState(false);

  const { data: fields = [], isLoading } = useQuery({
    queryKey: [
      "settings",
      "custom-fields",
      { business: active, entity_type: entity },
    ],
    queryFn: () =>
      listCustomFields({
        business: active ?? undefined,
        entity_type: entity,
        activeOnly: false,
      }),
    enabled: !!active,
  });

  const sortedFields = [...fields].sort(
    (a, b) => a.display_order - b.display_order,
  );

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CustomField> }) =>
      updateCustomField(id, patch),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["settings", "custom-fields"] }),
    onError: (e) => showToast.error("Update failed", errMsg(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteCustomField(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "custom-fields"] });
      showToast.success("Field archived");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  const create = useMutation({
    mutationFn: (payload: Partial<CustomField>) => createCustomField(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "custom-fields"] });
      showToast.success("Field added");
      setAdding(false);
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const oldIndex = sortedFields.findIndex((f) => f.field_id === a.id);
    const newIndex = sortedFields.findIndex((f) => f.field_id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(sortedFields, oldIndex, newIndex);
    // Optimistic: update display_order for each
    reordered.forEach((f, i) => {
      if (f.display_order !== i)
        update.mutate({ id: f.field_id, patch: { display_order: i } });
    });
  };

  return (
    <>
      <Topbar
        title="Custom Fields"
        subtitle={`Per-entity custom fields · ${active ?? "—"}`}
      />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-7xl mx-auto">
        <PageHeader
          title="Custom Fields"
          subtitle="Add bespoke fields to any entity type. Drag to reorder. The live preview on the right shows what staff will see."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Settings", to: "/settings" },
            { label: "Custom Fields" },
          ]}
          actions={
            <Button
              variant="gold"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setAdding(true)}
              disabled={!active}
            >
              Add Field
            </Button>
          }
        />

        <Tabs
          tabs={ENTITY_TYPES.map((e) => ({ key: e, label: ENTITY_LABELS[e] }))}
          active={entity}
          onChange={(k) => setEntity(k as EntityType)}
          className="mb-8"
        />

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Field cards (sortable) */}
          <div>
            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : sortedFields.length === 0 ? (
              <EmptyState
                icon={<ListChecks className="w-7 h-7" />}
                title={`No ${ENTITY_LABELS[entity].toLowerCase()} fields`}
                description={`Add the first custom field for ${ENTITY_LABELS[entity].toLowerCase()}.`}
                action={
                  <Button
                    variant="gold"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={() => setAdding(true)}
                  >
                    Add field
                  </Button>
                }
              />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortedFields.map((f) => f.field_id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {sortedFields.map((f) => (
                      <FieldCard
                        key={f.field_id}
                        field={f}
                        onUpdate={(patch) =>
                          update.mutate({ id: f.field_id, patch })
                        }
                        onDelete={() => del.mutate(f.field_id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Live preview */}
          <div className="lg:sticky lg:top-24 self-start">
            <FieldPreview
              fields={sortedFields.filter((f) => f.is_active)}
              entityLabel={ENTITY_LABELS[entity]}
            />
          </div>
        </div>
      </div>

      <AddFieldModal
        open={adding}
        onClose={() => setAdding(false)}
        entity={entity}
        business={active ?? ""}
        existingFieldKeys={fields.map((f) => f.field_key)}
        nextOrder={sortedFields.length}
        onSubmit={(payload) => create.mutate(payload)}
        submitting={create.isPending}
      />
    </>
  );
}

function AddFieldModal({
  open,
  onClose,
  entity,
  business,
  existingFieldKeys,
  nextOrder,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  entity: EntityType;
  business: string;
  existingFieldKeys: string[];
  nextOrder: number;
  onSubmit: (p: Partial<CustomField>) => void;
  submitting: boolean;
}) {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [type, setType] = useState<CustomField["field_type"]>("text");
  const [required, setRequired] = useState(false);

  const autoKey = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\s]/g, "")
    .replace(/\s+/g, "_");
  const finalKey = key || autoKey;
  const conflict = existingFieldKeys.includes(finalKey);

  const reset = () => {
    setLabel("");
    setKey("");
    setType("text");
    setRequired(false);
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
      title="Add custom field"
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
                entity_type: entity,
                field_key: finalKey,
                field_label: label,
                field_type: type,
                is_required: required,
                display_order: nextOrder,
                options: [],
                visible_to_roles: [],
              });
              reset();
            }}
          >
            Add field
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Metal Type"
        />
        <Input
          label="Field key (auto)"
          value={key || autoKey}
          onChange={(e) => setKey(e.target.value)}
          hint={
            conflict
              ? "A field with this key already exists"
              : "Lowercase, letters/digits/underscores"
          }
          error={conflict ? "Duplicate field key" : undefined}
        />
        <div className="grid grid-cols-3 gap-2">
          {(
            ["text", "number", "decimal", "date", "boolean", "select"] as const
          ).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`p-3 rounded-xl border text-xs font-semibold uppercase tracking-wide transition-all ${type === t ? "bg-brand-black text-brand-cream border-brand-black" : "bg-white border-brand-cloud/40 text-brand-black/70 hover:border-brand-black/40"}`}
            >
              {t.replace("_", " ")}
            </button>
          ))}
        </div>
        <div className="p-3 rounded-xl bg-brand-cream/50 border border-brand-cloud/40">
          <Switch
            surface="light"
            checked={required}
            onChange={setRequired}
            label="Required field"
          />
        </div>
      </div>
    </Modal>
  );
}
