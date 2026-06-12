import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { NumberField } from "@components/ui/NumberField";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, FileSignature, Lock, Download } from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import {
  listContracts,
  addContract,
  openContractPdf,
} from "@services/contacts/staff";
import { contractSchema, type ContractValues } from "@lib/schemas/staff";
import { fmtDate, fmtMoney } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

export function ContractsTab({ profileId }: { profileId: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["staff", profileId, "contracts"],
    queryFn: () => listContracts(profileId),
  });

  // 403 from backend means the requester isn't self/HR — show locked state.
  const forbidden =
    (error as { response?: { status?: number } } | null)?.response?.status ===
    403;

  if (forbidden) {
    return (
      <EmptyState
        icon={<Lock className="w-6 h-6" />}
        title="Restricted"
        description="Contract history is visible only to HR and the staff member themselves."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent">
          Compensation history
        </h3>
        <Button
          variant="gold"
          size="sm"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setAdding(true)}
        >
          Add contract
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<FileSignature className="w-6 h-6" />}
          title="No contracts on file"
          description="Add the first contract."
        />
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((c) => (
            <Card key={c.contract_id} className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-accent/15 text-brand-accent flex items-center justify-center shrink-0">
                <FileSignature className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone="gold" size="xs">
                    {c.contract_type.replace("_", " ")}
                  </Badge>
                  <span className="text-sm font-mono text-brand-accent">
                    {fmtMoney(c.gross_salary, "NGN")}
                  </span>
                </div>
                <div className="text-[0.65rem] text-brand-smoke mt-1">
                  Effective {fmtDate(c.effective_from)}
                  {c.effective_to
                    ? ` — ${fmtDate(c.effective_to)}`
                    : " · current"}
                </div>
                {c.notes && (
                  <p className="text-xs text-brand-cloud mt-1.5 italic">
                    "{c.notes}"
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Download className="w-3.5 h-3.5" />}
                onClick={() =>
                  openContractPdf(profileId, c.contract_id).catch((e) =>
                    showToast.error("Could not open contract", errMsg(e)),
                  )
                }
              >
                PDF
              </Button>
            </Card>
          ))}
        </div>
      )}

      <AddContractModal
        open={adding}
        onClose={() => setAdding(false)}
        profileId={profileId}
        onCreated={() =>
          qc.invalidateQueries({ queryKey: ["staff", profileId, "contracts"] })
        }
      />
    </div>
  );
}

function AddContractModal({
  open,
  onClose,
  profileId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  profileId: string;
  onCreated: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContractValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      contract_type: "amendment",
      effective_from: new Date().toISOString().slice(0, 10),
      gross_salary: 0,
      notes: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (v: ContractValues) =>
      addContract(profileId, {
        ...v,
        effective_to: v.effective_to || undefined,
        notes: v.notes || undefined,
      }),
    onSuccess: () => {
      showToast.success("Contract added", "Audit log recorded.");
      reset();
      onClose();
      onCreated();
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
      title="Add contract"
      description="Append-only — adds a new history row. Updates base salary on the profile."
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
            Add contract
          </Button>
        </>
      }
    >
      <form className="space-y-4">
        <Select
          {...register("contract_type")}
          label="Type"
          options={[
            { value: "full_time", label: "Full time" },
            { value: "part_time", label: "Part time" },
            { value: "contract", label: "Contract" },
            { value: "amendment", label: "Amendment" },
          ]}
        />
        <Controller
          control={control}
          name="gross_salary"
          render={({ field, fieldState }) => (
            <NumberField
              decimal
              label="Gross salary (NGN)"
              placeholder="0.00"
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            {...register("effective_from")}
            type="date"
            label="Effective from"
            error={errors.effective_from?.message}
          />
          <Input
            {...register("effective_to")}
            type="date"
            label="Effective to (optional)"
          />
        </div>
        <Textarea {...register("notes")} label="Notes (optional)" />
      </form>
    </Modal>
  );
}
