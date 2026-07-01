import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { NumberField } from "@components/ui/NumberField";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { manualExitSchema, type ManualExitValues } from "@lib/schemas/stock";
import { recordManualExit } from "@services/stock/movements";
import { listLocations } from "@services/catalogue/locations";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { ProductSelectField } from "@components/shared/CatalogueSearchInput";

interface Props {
  open: boolean;
  onClose: () => void;
  productId?: string;
  locationId?: string;
}

// Reasons a unit can leave a location without a sale. Keep the values in sync
// with the backend manual-exit route + VALID_MOVEMENT_TYPES.
const EXIT_TYPE_LABELS: Record<ManualExitValues["movement_type"], string> = {
  sample: "Sample",
  gift: "Gift",
  sent_to_consignment: "Send to consignment",
  write_off: "Write-off (lost / shrinkage)",
  damaged: "Damaged",
  returned_to_supplier: "Return to supplier",
};

// Types that book a value loss to the ledger (write-off journal).
const LOSS_TYPES = new Set<ManualExitValues["movement_type"]>([
  "write_off",
  "damaged",
]);

export function ManualExitModal({ open, onClose, productId, locationId }: Props) {
  const qc = useQueryClient();
  const { data: locations = [] } = useQuery({
    queryKey: ["catalogue", "locations"],
    queryFn: () => listLocations(false),
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ManualExitValues>({
    resolver: zodResolver(manualExitSchema),
    defaultValues: {
      product_id: productId ?? "",
      from_location_id: locationId ?? "",
      quantity: 1,
      movement_type: "write_off",
      reason: "",
      batch_id: "",
    },
  });

  const type = watch("movement_type");

  const mutation = useMutation({
    mutationFn: (v: ManualExitValues) => recordManualExit(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      showToast.success("Stock exit recorded", "Audit trail logged.");
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
      title="Manual stock exit"
      description="Remove units from a location for a non-sale reason — sample, gift, damage, write-off, consignment, or supplier return. Every exit is logged."
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
            Record exit
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

        <div className="grid gap-3 sm:grid-cols-2">
          <Controller
            control={control}
            name="from_location_id"
            render={({ field }) => (
              <Select
                {...field}
                label="From location"
                placeholder="Pick a location"
                options={locations.map((l) => ({
                  value: l.location_id,
                  label: l.name,
                }))}
                error={errors.from_location_id?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="quantity"
            render={({ field, fieldState }) => (
              <NumberField
                surface="light"
                label="Quantity"
                placeholder="0"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
        </div>

        <Select
          {...register("movement_type")}
          label="Reason type"
          options={(
            Object.keys(EXIT_TYPE_LABELS) as ManualExitValues["movement_type"][]
          ).map((t) => ({ value: t, label: EXIT_TYPE_LABELS[t] }))}
          error={errors.movement_type?.message}
        />

        {LOSS_TYPES.has(type) && (
          <div className="rounded-xl bg-state-warn/[0.08] border border-state-warn/30 p-3 flex items-start gap-2 text-xs text-brand-black/80">
            <AlertTriangle className="w-3.5 h-3.5 text-state-warn mt-0.5 shrink-0" />
            <p>
              <strong>Write-offs and damage</strong> post an inventory write-off
              journal (the stock value leaves your books).
            </p>
          </div>
        )}

        {(type === "sample" || type === "gift") && (
          <div className="rounded-xl bg-brand-cloud/20 border border-brand-cloud/40 p-3 flex items-start gap-2 text-xs text-brand-black/80">
            <Sparkles className="w-3.5 h-3.5 text-brand-black/50 mt-0.5 shrink-0" />
            <p>
              <strong>Samples and gifts</strong> are booked to Marketing &amp;
              Advertising — the stock value moves from inventory to promotional
              expense.
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

        <div className="text-[0.65rem] text-text-on-light-muted flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />A{" "}
          <code className="font-mono">stock_movements</code> exit of type{" "}
          <code className="font-mono">{type}</code> will be created.
        </div>
      </form>
    </Modal>
  );
}
