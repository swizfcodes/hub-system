import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { NumberField } from "@components/ui/NumberField";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Switch } from "@components/ui/Switch";
import { Checkbox } from "@components/ui/Checkbox";
import { Modal } from "@components/ui/Modal";
import { WizardShell } from "@components/settings/business-setup/WizardShell";
import {
  staffOnboardSchema,
  type StaffOnboardValues,
} from "@lib/schemas/staff";
import { createStaff } from "@services/contacts/staff";
import { getContact } from "@services/contacts/contacts";
import { WEEK_DAYS } from "@components/hr/HrShared";
import type { DayMode, WorkSchedule } from "@services/hr";
import { ContactSearchInput } from "@components/shared/ContactSearchInput";
import type { Contact } from "@typedefs/contacts";
import { listStaff } from "@services/contacts/staff";
import { listBusinesses } from "@services/settings/businesses";
import { useBusinessStore } from "@stores/useBusinessStore";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { StaffOnboardResult } from "@typedefs/staff";

const STEPS = [
  { key: "person", label: "Person", description: "Who they are" },
  { key: "employment", label: "Employment", description: "Job, dept, dates" },
  { key: "financial", label: "Financial", description: "Salary, bank, IDs" },
  { key: "access", label: "Access", description: "Login & businesses" },
];

// Keep in sync with DEPARTMENT_OPTIONS in EditStaffModal.tsx — a staff
// member must stay editable in whatever department they were hired into.
const DEPARTMENTS = [
  { value: "management", label: "Management" },
  { value: "sales", label: "Sales" },
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "logistics", label: "Logistics" },
  { value: "marketing", label: "Marketing" },
  { value: "hr", label: "Human Resources" },
  { value: "it", label: "IT" },
  { value: "customer_service", label: "Customer Service" },
];

// Derive the overall arrangement from the weekly day pattern: all working
// days remote → remote, all on-site → on_site, otherwise hybrid.
function deriveArrangement(ws: WorkSchedule): "on_site" | "remote" | "hybrid" {
  const modes = Object.values(ws).filter((m) => m && m !== "off") as DayMode[];
  if (!modes.length) return "on_site";
  if (modes.every((m) => m === "remote")) return "remote";
  if (modes.every((m) => m === "on_site")) return "on_site";
  return "hybrid";
}

export default function StaffOnboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const active = useBusinessStore((s) => s.active);
  const [stepIndex, setStepIndex] = useState(0);
  // Work schedule set at onboarding — defaults to Mon–Fri on-site.
  const [workSchedule, setWorkSchedule] = useState<WorkSchedule>({
    mon: "on_site",
    tue: "on_site",
    wed: "on_site",
    thu: "on_site",
    fri: "on_site",
    sat: "off",
    sun: "off",
  });
  const [expectedStart, setExpectedStart] = useState("09:00");
  const [graceMinutes, setGraceMinutes] = useState("15");
  const [credentials, setCredentials] =
    useState<StaffOnboardResult["credentials"]>(null);
  // Onboarding an existing directory contact (e.g. from their profile's
  // "Onboard as employee" action, via ?contact_id=...).
  const [linkedContact, setLinkedContact] = useState<Contact | null>(null);
  const prefillContactId = params.get("contact_id");
  useQuery({
    queryKey: ["contacts", "prefill", prefillContactId],
    queryFn: async () => {
      const c = await getContact(prefillContactId!);
      setLinkedContact(c);
      return c;
    },
    enabled: !!prefillContactId && !linkedContact,
  });

  const { data: businesses = [] } = useQuery({
    queryKey: ["settings", "businesses", "active"],
    queryFn: () => listBusinesses(false),
  });
  const { data: staffList } = useQuery({
    queryKey: ["staff", "all-200"],
    queryFn: () => listStaff({ limit: 200 }),
  });

  const form = useForm<StaffOnboardValues>({
    resolver: zodResolver(staffOnboardSchema),
    defaultValues: {
      contact_id: params.get("contact_id") ?? "",
      first_name: "",
      last_name: "",
      primary_phone: "",
      whatsapp_number: "",
      email: "",
      employee_number: "",
      business: active ?? "",
      department: "",
      job_title: "",
      employment_type: "full_time",
      start_date: new Date().toISOString().slice(0, 10),
      reports_to: "",
      base_salary: 0,
      bank_name: "",
      bank_account_number: "",
      bank_sort_code: "",
      nin: "",
      bvn: "",
      pension_pin: "",
      nhf_number: "",
      tax_id: "",
      create_login: true,
      permitted_businesses: active ? [active] : [],
      visible_to: [],
    },
    mode: "onBlur",
  });

  const {
    register,
    control,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const createLogin = watch("create_login");
  const businessKey = watch("business");

  const mutation = useMutation({
    mutationFn: (v: StaffOnboardValues) =>
      createStaff({
        ...v,
        contact_id: v.contact_id || undefined,
        first_name: v.first_name || undefined,
        last_name: v.last_name || undefined,
        primary_phone: v.primary_phone || undefined,
        whatsapp_number: v.whatsapp_number || undefined,
        email: v.email || undefined,
        department: v.department || undefined,
        reports_to: v.reports_to || undefined,
        bank_name: v.bank_name || undefined,
        bank_account_number: v.bank_account_number || undefined,
        bank_sort_code: v.bank_sort_code || undefined,
        nin: v.nin || undefined,
        bvn: v.bvn || undefined,
        pension_pin: v.pension_pin || undefined,
        nhf_number: v.nhf_number || undefined,
        tax_id: v.tax_id || undefined,
        // Work schedule — derive the arrangement from the picked days.
        work_schedule: workSchedule,
        work_location_type: deriveArrangement(workSchedule),
        expected_start_time: expectedStart || undefined,
        grace_minutes: Number(graceMinutes) || 0,
      }) as Promise<StaffOnboardResult>,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
      showToast.success(
        "Staff onboarded",
        `Employee number ${result.profile.employee_number}`,
      );
      if (result.credentials) setCredentials(result.credentials);
      else navigate(`/contacts/${result.profile.contact_id}`);
    },
    onError: (e) => showToast.error("Could not onboard", errMsg(e)),
  });

  const STEP_FIELDS: Record<string, Array<keyof StaffOnboardValues>> = {
    person: ["contact_id", "first_name", "last_name", "primary_phone", "email"],
    employment: [
      "business",
      "job_title",
      "employment_type",
      "start_date",
    ],
    financial: ["base_salary"],
    access: ["create_login", "permitted_businesses"],
  };

  const next = async () => {
    const ok = await trigger(STEP_FIELDS[STEPS[stepIndex].key]);
    if (!ok) return;
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
    else handleSubmit((v) => mutation.mutate(v))();
  };

  const onCredentialsAcknowledged = () => {
    navigate("/contacts");
  };

  return (
    <>
      <Topbar
        title="Staff onboarding"
        subtitle="Create employee + contact + login"
      />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl mx-auto">
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Directory", to: "/contacts" },
              { label: "Staff Onboarding" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ChevronLeft className="w-4 h-4" />}
            onClick={() => navigate("/contacts")}
          >
            Cancel
          </Button>
        </div>

        <header className="mb-8">
          <p className="text-[0.7rem] tracking-[0.18em] uppercase text-brand-accent mb-2">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
          <h1 className="font-display font-light text-3xl sm:text-4xl text-brand-cream">
            New <span className="italic text-brand-accent">team member</span>
          </h1>
        </header>

        <form onSubmit={(e) => e.preventDefault()} noValidate>
          <WizardShell
            steps={STEPS}
            currentIndex={stepIndex}
            onStepClick={(i) => i <= stepIndex && setStepIndex(i)}
            footer={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  disabled={stepIndex === 0}
                  onClick={() => setStepIndex(stepIndex - 1)}
                  leftIcon={<ChevronLeft className="w-4 h-4" />}
                >
                  Back
                </Button>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline-light"
                    onClick={() => navigate("/contacts")}
                  >
                    Save & exit
                  </Button>
                  <Button
                    type="button"
                    variant="gold"
                    onClick={next}
                    rightIcon={<ChevronRight className="w-4 h-4" />}
                    loading={mutation.isPending}
                  >
                    {stepIndex === STEPS.length - 1 ? "Onboard" : "Continue"}
                  </Button>
                </div>
              </>
            }
          >
            {/* Step 1 — Person */}
            {stepIndex === 0 && (
              <div className="space-y-6">
                <header>
                  <h2 className="font-display font-light text-3xl text-brand-black">
                    Person
                  </h2>
                  <p className="text-sm text-text-on-light-muted mt-1.5">
                    Either link an existing contact, or fill in the basics to
                    create one.
                  </p>
                </header>

                <div className="rounded-2xl border border-brand-cloud/40 bg-white/50 p-5">
                  <ContactSearchInput
                    value={linkedContact}
                    onChange={(c) => {
                      setLinkedContact(c);
                      setValue("contact_id", c?.contact_id ?? "");
                      if (c?.email) setValue("email", c.email);
                    }}
                    label="Link to existing contact (optional)"
                  />
                  <p className="mt-2 text-[0.65rem] text-text-on-light-muted">
                    Pick someone already in the directory (a converted
                    customer, for example) — or leave empty and fill the
                    fields below to create them fresh.
                  </p>
                </div>

                {linkedContact ? (
                  <div className="rounded-2xl border border-brand-accent/30 bg-brand-accent/[0.05] p-4 text-sm text-brand-black">
                    Onboarding <strong>{linkedContact.display_name}</strong>
                    {linkedContact.primary_phone
                      ? ` · ${linkedContact.primary_phone}`
                      : ""}
                    {linkedContact.email ? ` · ${linkedContact.email}` : ""} —
                    their existing contact details will be used.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      {...register("first_name")}
                      label="First name"
                      error={errors.first_name?.message as string | undefined}
                    />
                    <Input {...register("last_name")} label="Last name" />
                    <Input
                      {...register("primary_phone")}
                      label="Primary phone"
                    />
                    <Input {...register("whatsapp_number")} label="WhatsApp" />
                    <Input
                      {...register("email")}
                      type="email"
                      label="Email"
                      className="sm:col-span-2"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Step 2 — Employment */}
            {stepIndex === 1 && (
              <div className="space-y-6">
                <header>
                  <h2 className="font-display font-light text-3xl text-brand-black">
                    Employment
                  </h2>
                  <p className="text-sm text-text-on-light-muted mt-1.5">
                    Job role, department, and reporting line.
                  </p>
                </header>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    {...register("business")}
                    label="Primary business"
                    options={businesses.map((b) => ({
                      value: b.business_key,
                      label: b.display_name,
                    }))}
                  />
                  <Input
                    {...register("job_title")}
                    label="Job title"
                    error={errors.job_title?.message}
                  />
                  <Select
                    {...register("department")}
                    label="Department"
                    placeholder="—"
                    options={DEPARTMENTS}
                  />
                  <Select
                    {...register("employment_type")}
                    label="Employment type"
                    options={[
                      { value: "full_time", label: "Full time" },
                      { value: "part_time", label: "Part time" },
                      { value: "contract", label: "Contract" },
                    ]}
                  />
                  <Input
                    {...register("start_date")}
                    type="date"
                    label="Start date"
                    error={errors.start_date?.message}
                  />
                  <Select
                    {...register("reports_to")}
                    label="Reports to (optional)"
                    placeholder="—"
                    options={(staffList?.data ?? [])
                      .filter((s) => s.business === businessKey)
                      .map((s) => ({
                        value: s.profile_id,
                        label: `${s.display_name} · ${s.job_title}`,
                      }))}
                    className="sm:col-span-2"
                  />
                </div>

                {/* Work schedule — set where they work each day on hire */}
                <div className="rounded-2xl border border-white/5 bg-brand-charcoal/40 p-4">
                  <h4 className="text-sm font-semibold text-brand-cream">
                    Work schedule
                  </h4>
                  <p className="mb-3 text-xs text-brand-smoke">
                    Set on-site / remote / off days. Attendance only expects a
                    clock-in on working days; office days are geofence-checked.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                    {WEEK_DAYS.map(({ key, label }) => (
                      <div key={key} className="rounded-xl border border-white/5 p-2">
                        <div className="mb-1 text-center text-xs font-semibold text-brand-cream">
                          {label}
                        </div>
                        <div className="flex flex-col gap-1">
                          {(
                            [
                              { value: "on_site", label: "Office" },
                              { value: "remote", label: "Remote" },
                              { value: "off", label: "Off" },
                            ] as { value: DayMode; label: string }[]
                          ).map((m) => {
                            const selected = (workSchedule[key] || "off") === m.value;
                            return (
                              <button
                                key={m.value}
                                type="button"
                                onClick={() =>
                                  setWorkSchedule((s) => ({ ...s, [key]: m.value }))
                                }
                                className={
                                  "rounded-md px-1.5 py-1 text-[0.65rem] transition-colors " +
                                  (selected
                                    ? "bg-accent3 text-brand-black font-semibold"
                                    : "bg-brand-graphite/50 text-brand-smoke hover:bg-brand-graphite")
                                }
                              >
                                {m.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-xs">
                    <Input
                      type="time"
                      label="Expected start"
                      value={expectedStart}
                      onChange={(e) => setExpectedStart(e.target.value)}
                    />
                    <Input
                      type="number"
                      min={0}
                      label="Grace (min)"
                      value={graceMinutes}
                      onChange={(e) => setGraceMinutes(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3 — Financial */}
            {stepIndex === 2 && (
              <div className="space-y-6">
                <header>
                  <h2 className="font-display font-light text-3xl text-brand-black">
                    Financial & ID
                  </h2>
                  <p className="text-sm text-text-on-light-muted mt-1.5">
                    All sensitive fields below are encrypted at rest. Only HR
                    and the employee themselves can read them.
                  </p>
                </header>

                <div className="rounded-xl border border-state-warn/30 bg-state-warn/[0.06] p-3 flex items-start gap-2 text-xs text-brand-black/80">
                  <Sparkles className="w-3.5 h-3.5 text-state-warn mt-0.5 shrink-0" />
                  <p>
                    Filling base salary creates an initial contract record
                    automatically.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Controller
                    control={control}
                    name="base_salary"
                    render={({ field, fieldState }) => (
                      <NumberField
                        decimal
                        label="Base salary (NGN, gross)"
                        placeholder="0.00"
                        value={field.value}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                  <Input {...register("bank_name")} label="Bank name" />
                  <Input
                    {...register("bank_account_number")}
                    label="Bank account number"
                  />
                  <Input {...register("bank_sort_code")} label="Sort code" />
                  <Input {...register("nin")} label="NIN (National ID)" />
                  <Input {...register("bvn")} label="BVN" />
                  <Input {...register("pension_pin")} label="Pension PIN" />
                  <Input {...register("nhf_number")} label="NHF" />
                  <Input
                    {...register("tax_id")}
                    label="Tax ID"
                    className="sm:col-span-2"
                  />
                </div>
              </div>
            )}

            {/* Step 4 — Access */}
            {stepIndex === 3 && (
              <div className="space-y-6">
                <header>
                  <h2 className="font-display font-light text-3xl text-brand-black">
                    Access
                  </h2>
                  <p className="text-sm text-text-on-light-muted mt-1.5">
                    Optionally provision a Hub login. A temporary password is
                    generated and shown to you exactly once.
                  </p>
                </header>

                <Controller
                  control={control}
                  name="create_login"
                  render={({ field }) => (
                    <div className="p-4 rounded-2xl bg-white/50 border border-brand-cloud/40">
                      <Switch
                        surface="light"
                        checked={!!field.value}
                        onChange={field.onChange}
                        label="Provision a Hub login for this person"
                        description="Required if they need to sign in. Otherwise skip."
                      />
                    </div>
                  )}
                />

                {createLogin && (
                  <div className="space-y-4 animate-slide-down">
                    <div>
                      <div className="text-[0.7rem] tracking-widest uppercase font-medium text-text-on-light-muted mb-2 ml-1">
                        Permitted businesses
                      </div>
                      <Controller
                        control={control}
                        name="permitted_businesses"
                        render={({ field }) => (
                          <div className="flex flex-wrap gap-3">
                            {businesses.map((b) => (
                              <Checkbox
                                key={b.business_key}
                                surface="light"
                                checked={(field.value ?? []).includes(
                                  b.business_key,
                                )}
                                onChange={(on) => {
                                  const next = on
                                    ? [...(field.value ?? []), b.business_key]
                                    : (field.value ?? []).filter(
                                        (k) => k !== b.business_key,
                                      );
                                  field.onChange(next);
                                }}
                                label={b.display_name}
                              />
                            ))}
                          </div>
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </WizardShell>
        </form>
      </div>

      {/* Credentials reveal (shown once) */}
      <Modal
        open={!!credentials}
        onClose={onCredentialsAcknowledged}
        surface="light"
        size="md"
        title={
          <span className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-brand-accent/15 text-brand-accent flex items-center justify-center">
              <Check className="w-4 h-4" />
            </span>
            Temporary password
          </span>
        }
        description="Shown once. Share securely with the new hire; they'll be forced to set a new one at first sign-in."
        footer={
          <Button variant="primary" onClick={onCredentialsAcknowledged}>
            I've saved it
          </Button>
        }
      >
        {credentials && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-state-warn/[0.08] border border-state-warn/30 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-state-warn mt-0.5 shrink-0" />
              <p className="text-xs text-brand-black/80">
                Copy this password now. You can't see it again.
              </p>
            </div>
            <div>
              <div className="text-[0.65rem] tracking-widest uppercase text-text-on-light-muted ml-1 mb-2">
                Email
              </div>
              <code className="block w-full px-3 py-2.5 bg-white border border-brand-cloud/40 rounded-xl text-sm text-brand-black">
                {credentials.email}
              </code>
            </div>
            <div>
              <div className="text-[0.65rem] tracking-widest uppercase text-text-on-light-muted ml-1 mb-2">
                Temporary password
              </div>
              <div className="relative">
                <code className="block w-full px-3 py-2.5 bg-white border border-brand-cloud/40 rounded-xl text-sm font-mono text-brand-black tracking-wider pr-12">
                  {credentials.temp_password}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(credentials.temp_password);
                    showToast.success("Copied");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-brand-smoke hover:text-brand-black hover:bg-brand-cloud/30 rounded-lg transition-colors"
                  aria-label="Copy"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
