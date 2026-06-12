import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pin, Plus, StickyNote } from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Textarea } from "@components/ui/Textarea";
import { Switch } from "@components/ui/Switch";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { listNotes, addNote } from "@services/crm/notes";
import { dealNoteSchema, type DealNoteValues } from "@lib/schemas/deal";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtRelative } from "@lib/format";
import { cn } from "@lib/cn";

export function DealNotes({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: notes, isLoading } = useQuery({
    queryKey: ["crm", "notes", dealId],
    queryFn: () => listNotes(dealId),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent inline-flex items-center gap-2">
          <StickyNote className="w-3.5 h-3.5" /> Notes
        </h3>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setAdding(true)}
        >
          Add note
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (notes ?? []).length === 0 ? (
        <EmptyState
          icon={<StickyNote className="w-6 h-6" />}
          title="No notes"
          description="Capture context that doesn't fit anywhere else."
        />
      ) : (
        <div className="space-y-2">
          {(notes ?? []).map((n) => (
            <Card
              key={n.note_id}
              className={cn(
                "p-3",
                n.is_pinned && "border-brand-accent/40 bg-brand-accent/[0.04]",
              )}
            >
              {n.is_pinned && (
                <div className="inline-flex items-center gap-1 text-[0.55rem] uppercase tracking-widest text-brand-accent mb-1.5">
                  <Pin className="w-2.5 h-2.5" /> Pinned
                </div>
              )}
              <p className="text-sm text-brand-cream whitespace-pre-line">
                {n.content}
              </p>
              <div className="text-[0.6rem] text-brand-smoke mt-2">
                {n.created_by_email ?? "Staff"} · {fmtRelative(n.created_at)}
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddNoteModal
        open={adding}
        onClose={() => setAdding(false)}
        dealId={dealId}
        onAdded={() =>
          qc.invalidateQueries({ queryKey: ["crm", "notes", dealId] })
        }
      />
    </div>
  );
}

function AddNoteModal({
  open,
  onClose,
  dealId,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  dealId: string;
  onAdded: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DealNoteValues>({
    resolver: zodResolver(dealNoteSchema),
    defaultValues: { content: "", is_pinned: false },
  });
  const isPinned = watch("is_pinned");

  const mutation = useMutation({
    mutationFn: (v: DealNoteValues) => addNote(dealId, v),
    onSuccess: () => {
      showToast.success("Note added");
      reset();
      onClose();
      onAdded();
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
      title="Add note"
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
            Save note
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Textarea
          {...register("content")}
          rows={6}
          placeholder="What should the team know?"
          error={errors.content?.message}
          autoFocus
        />
        <div className="p-3 rounded-xl bg-brand-cream/40 border border-brand-cloud/40">
          <Switch
            surface="light"
            checked={!!isPinned}
            onChange={(v) => setValue("is_pinned", v)}
            label="Pin to top"
            description="Pinned notes stay at the top of the deal — use for must-know context."
          />
        </div>
      </div>
    </Modal>
  );
}
