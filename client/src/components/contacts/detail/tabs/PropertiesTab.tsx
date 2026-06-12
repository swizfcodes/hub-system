import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, MapPin, Tag, Star, Check } from "lucide-react";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Switch } from "@components/ui/Switch";
import { Badge } from "@components/ui/Badge";
import { EmptyState } from "@components/ui/EmptyState";
import { addressSchema, type AddressValues } from "@lib/schemas/contact";
import { addAddress } from "@services/contacts/contacts";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { Contact } from "@typedefs/contacts";

export function PropertiesTab({ contact }: { contact: Contact }) {
  const [addingAddr, setAddingAddr] = useState(false);

  return (
    <div className="space-y-6">
      {/* Tags */}
      <section>
        <SectionHeader icon={<Tag className="w-3.5 h-3.5" />} title="Tags" />
        {(contact.tags ?? []).length === 0 ? (
          <p className="text-xs text-brand-smoke">No tags yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(contact.tags ?? []).map((t) => (
              <span
                key={t.tag_id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.65rem] font-medium border bg-brand-charcoal text-brand-cream"
                style={{ borderColor: `${t.colour}55` }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: t.colour }}
                />
                {t.tag_name}
                <span className="text-[0.55rem] text-brand-smoke">
                  ·{t.business}
                </span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Addresses */}
      <section>
        <SectionHeader
          icon={<MapPin className="w-3.5 h-3.5" />}
          title="Addresses"
          action={
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setAddingAddr(true)}
            >
              Add address
            </Button>
          }
        />
        {(contact.addresses ?? []).length === 0 ? (
          <EmptyState
            icon={<MapPin className="w-6 h-6" />}
            title="No addresses on file"
            description="Add delivery, billing, or office addresses."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(contact.addresses ?? []).map((a) => (
              <Card key={a.address_id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <Badge tone="neutral" size="xs">
                    {a.address_type}
                  </Badge>
                  {a.is_default && (
                    <Badge tone="gold" size="xs">
                      <Star className="w-3 h-3 fill-brand-accent" /> Default
                    </Badge>
                  )}
                </div>
                {a.recipient_name && (
                  <div className="text-xs text-brand-smoke">
                    {a.recipient_name}
                  </div>
                )}
                <div className="text-sm text-brand-cream">
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}
                </div>
                <div className="text-xs text-brand-cloud mt-0.5">
                  {[a.area, a.city, a.state].filter(Boolean).join(", ")}
                </div>
                {a.landmark && (
                  <div className="text-[0.65rem] text-brand-smoke mt-1">
                    Near {a.landmark}
                  </div>
                )}
                {a.is_verified && (
                  <div className="inline-flex items-center gap-1 mt-2 text-[0.6rem] text-accent2">
                    <Check className="w-3 h-3" /> Verified by delivery
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Notes */}
      {contact.notes && (
        <section>
          <SectionHeader title="Notes" />
          <Card className="p-4">
            <p className="text-sm text-brand-cloud whitespace-pre-line">
              {contact.notes}
            </p>
          </Card>
        </section>
      )}

      <AddAddressModal
        open={addingAddr}
        onClose={() => setAddingAddr(false)}
        contactId={contact.contact_id}
      />
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="inline-flex items-center gap-2 text-[0.65rem] tracking-widest uppercase text-brand-accent">
        {icon}
        {title}
      </h3>
      {action}
    </div>
  );
}

function AddAddressModal({
  open,
  onClose,
  contactId,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
}) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    control: _c,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      address_type: "delivery",
      line1: "",
      city: "Lagos",
      state: "Lagos",
      country: "Nigeria",
      is_default: false,
    },
  });

  const isDefault = watch("is_default");

  const mutation = useMutation({
    mutationFn: (v: AddressValues) => addAddress(contactId, v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", contactId] });
      showToast.success("Address added");
      reset();
      onClose();
    },
    onError: (e) => showToast.error("Could not save", errMsg(e)),
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
      title="Add address"
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
            Add address
          </Button>
        </>
      }
    >
      <form className="space-y-4">
        <Select
          {...register("address_type")}
          label="Address type"
          options={[
            { value: "delivery", label: "Delivery" },
            { value: "billing", label: "Billing" },
            { value: "office", label: "Office" },
            { value: "home", label: "Home" },
            { value: "other", label: "Other" },
          ]}
        />
        <Input
          {...register("line1")}
          label="Street address (line 1)"
          error={errors.line1?.message}
        />
        <Input {...register("line2")} label="Line 2 (optional)" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            {...register("area")}
            label="Area"
            placeholder="Victoria Island"
          />
          <Input
            {...register("city")}
            label="City"
            error={errors.city?.message}
          />
          <Input
            {...register("state")}
            label="State"
            error={errors.state?.message}
          />
          <Input {...register("country")} label="Country" />
        </div>
        <Input
          {...register("landmark")}
          label="Landmark (optional)"
          placeholder="Opposite Zenith Bank"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            {...register("recipient_name")}
            label="Recipient name (if different)"
          />
          <Input
            {...register("recipient_phone")}
            label="Recipient phone (if different)"
          />
        </div>
        <div className="p-3 rounded-xl bg-brand-cream/40 border border-brand-cloud/40">
          <Switch
            surface="light"
            checked={!!isDefault}
            onChange={(v) => setValue("is_default", v)}
            label="Default for this address type"
            description="Used as the default delivery/billing address"
          />
        </div>
      </form>
    </Modal>
  );
}
