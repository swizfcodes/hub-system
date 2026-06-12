import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { NumberField } from "@components/ui/NumberField";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import {
  adjustmentSchema,
  ADJUSTMENT_TYPES,
  type AdjustmentValues,
} from "@lib/schemas/stock";
import { createAdjustment } from "@services/stock/adjustments";
import { listLocations } from "@services/catalogue/locations";
import { getOnHand } from "@services/stock/onHand";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { ProductSelectField } from "@components/shared/CatalogueSearchInput";

interface Props {
  open: boolean;
  onClose: () => void;
  productId?: string;
  locationId?: string;
}

const TYPE_LABELS: Record<(typeof ADJUSTMENT_TYPES)[number], string> = {
  count: "Count correction",
  write_off: "Write-off (lost / shrinkage)",
  damage: "Damaged",
  found: "Found (system under-counted)",
  correction: "Other correction",
};

export function AdjustmentModal({
  open,
  onClose,
  productId,
  locationId,
}: Props) {
  const qc = useQueryClient();
  const { data: locations = [] } = useQuery({
    queryKey: ["catalogue", "locations"],
    queryFn: () => listLocations(false),
  });

  const form = useForm<AdjustmentValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      product_id: productId ?? "",
      location_id: locationId ?? "",
      adjustment_type: "count",
      quantity_before: 0,
      quantity_after: 0,
      reason: "",
    },
  });
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

  const pid = watch("product_id");
  const type = watch("adjustment_type");
  const before = watch("quantity_before");
  const after = watch("quantity_after");
  const delta = (after || 0) - (before || 0);

  // Auto-load current on-hand into quantity_before when product chosen
  useQuery({
    queryKey: ["stock", "on-hand", pid],
    queryFn: async () => {
      if (!pid) return null;
      const r = await getOnHand(pid);
      if (r) {
        setValue("quantity_before", r.on_hand);
        setValue("quantity_after", r.on_hand);
      }
      return r;
    },
    enabled: !!pid,
  });

  const mutation = useMutation({
    mutationFn: (v: AdjustmentValues) => createAdjustment(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      showToast.success("Adjustment recorded", "Audit trail logged.");
      reset();
      onClose();
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
      title="Record adjustment"
      description="Reconcile a count or document loss/damage. Above-threshold adjustments may require approval."
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
            Record adjustment
          </Button>
        </>
      }
    >
      <form className="space-y-4">
        <Controller
          control={control}
          name="product_id"
          render={({ field, fieldState }) => (
            <ProductSelectField
              surface="dark"
              currency="NGN"
              label="Product"
              value={field.value}
              onChange={field.onChange}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="location_id"
          render={({ field }) => (
            <Select
              {...field}
              label="Location"
              placeholder="Pick a location"
              options={locations.map((l) => ({
                value: l.location_id,
                label: l.name,
              }))}
              error={errors.location_id?.message}
            />
          )}
        />
        <Select
          {...register("adjustment_type")}
          label="Adjustment type"
          options={ADJUSTMENT_TYPES.map((t) => ({
            value: t,
            label: TYPE_LABELS[t],
          }))}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Controller
            control={control}
            name="quantity_before"
            render={({ field, fieldState }) => (
              <NumberField
                surface="light"
                label="System count"
                placeholder="0"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="quantity_after"
            render={({ field, fieldState }) => (
              <NumberField
                surface="light"
                label="Actual count"
                placeholder="0"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <div className="flex items-end">
            <div
              className={`w-full rounded-xl py-3.5 px-4 text-sm font-mono text-center border ${delta < 0 ? "bg-state-danger/10 text-state-danger border-state-danger/30" : delta > 0 ? "bg-accent2/10 text-accent2 border-accent2/30" : "bg-brand-cream border-brand-cloud/40 text-brand-black/70"}`}
            >
              {delta > 0 ? "+" : ""}
              {delta}
            </div>
          </div>
        </div>

        {(type === "write_off" || type === "damage") && (
          <div className="rounded-xl bg-state-warn/[0.08] border border-state-warn/30 p-3 flex items-start gap-2 text-xs text-brand-black/80">
            <AlertTriangle className="w-3.5 h-3.5 text-state-warn mt-0.5 shrink-0" />
            <p>
              <strong>Write-offs and damage</strong> may require approval above
              the per-business threshold. The audit log records the request
              either way.
            </p>
          </div>
        )}

        <Textarea
          {...register("reason")}
          label="Reason"
          rows={3}
          placeholder="What happened? Be specific — auditors and managers read this."
          error={errors.reason?.message}
        />

        {delta !== 0 && (
          <div className="text-[0.65rem] text-text-on-light-muted flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" />A{" "}
            <code className="font-mono">stock_movements</code> entry of type{" "}
            <code className="font-mono">adjustment</code> will be created.
          </div>
        )}
      </form>
    </Modal>
  );
}
