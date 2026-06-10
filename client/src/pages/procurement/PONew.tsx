/**
 * PONew — Create Purchase Order
 *
 * FIX: Replaced 200-item supplier Select and 200-item product Select with
 * proper searchable typeaheads. Previous code loaded everything into memory
 * and rendered unsearchable dropdowns — broken past 200 records.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus, Trash2, Zap } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { Card } from "@components/ui/Card";
import {
  SupplierSearchInput,
  type SupplierOption,
} from "@components/procurement/suppliers/SupplierSearchInput";
import { poCreateSchema, type POCreateValues } from "@lib/schemas/purchasing";
import { createPO } from "@services/purchasing/purchaseOrders";
import { CURRENCIES } from "@lib/constants/currencies";
import { fmtMoney } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { CatalogueSearchInput } from "@components/shared/CatalogueSearchInput";

// ProductLineSearch replaced by shared CatalogueSearchInput

/** A blank line — qty/price start empty (undefined), not seeded with 0/1. */
function emptyLine(): POCreateValues["lines"][number] {
  return {
    product_id: "",
    quantity_ordered: undefined,
    unit_price: undefined,
  } as unknown as POCreateValues["lines"][number];
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PONew() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const isQuickMode = params.get("mode") === "quick";
  const [selectedSupplier, setSelectedSupplier] =
    useState<SupplierOption | null>(null);
  const [lineDescriptions, setLineDescriptions] = useState<
    Record<number, string>
  >({});
  // Index of a freshly added line — its product search grabs focus on mount.
  const [focusLine, setFocusLine] = useState<number | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<POCreateValues>({
    resolver: zodResolver(poCreateSchema),
    defaultValues: {
      supplier_id: params.get("supplier_id") ?? "",
      currency: "USD",
      // Charges start empty; the schema defaults them to 0 on submit.
      shipping_cost: undefined,
      import_duty: undefined,
      other_charges: undefined,
      // Lines start empty so staff type into blank boxes, not over a seed.
      lines: [emptyLine()],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  // Append a blank line and focus its product search.
  function addLine() {
    append(emptyLine());
    setFocusLine(fields.length); // new line's index
  }

  // Remove a line and keep the description map aligned to the new indices.
  function removeLine(i: number) {
    remove(i);
    setLineDescriptions((prev) => {
      const next: Record<number, string> = {};
      for (const key of Object.keys(prev).map(Number)) {
        if (key < i) next[key] = prev[key];
        else if (key > i) next[key - 1] = prev[key];
      }
      return next;
    });
  }
  const linesWatch = watch("lines");
  const currency = watch("currency");
  const shipping = watch("shipping_cost") ?? 0;
  const duty = watch("import_duty") ?? 0;
  const other = watch("other_charges") ?? 0;
  const fxRate = watch("exchange_rate");

  // Sync supplier selection to form field
  useEffect(() => {
    setValue("supplier_id", selectedSupplier?.supplier_id ?? "");
    if (selectedSupplier?.preferred_currency)
      setValue("currency", selectedSupplier.preferred_currency);
  }, [selectedSupplier, setValue]);

  const subtotal = (linesWatch ?? []).reduce(
    (s, l) => s + (l.quantity_ordered ?? 0) * (l.unit_price ?? 0),
    0,
  );
  const total = subtotal + (shipping || 0) + (duty || 0) + (other || 0);
  const ngnEquivalent = fxRate ? total * fxRate : null;

  const mutation = useMutation({
    mutationFn: (v: POCreateValues) =>
      createPO({
        ...v,
        expected_delivery: v.expected_delivery || undefined,
        delivery_address: v.delivery_address || undefined,
        exchange_rate: v.exchange_rate || undefined,
        rfq_id: v.rfq_id || undefined,
        notes: v.notes || undefined,
      }),
    onSuccess: (po) => {
      qc.invalidateQueries({ queryKey: ["purchasing", "purchase-orders"] });
      showToast.success(`PO ${po.po_number} created`);
      // Quick mode: go straight to the detail page with receive modal pre-opened
      if (isQuickMode) {
        navigate(`/procurement/purchase-orders/${po.po_id}?receive=1`);
      } else {
        navigate(`/procurement/purchase-orders/${po.po_id}`);
      }
    },
    onError: (e) => showToast.error("Could not save", errMsg(e)),
  });

  return (
    <>
      <Topbar title="New PO" subtitle="Purchase Order" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Procurement", to: "/procurement" },
              { label: "POs", to: "/procurement/purchase-orders" },
              { label: "New" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ChevronLeft className="w-4 h-4" />}
            onClick={() => navigate("/procurement/purchase-orders")}
          >
            Cancel
          </Button>
        </div>

        {/* Quick mode banner */}
        {isQuickMode && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-orika-gold/30 bg-orika-gold/[0.06] px-4 py-3">
            <Zap className="h-4 w-4 text-orika-gold mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-orika-gold">Quick purchase mode</p>
              <p className="text-xs text-orika-smoke mt-0.5">
                After creating the PO you'll be taken straight to receive the goods — no extra steps.
              </p>
            </div>
          </div>
        )}

        <header className="mb-6">
          <p className="text-[0.7rem] tracking-[0.18em] uppercase text-orika-gold mb-2">
            New purchase order
          </p>
          <h1 className="font-display font-light text-3xl sm:text-4xl text-orika-cream">
            Issue a <span className="italic text-orika-gold">PO</span>
          </h1>
        </header>

        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-6"
        >
          <Card className="p-5 sm:p-6 space-y-4">
            <SupplierSearchInput
              value={selectedSupplier}
              onChange={setSelectedSupplier}
              label="Supplier"
              required
              error={errors.supplier_id?.message}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                {...register("expected_delivery")}
                type="date"
                label="Expected delivery"
              />
              <Input
                {...register("delivery_address")}
                label="Delivery address"
                placeholder="Lagos warehouse"
              />
            </div>
          </Card>

          {/* Lines */}
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold">
                Line items
              </h3>
              <span className="text-[0.6rem] text-orika-smoke">
                {fields.length} {fields.length === 1 ? "line" : "lines"}
              </span>
            </div>
            <div className="space-y-3">
              {fields.map((f, i) => (
                <div
                  key={f.id}
                  className="rounded-xl border border-orika-graphite bg-orika-black/30 p-3.5"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[0.6rem] text-orika-smoke font-mono uppercase tracking-widest mt-3 w-7">
                      L{i + 1}
                    </span>
                    <div className="flex-1 space-y-3">
                      <CatalogueSearchInput
                        surface="dark"
                        currency="NGN"
                        label="Product search (optional)"
                        instanceKey={i}
                        autoFocus={focusLine === i}
                        onSelect={(p) => {
                          setValue(`lines.${i}.product_id`, p.product_id);
                          setLineDescriptions((d) => ({ ...d, [i]: p.name }));
                        }}
                      />
                      <div className="grid gap-3 sm:grid-cols-[2fr_auto_auto] items-end">
                        <div>
                          <label className="mb-1 block text-[0.65rem] uppercase tracking-widest text-orika-smoke font-medium">
                            Description / SKU
                          </label>
                          <input
                            type="text"
                            value={lineDescriptions[i] ?? ""}
                            onChange={(e) =>
                              setLineDescriptions((d) => ({
                                ...d,
                                [i]: e.target.value,
                              }))
                            }
                            placeholder="Auto-filled from search above"
                            className="w-full rounded-lg border border-white/10 bg-orika-graphite py-2 px-3 text-sm text-orika-cream placeholder-orika-smoke/50 focus:border-orika-gold/50 focus:outline-none"
                          />
                        </div>
                        <Controller
                          control={control}
                          name={`lines.${i}.quantity_ordered` as const}
                          render={({ field, fieldState }) => (
                            <NumberField
                              surface="dark"
                              label="Qty"
                              placeholder="0"
                              className="w-24"
                              value={field.value}
                              onValueChange={field.onChange}
                              onBlur={field.onBlur}
                              error={fieldState.error?.message}
                            />
                          )}
                        />
                        <Controller
                          control={control}
                          name={`lines.${i}.unit_price` as const}
                          render={({ field, fieldState }) => (
                            <NumberField
                              surface="dark"
                              decimal
                              label="Unit price"
                              placeholder="0.00"
                              className="w-32"
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
                    </div>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="p-2 mt-7 text-orika-smoke hover:text-state-danger"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {(linesWatch?.[i]?.quantity_ordered ?? 0) > 0 &&
                    (linesWatch?.[i]?.unit_price ?? 0) > 0 && (
                      <div className="mt-2 ml-7 text-[0.65rem] text-orika-smoke text-right">
                        Line total ·{" "}
                        <span className="font-mono text-orika-cream">
                          {fmtMoney(
                            linesWatch[i].quantity_ordered *
                              linesWatch[i].unit_price,
                            currency,
                          )}
                        </span>
                      </div>
                    )}
                </div>
              ))}
            </div>

            {/* Add line — sits below the list so adding flows downward and
                jumps focus straight to the new line's product search. */}
            <button
              type="button"
              onClick={addLine}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-orika-graphite py-3 text-xs font-medium text-orika-smoke transition-colors hover:border-orika-gold/50 hover:text-orika-gold"
            >
              <Plus className="w-3.5 h-3.5" />
              Add line
            </button>
          </Card>

          {/* Charges + FX + totals */}
          <Card className="p-5 sm:p-6">
            <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold mb-4">
              Charges & currency
            </h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                {...register("currency")}
                label="Currency"
                options={CURRENCIES.map((c) => ({
                  value: c.code,
                  label: `${c.symbol} ${c.code}`,
                }))}
              />
              <Controller
                control={control}
                name="shipping_cost"
                render={({ field }) => (
                  <NumberField
                    decimal
                    label="Shipping"
                    placeholder="0.00"
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <Controller
                control={control}
                name="import_duty"
                render={({ field }) => (
                  <NumberField
                    decimal
                    label="Import duty"
                    placeholder="0.00"
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <Controller
                control={control}
                name="other_charges"
                render={({ field }) => (
                  <NumberField
                    decimal
                    label="Other charges"
                    placeholder="0.00"
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              {/* Exchange rate only needed for non-NGN currencies */}
              {currency !== "NGN" && (
                <Controller
                  control={control}
                  name="exchange_rate"
                  render={({ field }) => (
                    <NumberField
                      decimal
                      label="Exchange rate (to NGN)"
                      placeholder="0.0000"
                      hint="Rate locked at time of creation"
                      className="sm:col-span-2"
                      value={field.value}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              )}
            </div>
            <div className="mt-5 rounded-xl bg-orika-black/40 border border-orika-graphite p-4">
              <Total label="Subtotal" value={fmtMoney(subtotal, currency)} />
              <Total label="Shipping" value={fmtMoney(shipping, currency)} />
              <Total label="Import duty" value={fmtMoney(duty, currency)} />
              <Total label="Other" value={fmtMoney(other, currency)} />
              <div className="border-t border-orika-graphite mt-2 pt-2">
                <Total label="Total" value={fmtMoney(total, currency)} bold />
                {ngnEquivalent != null && currency !== "NGN" && (
                  <Total
                    label="NGN equivalent"
                    value={fmtMoney(ngnEquivalent, "NGN")}
                    hint="@ locked rate"
                  />
                )}
              </div>
            </div>
            <Textarea
              {...register("notes")}
              label="Notes (optional)"
              className="mt-4"
              rows={2}
            />
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline-light"
              onClick={() => navigate("/procurement/purchase-orders")}
            >
              Cancel
            </Button>
            <Button type="submit" variant="gold" loading={mutation.isPending}>
              Create PO
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

function Total({
  label,
  value,
  bold,
  hint,
}: {
  label: string;
  value: string;
  bold?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`flex items-baseline justify-between text-xs py-0.5 ${bold ? "font-bold" : ""}`}
    >
      <span className="text-orika-smoke">
        {label}
        {hint && <span className="ml-1 text-[0.6rem]">{hint}</span>}
      </span>
      <span
        className={`font-mono ${bold ? "text-orika-gold text-base" : "text-orika-cream"}`}
      >
        {value}
      </span>
    </div>
  );
}
