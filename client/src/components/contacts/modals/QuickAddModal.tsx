import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Mail, Phone, MessageCircle, ArrowUpRight } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Checkbox } from "@components/ui/Checkbox";
import {
  quickAddSchema,
  type QuickAddValues,
  CONTACT_TYPES,
  PRIORITY_LEVELS,
  CONTACT_SOURCES,
} from "@lib/schemas/contact";
import { createContact } from "@services/contacts/contacts";
import { listBusinesses } from "@services/settings/businesses";
import { useBusinessStore } from "@stores/useBusinessStore";
import { CONTACT_TYPE_META } from "@lib/constants/contactTypes";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { cn } from "@lib/cn";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-seed type chips (e.g. on /contacts?tab=staff click "Add Employee" → ['staff'] is preselected) */
  defaultType?: (typeof CONTACT_TYPES)[number];
  onCreated?: (contactId: string) => void;
}

export function QuickAddModal({
  open,
  onClose,
  defaultType,
  onCreated,
}: Props) {
  const qc = useQueryClient();
  const active = useBusinessStore((s) => s.active);

  const { data: businesses = [] } = useQuery({
    queryKey: ["settings", "businesses", "active"],
    queryFn: () => listBusinesses(false),
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QuickAddValues>({
    resolver: zodResolver(quickAddSchema),
    defaultValues: {
      display_name: "",
      contact_type: defaultType ? [defaultType] : ["customer"],
      primary_phone: "",
      whatsapp_number: "",
      email: "",
      visible_to: active ? [active] : [],
      priority_level: "regular",
      source: undefined,
      birthday_month: "",
      birthday_day: "",
    },
  });

  const selectedTypes = watch("contact_type");
  const visibleTo = watch("visible_to");

  const mutation = useMutation({
    mutationFn: (v: QuickAddValues) =>
      createContact({
        ...v,
        email: v.email || undefined,
        whatsapp_number: v.whatsapp_number || undefined,
        source: v.source || undefined,
        birthday_month: v.birthday_month || undefined,
        birthday_day: v.birthday_day || undefined,
      }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      showToast.success(
        "Contact added",
        `${c.display_name} is in the directory`,
      );
      reset();
      onClose();
      onCreated?.(c.contact_id);
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
      title="Quick add contact"
      description="Capture the essentials now — finish the full profile any time later."
      footer={
        <>
          <Link
            to="/contacts/new"
            onClick={() => {
              reset();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-widest uppercase text-brand-black/80 hover:text-brand-accent transition-colors mr-auto"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Open full form
          </Link>
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
            onClick={handleSubmit(
              (v) => mutation.mutate(v),
              (errs) => {
                const msg = Object.values(errs)
                  .map((e) => (e as { message?: string })?.message)
                  .find(Boolean);
                showToast.error(
                  "Check the form",
                  msg || "Some required fields need attention.",
                );
              },
            )}
          >
            Save & close
          </Button>
        </>
      }
    >
      <form
        onSubmit={handleSubmit(
          (v) => mutation.mutate(v),
          (errs) => {
            const msg = Object.values(errs)
              .map((e) => (e as { message?: string })?.message)
              .find(Boolean);
            showToast.error(
              "Check the form",
              msg || "Some required fields need attention.",
            );
          },
        )}
        noValidate
        className="space-y-4"
      >
        <Input
          {...register("display_name")}
          label="Display name"
          placeholder="Adaeze Okonkwo  ·  Bejewel Atelier  ·  ..."
          error={errors.display_name?.message}
          autoFocus
        />

        <div>
          <div className="text-[0.7rem] tracking-widest uppercase font-medium text-text-on-light-muted mb-2 ml-1">
            Type
          </div>
          <Controller
            control={control}
            name="contact_type"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {CONTACT_TYPES.map((t) => {
                  const m = CONTACT_TYPE_META[t];
                  const selected = field.value.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        if (selected)
                          field.onChange(field.value.filter((x) => x !== t));
                        else field.onChange([...field.value, t]);
                      }}
                      className={cn(
                        "inline-flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-semibold transition-all",
                        selected
                          ? "bg-brand-black text-brand-cream border-brand-black"
                          : "bg-white border-brand-cloud/40 text-brand-black/70 hover:border-brand-black/40",
                      )}
                      style={
                        selected
                          ? {
                              borderColor: m.ringColor,
                              boxShadow: `0 0 0 1px ${m.ringColor}`,
                            }
                          : {}
                      }
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: m.ringColor }}
                      />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            )}
          />
          {errors.contact_type && (
            <p className="mt-1.5 text-xs text-state-danger ml-1">
              {errors.contact_type.message}
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            {...register("primary_phone")}
            label="Primary phone"
            leftIcon={<Phone className="w-3.5 h-3.5" />}
            placeholder="+234 ..."
            error={errors.primary_phone?.message}
          />
          <Input
            {...register("whatsapp_number")}
            label="WhatsApp (optional)"
            leftIcon={<MessageCircle className="w-3.5 h-3.5" />}
            placeholder="+234 ..."
            error={errors.whatsapp_number?.message}
            hint="Leave blank if same as phone"
          />
        </div>

        <Input
          {...register("email")}
          type="email"
          label="Email (optional)"
          leftIcon={<Mail className="w-3.5 h-3.5" />}
          placeholder="hello@example.com"
          error={errors.email?.message}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            {...register("priority_level")}
            label="Priority"
            options={PRIORITY_LEVELS.map((p) => ({
              value: p,
              label:
                p === "vip" ? "VIP" : p.replace(/^./, (c) => c.toUpperCase()),
            }))}
          />
          {selectedTypes.includes("customer") && (
            <Select
              {...register("source")}
              label="How they found us"
              placeholder="Source (optional)"
              options={CONTACT_SOURCES.map((s) => ({
                value: s,
                label: s.replace("_", " "),
              }))}
            />
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            {...register("birthday_month")}
            label="Birthday month"
            options={[
              { value: "", label: "— Month —" },
              ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m })),
            ]}
          />
          <Select
            {...register("birthday_day")}
            label="Birthday day"
            options={[
              { value: "", label: "— Day —" },
              ...Array.from({ length: 31 }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              })),
            ]}
          />
        </div>

        <div>
          <div className="text-[0.7rem] tracking-widest uppercase font-medium text-text-on-light-muted mb-2 ml-1">
            Visible to business(es)
          </div>
          <Controller
            control={control}
            name="visible_to"
            render={({ field }) => (
              <div className="flex flex-wrap gap-3">
                {businesses.map((b) => (
                  <Checkbox
                    key={b.business_key}
                    surface="light"
                    checked={field.value.includes(b.business_key)}
                    onChange={(on) => {
                      if (on) field.onChange([...field.value, b.business_key]);
                      else
                        field.onChange(
                          field.value.filter((k) => k !== b.business_key),
                        );
                    }}
                    label={b.display_name}
                  />
                ))}
              </div>
            )}
          />
          {errors.visible_to && (
            <p className="mt-1.5 text-xs text-state-danger ml-1">
              {errors.visible_to.message}
            </p>
          )}
          {(visibleTo || []).length > 1 && (
            <p className="mt-2 text-[0.65rem] text-text-on-light-muted ml-1">
              This contact will appear under each selected business.
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
