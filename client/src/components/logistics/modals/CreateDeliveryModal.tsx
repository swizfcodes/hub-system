// ── CreateDeliveryModal.tsx ───────────────────────────────────────────────────
/**
 * Create a delivery in two ways:
 *   1. From an order — opened with a `prefill` (sales order / POS
 *      transaction) from those pages; items copy across automatically.
 *   2. Standalone — opened from Logistics with no prefill: pick the
 *      customer, list what's going (typed or from the catalogue), done.
 *      (Previously this path was a dead end — it demanded an order UUID
 *      there was no way to provide.)
 */
import { useState } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { NumberField } from "@components/ui/NumberField";
import { ContactSearchInput } from "@components/shared/ContactSearchInput";
import { CatalogueSearchInput } from "@components/shared/CatalogueSearchInput";
import { CourierSuggestPanel } from "@components/logistics/modals/CourierSuggestPanel";
import { createDelivery } from "@services/logistics";
import {
  createDeliverySchema,
  type CreateDeliveryValues,
} from "@lib/schemas/logistics";
import { FEE_BEARER_OPTIONS } from "@lib/constants/logisticsConstants";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { Courier, DeliveryAddress } from "@typedefs/logistics";
import type { Contact } from "@typedefs/contacts";

interface CreateDeliveryModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (deliveryId: string) => void;
  // Pre-fill from a Sales order or POS transaction
  prefill?: {
    reference_type: "sales_order" | "pos_transaction";
    reference_id: string;
    contact: Contact;
    address?: Partial<DeliveryAddress>;
  };
  currency?: string;
}

export function CreateDeliveryModal({
  open,
  onClose,
  onCreated,
  prefill,
  currency = "NGN",
}: CreateDeliveryModalProps) {
  const qc = useQueryClient();
  const isStandalone = !prefill;
  const [contact, setContact] = useState<Contact | null>(
    prefill?.contact ?? null,
  );

  const form = useForm<CreateDeliveryValues>({
    resolver: zodResolver(createDeliverySchema),
    defaultValues: {
      reference_type: prefill?.reference_type ?? "manual",
      reference_id: prefill?.reference_id ?? "",
      contact_id: prefill?.contact?.contact_id ?? "",
      delivery_address: {
        line1: prefill?.address?.line1 ?? "",
        area: prefill?.address?.area ?? "",
        city: prefill?.address?.city ?? "Lagos",
        state: prefill?.address?.state ?? "Lagos",
        country: "Nigeria",
        landmark: prefill?.address?.landmark ?? "",
        recipient_name: prefill?.contact?.display_name ?? "",
        phone: prefill?.contact?.primary_phone ?? "",
      },
      courier: "manual",
      delivery_fee: 0,
      fee_borne_by: "customer",
      items: isStandalone
        ? [{ product_id: "", description: "", quantity: 1 }]
        : [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedAddress = form.watch("delivery_address");

  function handleContactSelect(c: Contact | null) {
    setContact(c);
    form.setValue("contact_id", c?.contact_id ?? "");
    if (c) {
      // Pre-fill recipient details from the contact — editable after.
      if (!form.getValues("delivery_address.recipient_name"))
        form.setValue("delivery_address.recipient_name", c.display_name ?? "");
      if (!form.getValues("delivery_address.phone"))
        form.setValue("delivery_address.phone", c.primary_phone ?? "");
    }
  }

  const mutation = useMutation({
    mutationFn: (v: CreateDeliveryValues) =>
      createDelivery({
        ...v,
        reference_id: v.reference_id || undefined,
        items: isStandalone
          ? (v.items ?? []).map((i) => ({
              ...i,
              product_id: i.product_id || undefined,
            }))
          : undefined,
      } as CreateDeliveryValues),
    onSuccess: (delivery) => {
      showToast.success(`Delivery ${delivery.delivery_number} created`);
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      onCreated(delivery.delivery_id);
      form.reset();
      setContact(null);
    },
    onError: (err) => showToast.error("Could not create delivery", errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Delivery"
      size="lg"
      surface="light"
      footer={
        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit((v) => mutation.mutate(v))}
            loading={mutation.isPending}
          >
            Create Delivery
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Customer — standalone mode picks one; order mode shows it */}
        {isStandalone ? (
          <div>
            <ContactSearchInput
              value={contact}
              onChange={handleContactSelect}
              label="Customer *"
              required
            />
            {form.formState.errors.contact_id && (
              <p className="mt-1 text-xs text-state-danger">
                {form.formState.errors.contact_id.message}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-brand-cloud/40 bg-brand-cream/30 px-4 py-3 text-sm text-brand-black">
            For <strong>{prefill?.contact?.display_name}</strong> — items copy
            from the {prefill?.reference_type === "sales_order" ? "order" : "sale"}{" "}
            automatically.
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left — delivery address */}
          <div className="space-y-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-text-on-light-muted">
              Delivery Address
            </p>

            <Controller
              name="delivery_address.recipient_name"
              control={form.control}
              render={({ field }) => (
                <Input {...field} label="Recipient Name" surface="light" />
              )}
            />
            <Controller
              name="delivery_address.phone"
              control={form.control}
              render={({ field }) => (
                <Input
                  {...field}
                  label="Recipient Phone"
                  type="tel"
                  surface="light"
                />
              )}
            />
            <Controller
              name="delivery_address.line1"
              control={form.control}
              render={({ field, fieldState }) => (
                <Input
                  {...field}
                  label="Street Address *"
                  placeholder="14 Admiralty Way, Lekki Phase 1"
                  surface="light"
                  error={fieldState.error?.message}
                />
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="delivery_address.area"
                control={form.control}
                render={({ field }) => (
                  <Input {...field} label="Area / Estate" surface="light" />
                )}
              />
              <Controller
                name="delivery_address.landmark"
                control={form.control}
                render={({ field }) => (
                  <Input
                    {...field}
                    label="Landmark"
                    placeholder="Near..."
                    surface="light"
                  />
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="delivery_address.city"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Input
                    {...field}
                    label="City *"
                    surface="light"
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                name="delivery_address.state"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Input
                    {...field}
                    label="State *"
                    surface="light"
                    error={fieldState.error?.message}
                  />
                )}
              />
            </div>
          </div>

          {/* Right — courier + fee */}
          <div className="space-y-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-text-on-light-muted">
              Courier
            </p>

            <CourierSuggestPanel
              address={watchedAddress as DeliveryAddress}
              selected={form.watch("courier")}
              onSelect={(courier: Courier) => form.setValue("courier", courier)}
              currency={currency}
            />

            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="delivery_fee"
                control={form.control}
                render={({ field }) => (
                  <NumberField
                    surface="light"
                    decimal
                    label="Delivery Fee (₦)"
                    placeholder="0.00"
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <Controller
                name="fee_borne_by"
                control={form.control}
                render={({ field }) => (
                  <Select
                    label="Fee paid by"
                    options={FEE_BEARER_OPTIONS}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    surface="light"
                  />
                )}
              />
            </div>
            <p className="text-[0.65rem] text-text-on-light-muted">
              You'll enter the driver's name and number when you dispatch.
            </p>
          </div>
        </div>

        {/* Items — standalone deliveries list their own contents */}
        {isStandalone && (
          <div className="space-y-3">
            <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-text-on-light-muted">
              What's being delivered? *
            </p>
            {fields.map((f, i) => (
              <div
                key={f.id}
                className="rounded-xl border border-brand-cloud/40 p-3 space-y-2.5"
              >
                <CatalogueSearchInput
                  surface="light"
                  currency={currency}
                  placeholder="Search the catalogue (optional)…"
                  instanceKey={`delivery-${i}`}
                  onSelect={(p) => {
                    form.setValue(`items.${i}.product_id`, p.product_id);
                    form.setValue(`items.${i}.description`, p.name);
                  }}
                />
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Controller
                      name={`items.${i}.description`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <Input
                          {...field}
                          label="Item *"
                          placeholder="e.g. Rouge 500ml"
                          surface="light"
                          error={fieldState.error?.message}
                        />
                      )}
                    />
                  </div>
                  <Controller
                    name={`items.${i}.quantity`}
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <NumberField
                        surface="light"
                        label="Qty"
                        placeholder="1"
                        className="w-20"
                        value={field.value}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="p-2.5 mb-1 text-brand-black/40 hover:text-state-danger"
                      aria-label="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                append({ product_id: "", description: "", quantity: 1 })
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-cloud/60 py-2.5 text-xs font-medium text-brand-black/60 hover:border-brand-black/40 hover:text-brand-black"
            >
              <Plus className="w-3.5 h-3.5" />
              Add another item
            </button>
            {form.formState.errors.items && (
              <p className="text-xs text-state-danger">
                {form.formState.errors.items.message as string}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
