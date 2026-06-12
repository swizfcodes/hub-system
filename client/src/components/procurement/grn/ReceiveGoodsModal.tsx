import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, AlertTriangle, Check, X } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { Textarea } from "@components/ui/Textarea";
import { Select } from "@components/ui/Select";
import { grnSchema, type GRNValues } from "@lib/schemas/purchasing";
import { receiveGoods } from "@services/purchasing/purchaseOrders";
import { listLocations } from "@services/catalogue/locations";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { PurchaseOrder } from "@typedefs/purchasing";
import { cn } from "@lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  po: PurchaseOrder;
  /** Fired after a successful receipt — used to chain into billing. */
  onReceived?: () => void;
}

export function ReceiveGoodsModal({ open, onClose, po, onReceived }: Props) {
  const qc = useQueryClient();

  const { data: locations = [] } = useQuery({
    queryKey: ["catalogue", "locations"],
    queryFn: () => listLocations(false),
  });
  const warehouses = locations.filter(
    (l) =>
      l.location_type === "warehouse" ||
      l.location_type === "showroom" ||
      l.location_type === "retail" ||
      l.location_type === "pos_terminal",
  );

  const openLines = (po.lines ?? []).filter(
    (l) => l.quantity_received < l.quantity_ordered,
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<GRNValues>({
    resolver: zodResolver(grnSchema),
    defaultValues: {
      receiving_location_id: "",
      notes: "",
      lines: openLines.map((l) => ({
        po_line_id: l.line_id,
        quantity_received: l.quantity_ordered - l.quantity_received,
        quantity_accepted: l.quantity_ordered - l.quantity_received,
        quantity_rejected: 0,
        rejection_reason: "",
      })),
    },
  });

  const { fields } = useFieldArray({ control, name: "lines" });
  const linesWatch = watch("lines");

  useEffect(() => {
    if (open) {
      reset({
        receiving_location_id: "",
        notes: "",
        lines: openLines.map((l) => ({
          po_line_id: l.line_id,
          quantity_received: l.quantity_ordered - l.quantity_received,
          quantity_accepted: l.quantity_ordered - l.quantity_received,
          quantity_rejected: 0,
          rejection_reason: "",
        })),
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useMutation({
    mutationFn: (v: GRNValues) =>
      receiveGoods(po.po_id, {
        receiving_location_id: v.receiving_location_id || undefined,
        notes: v.notes || undefined,
        lines: v.lines.map((l) => ({
          po_line_id: l.po_line_id,
          quantity_received: l.quantity_received,
          quantity_accepted: l.quantity_accepted,
          quantity_rejected: l.quantity_rejected,
          rejection_reason: l.rejection_reason || undefined,
        })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchasing", "po", po.po_id] });
      qc.invalidateQueries({ queryKey: ["purchasing", "purchase-orders"] });
      showToast.success("Goods received", "Stock updated automatically.");
      reset();
      onClose();
      onReceived?.();
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  if (openLines.length === 0) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        surface="light"
        size="md"
        title="All received"
        footer={
          <Button variant="primary" onClick={onClose}>
            OK
          </Button>
        }
      >
        <p className="text-sm text-brand-black/80">
          Every line on this PO has been fully received. Nothing more to log.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      surface="light"
      size="xl"
      title="Receive goods"
      description="Accept or reject each line. Accepted goods land in stock immediately."
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
            leftIcon={<ArrowDownToLine className="w-4 h-4" />}
            loading={mutation.isPending}
            onClick={handleSubmit((v) => mutation.mutate(v))}
          >
            Record receipt
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Select
            {...register("receiving_location_id")}
            label="Receiving location"
            placeholder="Pick a location (optional)"
            options={warehouses.map((l) => ({
              value: l.location_id,
              label: l.name,
            }))}
          />
          <Textarea
            {...register("notes")}
            label="Notes (optional)"
            rows={1}
            placeholder="Damaged box on top, otherwise intact…"
          />
        </div>

        <div className="space-y-3">
          {fields.map((f, i) => {
            const line = openLines[i];
            const w = linesWatch?.[i];
            const remaining = line.quantity_ordered - line.quantity_received;
            const isPartial = w && w.quantity_rejected > 0;

            function acceptAll() {
              setValue(`lines.${i}.quantity_accepted`, remaining, { shouldValidate: true });
              setValue(`lines.${i}.quantity_rejected`, 0, { shouldValidate: true });
              setValue(`lines.${i}.rejection_reason`, "");
            }

            function rejectAll() {
              setValue(`lines.${i}.quantity_accepted`, 0, { shouldValidate: true });
              setValue(`lines.${i}.quantity_rejected`, remaining, { shouldValidate: true });
            }

            return (
              <div
                key={f.id}
                className={cn(
                  "rounded-xl border p-3 sm:p-4 transition-colors",
                  isPartial
                    ? "border-state-warn/40 bg-state-warn/[0.05]"
                    : "border-brand-cloud/40 bg-white/40",
                )}
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-brand-black">
                      {line.product_name ?? "Product"}
                    </div>
                    <div className="text-[0.65rem] font-mono text-text-on-light-muted mt-0.5">
                      {line.product_sku} · Ordered {line.quantity_ordered},
                      already received {line.quantity_received}
                    </div>
                  </div>
                  <Controller
                    control={control}
                    name={`lines.${i}.po_line_id`}
                    render={({ field }) => <input type="hidden" {...field} />}
                  />
                  <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:min-w-[360px]">
                    <Controller
                      control={control}
                      name={`lines.${i}.quantity_received` as const}
                      render={({ field, fieldState }) => (
                        <NumberField
                          surface="light"
                          label="Received"
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
                      name={`lines.${i}.quantity_accepted` as const}
                      render={({ field, fieldState }) => (
                        <NumberField
                          surface="light"
                          label="Accepted"
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
                      name={`lines.${i}.quantity_rejected` as const}
                      render={({ field, fieldState }) => (
                        <NumberField
                          surface="light"
                          label="Rejected"
                          placeholder="0"
                          value={field.value}
                          onValueChange={field.onChange}
                          onBlur={field.onBlur}
                          error={fieldState.error?.message}
                        />
                      )}
                    />
                  </div>
                </div>
                {isPartial && (
                  <div className="mt-3 animate-slide-down">
                    <div className="flex items-center gap-1.5 mb-1.5 text-[0.65rem] text-state-warn">
                      <AlertTriangle className="w-3 h-3" /> Reason for rejection
                    </div>
                    <Input
                      {...register(`lines.${i}.rejection_reason` as const)}
                      placeholder="Damaged in transit · Wrong colour · Late · Spec mismatch"
                    />
                  </div>
                )}
                {errors.lines?.[i]?.quantity_received && (
                  <p className="mt-2 text-xs text-state-danger">
                    {errors.lines[i]?.quantity_received?.message}
                  </p>
                )}
                {/* Quick QC chips — now wired up */}
                <div className="mt-3 flex gap-2 flex-wrap text-xs">
                  <QuickChip label="Accept all" tone="sage" onClick={acceptAll} />
                  <QuickChip label="Reject all" tone="danger" onClick={rejectAll} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl bg-brand-cream/40 border border-brand-cloud/40 p-3 flex items-start gap-2 text-xs text-brand-black/70">
          <Check className="w-3.5 h-3.5 text-accent2 mt-0.5 shrink-0" />
          <p>
            Accepted quantities are added to stock immediately. Rejected lines
            stay with the supplier.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function QuickChip({
  label,
  tone,
  onClick,
}: {
  label: string;
  tone: "sage" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.6rem] uppercase tracking-widest font-medium cursor-pointer transition-opacity hover:opacity-80",
        tone === "sage"
          ? "bg-accent2/15 text-accent2"
          : "bg-state-danger/15 text-state-danger",
      )}
    >
      {tone === "sage" ? (
        <Check className="w-2.5 h-2.5" />
      ) : (
        <X className="w-2.5 h-2.5" />
      )}
      {label}
    </button>
  );
}
