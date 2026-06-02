import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import {
  contactPatchSchema,
  PRIORITY_LEVELS,
  CONTACT_SOURCES,
  type ContactPatchValues,
} from "@lib/schemas/contact";
import { updateContact } from "@services/contacts/contacts";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { Contact } from "@typedefs/contacts";

export function EditContactPanel({
  open,
  onClose,
  contact,
}: {
  open: boolean;
  onClose: () => void;
  contact: Contact;
}) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ContactPatchValues>({
    resolver: zodResolver(contactPatchSchema),
    defaultValues: {
      display_name: contact.display_name,
      first_name: contact.first_name ?? "",
      last_name: contact.last_name ?? "",
      company_name: contact.company_name ?? "",
      primary_phone: contact.primary_phone,
      whatsapp_number: contact.whatsapp_number ?? "",
      email: contact.email ?? "",
      priority_level: contact.priority_level,
      source: contact.source ?? "",
      notes: contact.notes ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (v: ContactPatchValues) =>
      updateContact(contact.contact_id, {
        ...v,
        first_name: v.first_name || undefined,
        last_name: v.last_name || undefined,
        company_name: v.company_name || undefined,
        whatsapp_number: v.whatsapp_number || undefined,
        email: v.email || undefined,
        source: (v.source as Contact["source"]) || undefined,
        notes: v.notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", contact.contact_id] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      showToast.success("Saved");
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
      size="lg"
      title="Edit contact"
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
            disabled={!isDirty}
            loading={mutation.isPending}
            onClick={handleSubmit((v) => mutation.mutate(v))}
          >
            Save changes
          </Button>
        </>
      }
    >
      <form className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            {...register("display_name")}
            label="Display name"
            error={errors.display_name?.message}
          />
          <Input {...register("company_name")} label="Company / Org" />
          <Input {...register("first_name")} label="First name" />
          <Input {...register("last_name")} label="Last name" />
          <Input
            {...register("primary_phone")}
            label="Primary phone"
            error={errors.primary_phone?.message}
          />
          <Input {...register("whatsapp_number")} label="WhatsApp" />
          <Input
            {...register("email")}
            type="email"
            label="Email"
            error={errors.email?.message}
          />
          <Select
            {...register("priority_level")}
            label="Priority"
            options={PRIORITY_LEVELS.map((p) => ({
              value: p,
              label:
                p === "vip" ? "VIP" : p.replace(/^./, (c) => c.toUpperCase()),
            }))}
          />
          <Select
            {...register("source")}
            label="Source"
            options={[
              { value: "", label: "—" },
              ...CONTACT_SOURCES.map((s) => ({
                value: s,
                label: s.replace("_", " "),
              })),
            ]}
          />
        </div>
        <Textarea {...register("notes")} label="Internal notes" rows={5} />
      </form>
    </Modal>
  );
}
