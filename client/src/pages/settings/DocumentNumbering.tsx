import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Hash, RotateCcw, AlertTriangle } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Card } from "@components/ui/Card";
import { Modal } from "@components/ui/Modal";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { Textarea } from "@components/ui/Textarea";
import {
  listDocumentSequences,
  upsertDocumentSequence,
  updateDocumentSequence,
} from "@services/settings/documentSequences";
import { useBusinessStore } from "@stores/useBusinessStore";
import {
  documentSequenceSchema,
  resetSequenceSchema,
  type DocumentSequenceValues,
  type ResetSequenceValues,
} from "@lib/schemas/documentSequence";
import { previewSeq } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { DocumentSequence } from "@typedefs/settings";

export default function DocumentNumbering() {
  const qc = useQueryClient();
  const active = useBusinessStore((s) => s.active);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<DocumentSequence | null>(null);

  const { data: seqs = [], isLoading } = useQuery({
    queryKey: ["settings", "document-sequences", { business: active }],
    queryFn: () => listDocumentSequences(active ?? undefined),
    enabled: !!active,
  });

  return (
    <>
      <Topbar
        title="Document Numbering"
        subtitle={`Sequence prefixes · ${active ?? "—"}`}
      />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl mx-auto">
        <PageHeader
          title="Document Numbering"
          subtitle="Configure how documents are numbered — prefix, padding, and live previews. Resetting a sequence is audited as a sensitive action."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Settings", to: "/settings" },
            { label: "Document Numbering" },
          ]}
          actions={
            <Button
              variant="gold"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setAdding(true)}
              disabled={!active}
            >
              New Sequence
            </Button>
          }
        />

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : seqs.length === 0 ? (
          <EmptyState
            icon={<Hash className="w-7 h-7" />}
            title="No sequences"
            description={`Add a document numbering sequence for ${active ?? "this business"}.`}
            action={
              <Button
                variant="gold"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setAdding(true)}
              >
                Add sequence
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {seqs.map((s) => (
              <Card key={s.seq_id} className="p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs uppercase tracking-widest text-brand-smoke font-mono">
                    {s.document_type}
                  </span>
                  <button
                    onClick={() => setResetting(s)}
                    className="text-brand-smoke hover:text-state-warn transition-colors"
                    aria-label="Reset sequence"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
                <div className="font-display text-3xl text-brand-cream mb-1 tabular-nums">
                  {previewSeq(s.prefix, s.next_number, s.padding)}
                </div>
                <div className="text-xs text-brand-smoke mb-4">
                  Next number:{" "}
                  <span className="text-brand-cream font-mono">
                    {s.next_number}
                  </span>
                </div>
                <SeqEditor seq={s} />
              </Card>
            ))}
          </div>
        )}
      </div>

      <AddSequenceModal
        open={adding}
        onClose={() => setAdding(false)}
        business={active ?? ""}
        existingTypes={seqs.map((s) => s.document_type)}
        onCreated={() =>
          qc.invalidateQueries({ queryKey: ["settings", "document-sequences"] })
        }
      />

      <ResetSequenceModal
        seq={resetting}
        onClose={() => setResetting(null)}
        onReset={() =>
          qc.invalidateQueries({ queryKey: ["settings", "document-sequences"] })
        }
      />
    </>
  );
}

function SeqEditor({ seq }: { seq: DocumentSequence }) {
  const qc = useQueryClient();
  const [prefix, setPrefix] = useState(seq.prefix);
  const [padding, setPadding] = useState(seq.padding);

  const mutation = useMutation({
    mutationFn: () => updateDocumentSequence(seq.seq_id, { prefix, padding }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "document-sequences"] });
      showToast.success("Sequence updated");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  const dirty = prefix !== seq.prefix || padding !== seq.padding;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          surface="dark"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          label="Prefix"
        />
        <Input
          surface="dark"
          type="number"
          min={1}
          max={10}
          value={padding}
          onChange={(e) => setPadding(parseInt(e.target.value) || 4)}
          label="Padding"
        />
      </div>
      <div className="text-[0.65rem] text-brand-smoke font-mono">
        Preview:{" "}
        <span className="text-brand-accent">
          {previewSeq(prefix, seq.next_number, padding)}
        </span>
      </div>
      {dirty && (
        <Button
          variant="gold"
          size="sm"
          fullWidth
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Save changes
        </Button>
      )}
    </div>
  );
}

function AddSequenceModal({
  open,
  onClose,
  business,
  existingTypes,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  business: string;
  existingTypes: string[];
  onCreated: () => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<DocumentSequenceValues>({
    resolver: zodResolver(documentSequenceSchema),
    defaultValues: {
      business,
      document_type: "",
      prefix: "",
      next_number: 1,
      padding: 4,
    },
  });
  const docType = watch("document_type");
  const conflict = existingTypes.includes(docType);

  const mutation = useMutation({
    mutationFn: (v: DocumentSequenceValues) => upsertDocumentSequence(v),
    onSuccess: () => {
      showToast.success("Sequence created");
      reset();
      onClose();
      onCreated();
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      surface="light"
      size="sm"
      title="New document sequence"
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
            disabled={conflict}
            onClick={handleSubmit((v) => mutation.mutate(v))}
          >
            Create
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
      >
        <Input
          {...register("document_type")}
          label="Document type"
          placeholder="e.g. invoice"
          hint="Lowercase, e.g. invoice, purchase_order, payslip"
          error={
            conflict
              ? "A sequence for this type already exists"
              : errors.document_type?.message
          }
        />
        <Input
          {...register("prefix")}
          label="Prefix"
          placeholder="JWL-INV"
          error={errors.prefix?.message}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            {...register("next_number", { valueAsNumber: true })}
            type="number"
            label="Start at"
          />
          <Input
            {...register("padding", { valueAsNumber: true })}
            type="number"
            label="Padding"
            hint="0001 = 4"
          />
        </div>
      </form>
    </Modal>
  );
}

function ResetSequenceModal({
  seq,
  onClose,
  onReset,
}: {
  seq: DocumentSequence | null;
  onClose: () => void;
  onReset: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ResetSequenceValues>({
    resolver: zodResolver(resetSequenceSchema),
    defaultValues: { next_number: 1, reset_reason: "" },
  });

  const mutation = useMutation({
    mutationFn: (v: ResetSequenceValues) =>
      updateDocumentSequence(seq!.seq_id, v),
    onSuccess: () => {
      showToast.success("Sequence reset", "Reason recorded in audit log.");
      reset();
      onClose();
      onReset();
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  if (!seq) return null;

  return (
    <Modal
      open={!!seq}
      onClose={() => {
        reset();
        onClose();
      }}
      surface="light"
      size="md"
      title={
        <span className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-state-warn/15 text-state-warn flex items-center justify-center">
            <AlertTriangle className="w-4 h-4" />
          </span>
          Reset “{seq.document_type}” sequence
        </span>
      }
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
            variant="danger"
            loading={mutation.isPending}
            onClick={handleSubmit((v) => mutation.mutate(v))}
          >
            Reset sequence
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-brand-black/80">
        <p>
          This will set the next number to the value you provide. This is a
          sensitive action — the reason will be recorded in the audit log.
        </p>
        <div className="rounded-lg p-3 bg-state-warn/[0.08] border border-state-warn/30 text-xs">
          Current: next number is{" "}
          <span className="font-mono font-bold">{seq.next_number}</span>. The
          next document would be{" "}
          <span className="font-mono font-bold">
            {previewSeq(seq.prefix, seq.next_number, seq.padding)}
          </span>
          .
        </div>
        <Input
          {...register("next_number", { valueAsNumber: true })}
          type="number"
          min={1}
          label="New next number"
          error={errors.next_number?.message}
        />
        <Textarea
          {...register("reset_reason")}
          label="Reason for reset"
          placeholder="e.g. End-of-year roll-over for FY2027"
          error={errors.reset_reason?.message}
        />
      </div>
    </Modal>
  );
}
