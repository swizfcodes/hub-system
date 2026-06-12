import { useNavigate, Link } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Mail,
  Phone,
  MessageCircle,
  ChevronLeft,
  UserPlus,
  Sparkles,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { Checkbox } from "@components/ui/Checkbox";
import {
  contactPatchSchema,
  PRIORITY_LEVELS,
  CONTACT_SOURCES,
  CONTACT_TYPES,
} from "@lib/schemas/contact";
import { z } from "zod";
import { createContact } from "@services/contacts/contacts";
import { listBusinesses } from "@services/settings/businesses";
import { useBusinessStore } from "@stores/useBusinessStore";
import { CONTACT_TYPE_META } from "@lib/constants/contactTypes";
import { showToast } from "@hooks/useToast";
import { api, errMsg } from "@services/api";
import { cn } from "@lib/cn";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// Full-form schema combines basic + visibility + multi-type.
const fullSchema = contactPatchSchema.extend({
  contact_type: z.array(z.enum(CONTACT_TYPES)).min(1, "Pick at least one type"),
  visible_to: z.array(z.string()).min(1, "Pick at least one business"),
  whatsapp_number: z.string().optional().or(z.literal("")),
});
type FullValues = z.infer<typeof fullSchema>;

export default function ContactNew() {
  const navigate = useNavigate();
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
    formState: { errors, isSubmitting },
  } = useForm<FullValues>({
    resolver: zodResolver(fullSchema),
    defaultValues: {
      display_name: "",
      first_name: "",
      last_name: "",
      company_name: "",
      primary_phone: "",
      whatsapp_number: "",
      email: "",
      priority_level: "regular",
      source: "",
      notes: "",
      birthday_month: "",
      birthday_day: "",
      contact_type: ["customer"],
      visible_to: active ? [active] : [],
    },
  });

  const types = watch("contact_type");

  const mutation = useMutation({
    mutationFn: async (v: FullValues) => {
      const contact = await createContact({
        ...v,
        first_name: v.first_name || undefined,
        last_name: v.last_name || undefined,
        company_name: v.company_name || undefined,
        whatsapp_number: v.whatsapp_number || undefined,
        email: v.email || undefined,
        source: (v.source as never) || undefined,
        notes: v.notes || undefined,
        birthday_month: v.birthday_month || undefined,
        birthday_day: v.birthday_day || undefined,
      });
      // Connected creation: a supplier-typed contact gets its procurement
      // record immediately (idempotent endpoint), so the type is never an
      // empty label.
      if (v.contact_type.includes("supplier")) {
        try {
          await api.post(
            `/purchasing/suppliers/from-contact/${contact.contact_id}`,
          );
        } catch {
          /* supplier record can still be activated from the profile */
        }
      }
      return contact;
    },
    onSuccess: (c, v) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      showToast.success(
        `${c.display_name} created`,
        v.contact_type.includes("retail_partner")
          ? "Open the Partnership tab to set up their terms."
          : undefined,
      );
      navigate(`/contacts/${c.contact_id}`);
    },
    onError: (e) => showToast.error("Could not save", errMsg(e)),
  });

  const isStaffType = types.includes("staff");

  // Employees are created through the onboarding wizard — a bare
  // 'staff'-typed contact with no employee profile is a ghost record.
  function submit(v: FullValues) {
    if (v.contact_type.includes("staff")) {
      showToast.error(
        "Use Staff Onboarding for employees",
        "It creates the contact, employee profile and login together.",
      );
      navigate("/contacts/staff/new");
      return;
    }
    mutation.mutate(v);
  }

  return (
    <>
      <Topbar title="New Contact" subtitle="Full profile" />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-4xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Directory", to: "/contacts" },
              { label: "New" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ChevronLeft className="w-4 h-4" />}
            onClick={() => navigate("/contacts")}
          >
            Back
          </Button>
        </div>

        <header className="mb-8">
          <p className="text-[0.7rem] tracking-[0.18em] uppercase text-brand-accent mb-2">
            New contact · Full form
          </p>
          <h1 className="font-display font-light text-3xl sm:text-4xl text-brand-cream">
            Add a <span className="italic text-brand-accent">contact</span>
          </h1>
        </header>

        {isStaffType && (
          <div className="mb-6 rounded-2xl border border-brand-accent/30 bg-brand-accent/[0.05] p-4 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-brand-accent mt-0.5 shrink-0" />
            <div className="text-sm text-brand-cream">
              <p>
                You're adding a contact with the <strong>Employee</strong> type.
                For full HR onboarding (employee number, salary, login, etc.)
                use the dedicated{" "}
                <Link
                  to="/contacts/staff/new"
                  className="text-brand-accent underline hover:text-brand-cream"
                >
                  Staff Onboarding
                </Link>{" "}
                wizard instead — it creates the contact <em>and</em> the staff
                profile in one step.
              </p>
            </div>
          </div>
        )}

        <div className="bg-surface-light surface-light rounded-3xl p-6 sm:p-10 border border-brand-cloud/30 shadow-lift">
          <form className="space-y-6">
            {/* Type chips */}
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
                              field.onChange(
                                field.value.filter((x) => x !== t),
                              );
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

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                {...register("display_name")}
                label="Display name"
                error={errors.display_name?.message}
              />
              <Input
                {...register("company_name")}
                label="Company / Organisation (optional)"
              />
              <Input {...register("first_name")} label="First name" />
              <Input {...register("last_name")} label="Last name" />
              <Input
                {...register("primary_phone")}
                label="Primary phone"
                leftIcon={<Phone className="w-3.5 h-3.5" />}
                error={errors.primary_phone?.message}
              />
              <Input
                {...register("whatsapp_number")}
                label="WhatsApp"
                leftIcon={<MessageCircle className="w-3.5 h-3.5" />}
                hint="Leave blank if same as phone"
              />
              <Input
                {...register("email")}
                type="email"
                label="Email"
                leftIcon={<Mail className="w-3.5 h-3.5" />}
                error={errors.email?.message}
              />
              <Select
                {...register("priority_level")}
                label="Priority"
                options={PRIORITY_LEVELS.map((p) => ({
                  value: p,
                  label:
                    p === "vip"
                      ? "VIP"
                      : p.replace(/^./, (c) => c.toUpperCase()),
                }))}
              />
              <Select
                {...register("source")}
                label="How they found us"
                options={[
                  { value: "", label: "Unknown" },
                  ...CONTACT_SOURCES.map((s) => ({
                    value: s,
                    label: s.replace("_", " "),
                  })),
                ]}
              />
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

            <Textarea
              {...register("notes")}
              label="Internal notes (optional)"
              rows={4}
            />

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
                          if (on)
                            field.onChange([...field.value, b.business_key]);
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
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline-light"
                type="button"
                onClick={() => navigate("/contacts")}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="button"
                leftIcon={<UserPlus className="w-4 h-4" />}
                loading={isSubmitting || mutation.isPending}
                onClick={handleSubmit(submit)}
              >
                Create contact
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
