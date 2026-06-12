import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Receipt, Archive, Pencil } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { NumberField } from "@components/ui/NumberField";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import { Modal } from "@components/ui/Modal";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { DropdownMenu } from "@components/ui/DropdownMenu";
import { ConfirmationModal } from "@components/ui/ConfirmationModal";
import {
  listTaxRates,
  createTaxRate,
  updateTaxRate,
  deactivateTaxRate,
} from "@services/settings/taxRates";
import { useBusinessStore } from "@stores/useBusinessStore";
import { taxRateSchema, type TaxRateValues } from "@lib/schemas/taxRate";
import { fmtDate } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { TaxRate } from "@typedefs/settings";

const TYPE_TONE: Record<string, "gold" | "sage" | "rose"> = {
  sales: "gold",
  purchases: "sage",
  payroll: "rose",
};

export default function TaxRates() {
  const qc = useQueryClient();
  const active = useBusinessStore((s) => s.active);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [archiving, setArchiving] = useState<TaxRate | null>(null);

  const { data: rates = [], isLoading } = useQuery({
    queryKey: ["settings", "tax-rates", { business: active }],
    queryFn: () => listTaxRates(active ?? undefined, true),
    enabled: !!active,
  });

  const archive = useMutation({
    mutationFn: (id: string) => deactivateTaxRate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "tax-rates"] });
      showToast.success("Tax rate archived");
      setArchiving(null);
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <>
      <Topbar
        title="Tax Rates"
        subtitle={`Tax configuration · ${active ?? "—"}`}
      />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-5xl mx-auto">
        <PageHeader
          title="Tax Rates"
          subtitle="VAT, withholding tax, PAYE and any other tax line items for the active business. Each rate has an effective date range — historical rates are preserved for audit."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Settings", to: "/settings" },
            { label: "Tax Rates" },
          ]}
          actions={
            <Button
              variant="gold"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setCreating(true)}
              disabled={!active}
            >
              Add Tax Rate
            </Button>
          }
        />

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : rates.length === 0 ? (
          <EmptyState
            icon={<Receipt className="w-7 h-7" />}
            title="No tax rates"
            description={`Add the first tax rate for ${active ?? "this business"}.`}
            action={
              <Button
                variant="gold"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setCreating(true)}
              >
                Add tax rate
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {rates.map((r) => (
              <Card key={r.tax_id} className="p-5 flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-brand-black/40 flex items-center justify-center shrink-0">
                  <span className="font-mono text-xl text-brand-accent">
                    {(r.rate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-brand-cream">
                      {r.tax_name}
                    </span>
                    <Badge
                      tone={TYPE_TONE[r.tax_type] ?? "neutral"}
                      dot
                      size="xs"
                    >
                      {r.tax_type}
                    </Badge>
                    <Badge tone="neutral" size="xs">
                      {r.applies_to}
                    </Badge>
                  </div>
                  <div className="text-xs text-brand-smoke">
                    Effective {fmtDate(r.effective_from)}
                    {r.effective_to
                      ? ` → ${fmtDate(r.effective_to)}`
                      : " · ongoing"}
                  </div>
                </div>
                <DropdownMenu
                  items={[
                    {
                      label: "Edit",
                      icon: <Pencil className="w-3.5 h-3.5" />,
                      onClick: () => setEditing(r),
                    },
                    {
                      label: "Archive",
                      icon: <Archive className="w-3.5 h-3.5" />,
                      destructive: true,
                      onClick: () => setArchiving(r),
                    },
                  ]}
                />
              </Card>
            ))}
          </div>
        )}
      </div>

      <TaxRateFormModal
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        editing={editing}
        defaultBusiness={active}
      />

      <ConfirmationModal
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={() => {
          archiving && archive.mutateAsync(archiving.tax_id);
        }}
        title={`Archive “${archiving?.tax_name}”?`}
        message={
          <p>
            This rate will no longer apply to new documents. Historical entries
            are preserved.
          </p>
        }
        confirmLabel="Archive"
        loading={archive.isPending}
      />
    </>
  );
}

function TaxRateFormModal({
  open,
  onClose,
  editing,
  defaultBusiness,
}: {
  open: boolean;
  onClose: () => void;
  editing: TaxRate | null;
  defaultBusiness: string | null;
}) {
  const qc = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaxRateValues>({
    resolver: zodResolver(taxRateSchema),
    defaultValues: editing
      ? {
          business: editing.business,
          tax_name: editing.tax_name,
          tax_type: editing.tax_type,
          rate: editing.rate,
          applies_to: editing.applies_to,
          effective_from: editing.effective_from?.slice(0, 10),
          effective_to: editing.effective_to?.slice(0, 10) ?? "",
          is_active: editing.is_active,
        }
      : {
          business: defaultBusiness ?? "",
          tax_name: "",
          tax_type: "sales",
          rate: 0.075,
          applies_to: "all",
          effective_from: new Date().toISOString().slice(0, 10),
          effective_to: "",
          is_active: true,
        },
  });

  const mutation = useMutation({
    mutationFn: (v: TaxRateValues) =>
      editing
        ? updateTaxRate(editing.tax_id, {
            ...v,
            effective_to: v.effective_to || null,
          })
        : createTaxRate({ ...v, effective_to: v.effective_to || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "tax-rates"] });
      showToast.success(editing ? "Tax rate updated" : "Tax rate added");
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
      title={editing ? "Edit tax rate" : "New tax rate"}
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
            {editing ? "Save" : "Add tax rate"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        noValidate
        className="grid gap-4 sm:grid-cols-2"
      >
        <Input
          {...register("tax_name")}
          label="Tax name"
          placeholder="VAT"
          className="sm:col-span-2"
          error={errors.tax_name?.message}
        />
        <Select
          {...register("tax_type")}
          label="Tax type"
          options={[
            { value: "sales", label: "Sales" },
            { value: "purchases", label: "Purchases" },
            { value: "payroll", label: "Payroll" },
          ]}
          error={errors.tax_type?.message}
        />
        <Select
          {...register("applies_to")}
          label="Applies to"
          options={[
            { value: "all", label: "All" },
            { value: "goods", label: "Goods" },
            { value: "services", label: "Services" },
            { value: "salaries", label: "Salaries" },
            { value: "basic", label: "Basic pay" },
          ]}
          error={errors.applies_to?.message}
        />
        <Controller
          control={control}
          name="rate"
          render={({ field, fieldState }) => (
            <NumberField
              decimal
              surface="light"
              label="Rate"
              hint="Decimal 0–1 (0.075 = 7.5%)"
              className="sm:col-span-2"
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
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
      </form>
    </Modal>
  );
}
