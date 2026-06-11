import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Truck,
  ArrowLeft,
  Plus,
  Trash2,
  MapPin,
  Send,
  PackageCheck,
  X,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { NumberField } from "@components/ui/NumberField";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import { Modal } from "@components/ui/Modal";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import {
  listTransfers,
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
  cancelTransfer,
} from "@services/stock/transfers";
import { listLocations } from "@services/catalogue/locations";
import {
  transferCreateSchema,
  type TransferCreateValues,
} from "@lib/schemas/stock";
import { fmtRelative } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { ProductSelectField } from "@components/shared/CatalogueSearchInput";
import type { TransferStatus } from "@typedefs/stock";

const STATUS_TONE: Record<
  TransferStatus,
  "gold" | "sage" | "rose" | "neutral" | "danger"
> = {
  pending: "neutral",
  in_transit: "gold",
  received: "sage",
  cancelled: "danger",
};

export default function TransfersPage() {
  const { active: business } = useActiveBusiness();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["stock", "transfers", business],
    queryFn: () => listTransfers(),
  });
  const list = data?.data ?? [];

  const dispatch = useMutation({
    mutationFn: (id: string) => dispatchTransfer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock", "transfers"] });
      showToast.success("Transfer dispatched");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });
  const receive = useMutation({
    mutationFn: (id: string) => receiveTransfer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      showToast.success("Transfer received", "Stock updated automatically.");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelTransfer(id, "Manual cancellation"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock", "transfers"] });
      showToast.success("Transfer cancelled");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <>
      <Topbar title="Stock transfers" subtitle="Move stock between locations" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Stock", to: "/stock" },
              { label: "Transfers" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate("/stock")}
          >
            Back
          </Button>
        </div>

        <PageHeader
          title="Stock transfers"
          subtitle="Initiate → in transit → received. Stock movements post when the receiving location confirms — not when the truck leaves."
          actions={
            <Button
              variant="gold"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setCreating(true)}
            >
              New transfer
            </Button>
          }
        />

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Truck className="w-6 h-6" />}
            title="No transfers yet"
            description="Move stock between warehouses, showrooms, or POS terminals."
            action={
              <Button
                variant="gold"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setCreating(true)}
              >
                New transfer
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {list.map((t) => (
              <Card key={t.transfer_id} className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-state-info/15 text-state-info flex items-center justify-center shrink-0">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm text-brand-cream">
                          {t.transfer_number}
                        </span>
                        <Badge tone={STATUS_TONE[t.status]} size="xs" dot>
                          {t.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="text-[0.65rem] text-brand-cloud mt-1 inline-flex items-center gap-1.5">
                        <MapPin className="w-2.5 h-2.5" />{" "}
                        {t.from_location_name}
                        <span className="text-brand-smoke">→</span>
                        <MapPin className="w-2.5 h-2.5" /> {t.to_location_name}
                      </div>
                      <div className="text-[0.6rem] text-brand-smoke mt-0.5">
                        Initiated {fmtRelative(t.initiated_at)} ·{" "}
                        {t.initiated_by_name ?? "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.status === "pending" && (
                      <Button
                        size="sm"
                        variant="gold"
                        leftIcon={<Send className="w-3.5 h-3.5" />}
                        onClick={() => dispatch.mutate(t.transfer_id)}
                      >
                        Dispatch
                      </Button>
                    )}
                    {t.status === "in_transit" && (
                      <Button
                        size="sm"
                        variant="gold"
                        leftIcon={<PackageCheck className="w-3.5 h-3.5" />}
                        onClick={() => receive.mutate(t.transfer_id)}
                      >
                        Mark received
                      </Button>
                    )}
                    {(t.status === "pending" || t.status === "in_transit") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<X className="w-3.5 h-3.5" />}
                        onClick={() => cancel.mutate(t.transfer_id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateTransferModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function CreateTransferModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
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
    formState: { errors },
  } = useForm<TransferCreateValues>({
    resolver: zodResolver(transferCreateSchema),
    defaultValues: {
      from_location_id: "",
      to_location_id: "",
      notes: "",
      lines: [{ product_id: "", quantity: 1 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const mutation = useMutation({
    mutationFn: (v: TransferCreateValues) => createTransfer(v),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["stock", "transfers"] });
      showToast.success(`Transfer ${t.transfer_number} created`);
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
      size="lg"
      title="New stock transfer"
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
            Create
          </Button>
        </>
      }
    >
      <form className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Controller
            control={control}
            name="from_location_id"
            render={({ field }) => (
              <Select
                {...field}
                label="From"
                placeholder="Source"
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
            name="to_location_id"
            render={({ field }) => (
              <Select
                {...field}
                label="To"
                placeholder="Destination"
                options={locations.map((l) => ({
                  value: l.location_id,
                  label: l.name,
                }))}
                error={errors.to_location_id?.message}
              />
            )}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[0.7rem] tracking-widest uppercase font-medium text-text-on-light-muted">
              Products
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => append({ product_id: "", quantity: 1 })}
            >
              Add line
            </Button>
          </div>
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div
                key={f.id}
                className="grid grid-cols-[1fr_100px_auto] gap-2 items-end"
              >
                <Controller
                  control={control}
                  name={`lines.${i}.product_id`}
                  render={({ field, fieldState }) => (
                    <ProductSelectField
                      surface="dark"
                      currency="NGN"
                      label={`Line ${i + 1}`}
                      instanceKey={i}
                      value={field.value}
                      onChange={field.onChange}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name={`lines.${i}.quantity` as const}
                  render={({ field, fieldState }) => (
                    <NumberField
                      surface="dark"
                      label="Qty"
                      placeholder="0"
                      value={field.value}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(i)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <Textarea {...register("notes")} label="Notes (optional)" rows={2} />
      </form>
    </Modal>
  );
}
