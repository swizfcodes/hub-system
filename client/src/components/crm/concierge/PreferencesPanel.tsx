import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Heart, Edit2, Trash2, Sparkles } from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Textarea } from "@components/ui/Textarea";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import {
  listPreferences,
  upsertPreference,
  deletePreference,
} from "@services/crm/concierge";
import {
  preferenceSchema,
  type PreferenceValues,
} from "@lib/schemas/concierge";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { CustomerPreference } from "@typedefs/crm";

export function PreferencesPanel({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CustomerPreference | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["crm", "preferences", contactId],
    queryFn: () => listPreferences(contactId),
  });

  // Hide wishlist entries — they get their own panel
  const visible = (prefs ?? []).filter(
    (p) => !p.preference_key.startsWith("wishlist:"),
  );

  const remove = useMutation({
    mutationFn: (key: string) => deletePreference(contactId, key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm", "preferences", contactId] });
      showToast.success("Preference removed");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent inline-flex items-center gap-2">
          <Heart className="w-3.5 h-3.5" /> Concierge preferences
        </h3>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => {
            setEditing(null);
            setAdding(true);
          }}
        >
          Add preference
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="w-6 h-6" />}
          title="No preferences captured"
          description={`Note ${contactName}'s ring size, preferred metal, scent family, allergies — anything that makes the next interaction more personal.`}
          action={
            <Button
              variant="gold"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setAdding(true)}
            >
              Add the first one
            </Button>
          }
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {visible.map((p) => (
            <Card key={p.preference_id} className="p-3 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-accent3/15 text-accent3 flex items-center justify-center shrink-0">
                <Heart className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
                  {p.preference_key.replace(/_/g, " ")}
                </div>
                <div className="text-sm font-medium text-brand-cream truncate">
                  {p.preference_value}
                </div>
                {p.notes && (
                  <p className="text-[0.65rem] text-brand-cloud mt-0.5 italic line-clamp-2">
                    "{p.notes}"
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => {
                    setEditing(p);
                    setAdding(true);
                  }}
                  className="p-1 text-brand-smoke hover:text-brand-cream"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  onClick={() => remove.mutate(p.preference_key)}
                  className="p-1 text-brand-smoke hover:text-state-danger"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <PreferenceModal
        open={adding}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        contactId={contactId}
        editing={editing}
      />
    </div>
  );
}

function PreferenceModal({
  open,
  onClose,
  contactId,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  editing: CustomerPreference | null;
}) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PreferenceValues>({
    resolver: zodResolver(preferenceSchema),
    defaultValues: {
      preference_key: editing?.preference_key ?? "",
      preference_value: editing?.preference_value ?? "",
      notes: editing?.notes ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (v: PreferenceValues) =>
      upsertPreference(contactId, { ...v, notes: v.notes || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm", "preferences", contactId] });
      showToast.success("Preference saved");
      reset();
      onClose();
    },
    onError: (e) => showToast.error("Could not save", errMsg(e)),
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
      title={editing ? "Edit preference" : "Add preference"}
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
            loading={isSubmitting || mutation.isPending}
            onClick={handleSubmit((v) => mutation.mutate(v))}
          >
            Save
          </Button>
        </>
      }
    >
      <form className="space-y-4">
        <Input
          {...register("preference_key")}
          label="Key"
          placeholder="ring_size, preferred_metal, allergies, favourite_scent…"
          hint="Lowercase. Used internally. Reuse keys across contacts so you can compare."
          error={errors.preference_key?.message}
          disabled={!!editing}
        />
        <Input
          {...register("preference_value")}
          label="Value"
          placeholder="Size 7 · 18k Yellow Gold · Citrus, no musk"
          error={errors.preference_value?.message}
        />
        <Textarea
          {...register("notes")}
          label="Context (optional)"
          rows={3}
          placeholder="How you learned this, when, or how it should be applied"
        />
      </form>
    </Modal>
  );
}
