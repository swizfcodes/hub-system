import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Package, CornerUpLeft, Check } from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Textarea } from "@components/ui/Textarea";
import { Badge } from "@components/ui/Badge";
import { Checkbox } from "@components/ui/Checkbox";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { listAssets, issueAsset, returnAsset } from "@services/contacts/staff";
import { assetSchema, type AssetValues } from "@lib/schemas/staff";
import { fmtDate } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

export function AssetsTab({ profileId }: { profileId: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [includeReturned, setIncludeReturned] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["staff", profileId, "assets", { includeReturned }],
    queryFn: () => listAssets(profileId, includeReturned),
  });

  const returnMut = useMutation({
    mutationFn: (assetId: string) => returnAsset(assetId, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff", profileId, "assets"] });
      showToast.success("Asset marked returned");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Checkbox
          surface="dark"
          checked={includeReturned}
          onChange={setIncludeReturned}
          label="Show returned assets"
        />
        <Button
          variant="gold"
          size="sm"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setAdding(true)}
        >
          Issue asset
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
          icon={<Package className="w-6 h-6" />}
          title="No issued assets"
          description="Issue equipment (laptop, phone, keys, uniform)."
        />
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((a) => (
            <Card key={a.asset_id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent2/15 text-accent2 flex items-center justify-center shrink-0">
                <Package className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-brand-cream truncate">
                    {a.description}
                  </span>
                  <Badge tone="neutral" size="xs">
                    {a.asset_type}
                  </Badge>
                  {a.returned_date && (
                    <Badge tone="sage" size="xs">
                      <Check className="w-3 h-3" /> Returned
                    </Badge>
                  )}
                </div>
                <div className="text-[0.65rem] text-brand-smoke mt-1">
                  Issued {fmtDate(a.issued_date)}
                  {a.returned_date && ` · Returned ${fmtDate(a.returned_date)}`}
                  {a.serial_number && ` · S/N ${a.serial_number}`}
                </div>
              </div>
              {!a.returned_date && (
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<CornerUpLeft className="w-3.5 h-3.5" />}
                  onClick={() => returnMut.mutate(a.asset_id)}
                  loading={returnMut.isPending}
                >
                  Mark returned
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <IssueAssetModal
        open={adding}
        onClose={() => setAdding(false)}
        profileId={profileId}
        onCreated={() =>
          qc.invalidateQueries({ queryKey: ["staff", profileId, "assets"] })
        }
      />
    </div>
  );
}

function IssueAssetModal({
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
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AssetValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      asset_type: "laptop",
      description: "",
      serial_number: "",
      issued_date: new Date().toISOString().slice(0, 10),
    },
  });

  const mutation = useMutation({
    mutationFn: (v: AssetValues) =>
      issueAsset(profileId, {
        ...v,
        serial_number: v.serial_number || undefined,
        notes: v.notes || undefined,
      }),
    onSuccess: () => {
      showToast.success("Asset issued");
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
      size="md"
      title="Issue asset"
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
            Issue
          </Button>
        </>
      }
    >
      <form className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            {...register("asset_type")}
            label="Type"
            placeholder="laptop · phone · keys · uniform"
            error={errors.asset_type?.message}
          />
          <Input
            {...register("issued_date")}
            type="date"
            label="Issued date"
            error={errors.issued_date?.message}
          />
        </div>
        <Input
          {...register("description")}
          label="Description"
          placeholder='MacBook Air M2 13"'
          error={errors.description?.message}
        />
        <Input
          {...register("serial_number")}
          label="Serial number (optional)"
        />
        <Input
          {...register("condition_on_issue")}
          label="Condition (optional)"
          placeholder="Brand new · slight scratch on lid"
        />
        <Textarea {...register("notes")} label="Notes (optional)" />
      </form>
    </Modal>
  );
}
