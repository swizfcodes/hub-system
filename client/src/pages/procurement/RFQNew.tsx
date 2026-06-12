import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus, Trash2, Sparkles } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { Card } from "@components/ui/Card";
import { Checkbox } from "@components/ui/Checkbox";
import { rfqCreateSchema, type RFQCreateValues } from "@lib/schemas/purchasing";
import { createRFQ } from "@services/purchasing/rfqs";
import { listSuppliers } from "@services/purchasing/suppliers";
import { ProductFormModal } from "@components/catalogue/modals/ProductFormModal";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { ProductSelectField } from "@components/shared/CatalogueSearchInput";

/** A blank line — qty starts empty (undefined), not seeded with 1. */
function emptyLine(): RFQCreateValues["lines"][number] {
  return {
    product_id: "",
    description: "",
    quantity_needed: undefined,
  } as unknown as RFQCreateValues["lines"][number];
}

export default function RFQNew() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddLineIndex, setQuickAddLineIndex] = useState<number | null>(
    null,
  );

  const { data: suppliersResp } = useQuery({
    queryKey: ["purchasing", "suppliers"],
    queryFn: () => listSuppliers({ limit: 200 }),
  });

  const suppliers = suppliersResp?.data ?? [];

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RFQCreateValues>({
    resolver: zodResolver(rfqCreateSchema),
    defaultValues: {
      title: "",
      response_deadline: "",
      notes: "",
      invited_supplier_ids: [],
      lines: [emptyLine()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const invitedIds = watch("invited_supplier_ids") ?? [];

  // Append a blank line.
  function addLine() {
    append(emptyLine());
  }

  const mutation = useMutation({
    mutationFn: (v: RFQCreateValues) =>
      createRFQ({
        ...v,
        response_deadline: v.response_deadline || undefined,
        notes: v.notes || undefined,
        lines: v.lines.map((l) => ({
          ...l,
          product_id: l.product_id || undefined,
          target_price: l.target_price || undefined,
        })),
        invited_supplier_ids: v.invited_supplier_ids,
      }),
    onSuccess: (rfq) => {
      qc.invalidateQueries({ queryKey: ["purchasing", "rfqs"] });
      showToast.success(`RFQ ${rfq.rfq_number} created`);
      navigate(`/procurement/rfqs/${rfq.rfq_id}`);
    },
    onError: (e) => showToast.error("Could not save", errMsg(e)),
  });

  return (
    <>
      <Topbar title="New RFQ" subtitle="Request for Quote" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Procurement", to: "/procurement" },
              { label: "RFQs", to: "/procurement/rfqs" },
              { label: "New" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ChevronLeft className="w-4 h-4" />}
            onClick={() => navigate("/procurement/rfqs")}
          >
            Cancel
          </Button>
        </div>

        <header className="mb-6">
          <p className="text-[0.7rem] tracking-[0.18em] uppercase text-brand-accent mb-2">
            New request for quote
          </p>
          <h1 className="font-display font-light text-3xl sm:text-4xl text-brand-cream">
            Source <span className="italic text-brand-accent">best value</span>
          </h1>
        </header>

        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-6"
        >
          {/* Header section */}
          <Card className="p-5 sm:p-6 space-y-4">
            <Input
              {...register("title")}
              label="RFQ title"
              placeholder="Q2 raw materials · diffuser glass bottles"
              error={errors.title?.message}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                {...register("response_deadline")}
                type="date"
                label="Response deadline"
                hint="Suppliers must submit before this date"
              />
              <Input {...register("notes")} label="Notes (optional)" />
            </div>
          </Card>

          {/* Line items */}
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent">
                Line items
              </h3>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={addLine}
              >
                Add line
              </Button>
            </div>
            <div className="space-y-3">
              {fields.map((f, i) => (
                <div
                  key={f.id}
                  className="rounded-xl border border-brand-graphite bg-brand-black/30 p-3.5"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-[0.6rem] text-brand-smoke font-mono uppercase tracking-widest mt-2 w-7">
                      L{i + 1}
                    </span>
                    <div className="flex-1 grid gap-3 sm:grid-cols-[2fr_2fr_auto_auto] items-end">
                      <Controller
                        control={control}
                        name={`lines.${i}.product_id`}
                        render={({ field }) => (
                          <div className="flex gap-1 items-end">
                            <div className="flex-1">
                              <ProductSelectField
                                surface="dark"
                                currency="NGN"
                                label="Product (optional)"
                                instanceKey={i}
                                value={field.value ?? ""}
                                onChange={field.onChange}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setQuickAddLineIndex(i);
                                setQuickAddOpen(true);
                              }}
                              className="px-2 py-2 rounded-xl bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30 transition-colors shrink-0"
                              title="Quick-add new product"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      />
                      <Input
                        surface="dark"
                        {...register(`lines.${i}.description` as const)}
                        label="Description"
                        placeholder="Or describe what you need"
                      />
                      <Controller
                        control={control}
                        name={`lines.${i}.quantity_needed` as const}
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
                      <Controller
                        control={control}
                        name={`lines.${i}.target_price` as const}
                        render={({ field, fieldState }) => (
                          <NumberField
                            surface="dark"
                            decimal
                            label="Target price"
                            placeholder="0.00"
                            hint="Optional, internal"
                            value={field.value}
                            onValueChange={field.onChange}
                            onBlur={field.onBlur}
                            error={fieldState.error?.message}
                            onEnter={
                              i === fields.length - 1 ? addLine : undefined
                            }
                          />
                        )}
                      />
                    </div>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="p-2 mt-6 text-brand-smoke hover:text-state-danger"
                        aria-label="Remove line"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {errors.lines && (
              <p className="mt-2 text-xs text-state-danger">
                {(errors.lines as { message?: string }).message}
              </p>
            )}
          </Card>

          {/* Invited suppliers */}
          <Card className="p-5 sm:p-6">
            <div className="flex items-start gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-brand-accent shrink-0 mt-0.5" />
              <div>
                <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent">
                  Invited suppliers
                </h3>
                <p className="text-xs text-brand-cloud mt-1">
                  Each will get a unique tokenised URL to submit their quote.
                  Pick at least one — pick many for competitive pricing.
                </p>
              </div>
            </div>
            <Controller
              control={control}
              name="invited_supplier_ids"
              render={({ field }) => (
                <div className="grid gap-2 sm:grid-cols-2">
                  {suppliers.length === 0 ? (
                    <p className="text-sm text-brand-smoke italic col-span-full">
                      No suppliers yet.{" "}
                      <Link
                        to="/procurement/suppliers"
                        className="text-brand-accent underline"
                      >
                        Add one
                      </Link>{" "}
                      first.
                    </p>
                  ) : (
                    suppliers.map((s) => {
                      const checked = field.value.includes(s.supplier_id);
                      return (
                        <Checkbox
                          key={s.supplier_id}
                          surface="dark"
                          checked={checked}
                          onChange={(on) => {
                            if (on)
                              field.onChange([...field.value, s.supplier_id]);
                            else
                              field.onChange(
                                field.value.filter(
                                  (id) => id !== s.supplier_id,
                                ),
                              );
                          }}
                          label={
                            <span>
                              <strong className="text-brand-cream">
                                {s.display_name}
                              </strong>{" "}
                              <span className="text-brand-smoke text-[0.6rem]">
                                · {s.preferred_currency} · Net{" "}
                                {s.payment_terms_days}d
                              </span>
                            </span>
                          }
                        />
                      );
                    })
                  )}
                </div>
              )}
            />
            {errors.invited_supplier_ids && (
              <p className="mt-2 text-xs text-state-danger">
                {errors.invited_supplier_ids.message}
              </p>
            )}
            {invitedIds.length > 0 && (
              <p className="mt-3 text-[0.65rem] text-brand-accent">
                {invitedIds.length} supplier{invitedIds.length > 1 ? "s" : ""}{" "}
                will be invited
              </p>
            )}
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline-light"
              onClick={() => navigate("/procurement/rfqs")}
            >
              Cancel
            </Button>
            <Button type="submit" variant="gold" loading={mutation.isPending}>
              Create RFQ
            </Button>
          </div>
        </form>
      </div>

      {/* Quick-add product modal — Q2 answer B */}
      <ProductFormModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onSaved={(p) => {
          if (quickAddLineIndex !== null)
            setValue(`lines.${quickAddLineIndex}.product_id`, p.product_id);
          qc.invalidateQueries({ queryKey: ["catalogue", "products"] });
          setQuickAddOpen(false);
          setQuickAddLineIndex(null);
        }}
      />
    </>
  );
}
