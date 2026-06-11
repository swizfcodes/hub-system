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
import { ChevronLeft, Plus, Trash2, Zap, Mail } from "lucide-react";
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
import { createPO, emailPO } from "@services/purchasing/purchaseOrders";
import { CURRENCIES } from "@lib/constants/currencies";
import { fmtMoney } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { CatalogueSearchInput } from "@components/shared/CatalogueSearchInput";
import { QuickAddProductModal } from "@components/procurement/QuickAddProductModal";

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
  // Inline product creation, scoped to the line that triggered it.
  const [quickAdd, setQuickAdd] = useState<{
    open: boolean;
    line: number;
    query: string;
  }>({ open: false, line: 0, query: "" });
  // Email the PO to the supplier as soon as it's created (both modes).
  const [emailOnCreate, setEmailOnCreate] = useState(false);

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
    mutationFn: async (v: POCreateValues) => {
      const po = await createPO({
        ...v,
        expected_delivery: v.expected_delivery || undefined,
        delivery_address: v.delivery_address || undefined,
        exchange_rate: v.exchange_rate || undefined,
        rfq_id: v.rfq_id || undefined,
        notes: v.notes || undefined,
        // Merge the per-line description (held in local state by index).
        lines: v.lines.map((l, i) => ({
          product_id: l.product_id as string,
          quantity_ordered: l.quantity_ordered,
          unit_price: l.unit_price,
          description: lineDescriptions[i] || undefined,
        })),
      });
      if (emailOnCreate) {
        try {
          await emailPO(po.po_id);
        } catch (e) {
          // PO is saved; surface the email problem without losing the PO.
          showToast.error("PO saved, but email failed", errMsg(e));
        }
      }
      return po;
    },
    onSuccess: (po) => {
      qc.invalidateQueries({ queryKey: ["purchasing", "purchase-orders"] });
      showToast.success(
        `PO ${po.po_number} created`,
        emailOnCreate ? "Emailed to the supplier." : undefined,
      );
      // Quick mode: go straight to the detail page with receive modal pre-opened
      if (isQuickMode) {
        navigate(`/procurement/purchase-orders/${po.po_id}?receive=1`);
      } else {
        navigate(`/procurement/purchase-orders/${po.po_id}`);
      }
    },
    onError: (e) => showToast.error("Could not save", errMsg(e)),
  });

  // Guard product-on-every-line before submitting (backend enforces too).
  function submit(v: POCreateValues) {
    const missing = v.lines.findIndex((l) => !l.product_id);
    if (missing !== -1) {
      showToast.error(
        "Each line needs a product",
        `Line ${missing + 1} has no product. Pick one or use "Add new product".`,
      );
      return;
    }
    mutation.mutate(v);
  }

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
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-brand-accent/30 bg-brand-accent/[0.06] px-4 py-3">
            <Zap className="h-4 w-4 text-brand-accent mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-brand-accent">Quick purchase mode</p>
              <p className="text-xs text-brand-smoke mt-0.5">
                After creating the PO you'll be taken straight to receive the goods — no extra steps.
              </p>
            </div>
          </div>
        )}

        <header className="mb-6">
          <p className="text-[0.7rem] tracking-[0.18em] uppercase text-brand-accent mb-2">
            New purchase order
          </p>
          <h1 className="font-display font-light text-3xl sm:text-4xl text-brand-cream">
            Issue a <span className="italic text-brand-accent">PO</span>
          </h1>
        </header>

        <form
          onSubmit={handleSubmit(submit)}
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
              <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent">
                Line items
              </h3>
              <span className="text-[0.6rem] text-brand-smoke">
                {fields.length} {fields.length === 1 ? "line" : "lines"}
              </span>
            </div>
            <div className="space-y-3">
              {fields.map((f, i) => (
                <div
                  key={f.id}
                  className="rounded-xl border border-brand-graphite bg-brand-black/30 p-3.5"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[0.6rem] text-brand-smoke font-mono uppercase tracking-widest mt-3 w-7">
                      L{i + 1}
                    </span>
                    <div className="flex-1 space-y-3">
                      <CatalogueSearchInput
                        surface="dark"
                        currency="NGN"
                        label="Product *"
                        instanceKey={i}
                        autoFocus={focusLine === i}
                        allowQuickAdd
                        onQuickAdd={(query) =>
                          setQuickAdd({ open: true, line: i, query })
                        }
                        onSelect={(p) => {
                          setValue(`lines.${i}.product_id`, p.product_id);
                          setLineDescriptions((d) => ({ ...d, [i]: p.name }));
                        }}
                      />
                      {/* Selected-product confirmation / required hint */}
                      {linesWatch?.[i]?.product_id ? (
                        <p className="text-[0.65rem] text-accent2">
                          ✓ {lineDescriptions[i] || "Product linked"}
                        </p>
                      ) : (
                        <p className="text-[0.65rem] text-brand-smoke/70">
                          Pick a product, or use “Add new product” if it isn’t
                          in the catalogue yet.
                        </p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-[2fr_auto_auto] items-end">
                        <div>
                          <label className="mb-1 block text-[0.65rem] uppercase tracking-widest text-brand-smoke font-medium">
                            Description / note (optional)
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
                            placeholder="Spec or note for this line"
                            className="w-full rounded-lg border border-white/10 bg-brand-graphite py-2 px-3 text-sm text-brand-cream placeholder-brand-smoke/50 focus:border-brand-accent/50 focus:outline-none"
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
                        className="p-2 mt-7 text-brand-smoke hover:text-state-danger"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {(linesWatch?.[i]?.quantity_ordered ?? 0) > 0 &&
                    (linesWatch?.[i]?.unit_price ?? 0) > 0 && (
                      <div className="mt-2 ml-7 text-[0.65rem] text-brand-smoke text-right">
                        Line total ·{" "}
                        <span className="font-mono text-brand-cream">
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
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-graphite py-3 text-xs font-medium text-brand-smoke transition-colors hover:border-brand-accent/50 hover:text-brand-accent"
            >
              <Plus className="w-3.5 h-3.5" />
              Add line
            </button>
          </Card>

          {/* Charges + FX + totals */}
          <Card className="p-5 sm:p-6">
            <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-4">
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
            <div className="mt-5 rounded-xl bg-brand-black/40 border border-brand-graphite p-4">
              <Total label="Subtotal" value={fmtMoney(subtotal, currency)} />
              <Total label="Shipping" value={fmtMoney(shipping, currency)} />
              <Total label="Import duty" value={fmtMoney(duty, currency)} />
              <Total label="Other" value={fmtMoney(other, currency)} />
              <div className="border-t border-brand-graphite mt-2 pt-2">
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

          {/* Email option — available on both quick and full modes */}
          <label className="flex items-center gap-2.5 rounded-xl border border-brand-graphite bg-brand-black/30 px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={emailOnCreate}
              onChange={(e) => setEmailOnCreate(e.target.checked)}
              className="h-4 w-4 accent-brand-accent"
            />
            <Mail className="h-4 w-4 text-brand-accent" />
            <span className="text-sm text-brand-cream">
              Email this PO to the supplier now
            </span>
            <span className="ml-auto text-[0.65rem] text-brand-smoke">
              Requires an email on the supplier’s contact
            </span>
          </label>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline-light"
              onClick={() => navigate("/procurement/purchase-orders")}
            >
              Cancel
            </Button>
            <Button type="submit" variant="gold" loading={mutation.isPending}>
              {emailOnCreate ? "Create & email PO" : "Create PO"}
            </Button>
          </div>
        </form>
      </div>

      <QuickAddProductModal
        open={quickAdd.open}
        initialName={quickAdd.query}
        onClose={() => setQuickAdd((s) => ({ ...s, open: false }))}
        onCreated={(p) => {
          setValue(`lines.${quickAdd.line}.product_id`, p.product_id);
          setLineDescriptions((d) => ({ ...d, [quickAdd.line]: p.name }));
        }}
      />
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
      <span className="text-brand-smoke">
        {label}
        {hint && <span className="ml-1 text-[0.6rem]">{hint}</span>}
      </span>
      <span
        className={`font-mono ${bold ? "text-brand-accent text-base" : "text-brand-cream"}`}
      >
        {value}
      </span>
    </div>
  );
}
