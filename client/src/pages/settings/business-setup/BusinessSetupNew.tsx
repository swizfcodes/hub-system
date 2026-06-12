import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Button } from "@components/ui/Button";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { ConfirmationModal } from "@components/ui/ConfirmationModal";
import { WizardShell } from "@components/settings/business-setup/WizardShell";
import { StepIdentity } from "@components/settings/business-setup/steps/StepIdentity";
import { StepBranding } from "@components/settings/business-setup/steps/StepBranding";
import { StepFinancial } from "@components/settings/business-setup/steps/StepFinancial";
import { StepLocalisation } from "@components/settings/business-setup/steps/StepLocalisation";
import { StepProvisioning } from "@components/settings/business-setup/steps/StepProvisioning";
import {
  stepIdentitySchema,
  stepBrandingSchema,
  stepFinancialSchema,
  stepLocalisationSchema,
  stepProvisioningSchema,
  businessCreateSchema,
  type BusinessCreateValues,
} from "@lib/schemas/business";
import { createBusiness } from "@services/settings/businesses";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

const STEPS = [
  {
    key: "identity",
    label: "Identity",
    description: "Names, contact, registration",
    schema: stepIdentitySchema,
  },
  {
    key: "branding",
    label: "Branding",
    description: "Logo, accent, mission",
    schema: stepBrandingSchema,
  },
  {
    key: "financial",
    label: "Financial",
    description: "Currency, fiscal, tax",
    schema: stepFinancialSchema,
  },
  {
    key: "localisation",
    label: "Localisation",
    description: "Payments, cash rules",
    schema: stepLocalisationSchema,
  },
  {
    key: "provisioning",
    label: "Provisioning",
    description: "Schema & sequences",
    schema: stepProvisioningSchema,
  },
];

export default function BusinessSetupNew() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const form = useForm<BusinessCreateValues>({
    resolver: zodResolver(businessCreateSchema),
    mode: "onBlur",
    defaultValues: {
      business_key: "",
      display_name: "",
      legal_name: "",
      email: "",
      phone: "",
      website: "",
      address: "",
      tin: "",
      cac_number: "",
      logo_path: "",
      accent_colour: "#C9A86C",
      mission_statement: "",
      default_currency: "NGN",
      fiscal_year_start: 1,
      vat_rate: 0.075,
      wht_rate: 0.05,
      vat_number: "",
      payment_methods: {
        card: true,
        transfer: true,
        cash: true,
        mobile_money: false,
        cheque: false,
        paystack: false,
        flutterwave: false,
      },
      cash_handling_rules: {},
      provision_schema: true,
      prefix: "",
    },
  });

  const {
    register,
    control,
    formState: { errors },
    trigger,
    watch,
    handleSubmit,
  } = form;
  const provisionSchema = watch("provision_schema");
  const businessKey = watch("business_key");

  const createMutation = useMutation({
    mutationFn: (values: BusinessCreateValues) =>
      createBusiness({
        ...values,
        // Empty strings → null so backend treats unset fields correctly
        email: values.email || undefined,
        phone: values.phone || undefined,
        website: values.website || undefined,
        address: values.address || undefined,
        tin: values.tin || undefined,
        cac_number: values.cac_number || undefined,
        vat_number: values.vat_number || undefined,
        mission_statement: values.mission_statement || undefined,
        logo_path: values.logo_path || undefined,
        prefix: values.prefix || undefined,
      }),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["settings", "businesses"] });
      showToast.success(
        `${b.display_name} created`,
        provisionSchema
          ? "Schema provisioned successfully."
          : "Configuration saved.",
      );
      navigate(`/settings/business-setup/${b.business_key}`);
    },
    onError: (e) => showToast.error("Could not create business", errMsg(e)),
  });

  const handleNext = async () => {
    // Validate just the fields belonging to the current step.
    const stepSchema = STEPS[stepIndex].schema;
    const stepFields = Object.keys((stepSchema as any).shape) as Array<
      keyof BusinessCreateValues
    >;
    const valid = await trigger(stepFields);
    if (!valid) return;
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
    else setConfirmOpen(true);
  };

  const handleSubmitFinal = handleSubmit((values) => {
    setConfirmOpen(false);
    createMutation.mutate(values);
  });

  return (
    <>
      <Topbar title="New Business" subtitle="Set up a new business line" />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Settings", to: "/settings" },
              { label: "Business Setup", to: "/settings/business-setup" },
              { label: "New" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<X className="w-4 h-4" />}
            onClick={() => navigate("/settings/business-setup")}
          >
            Cancel
          </Button>
        </div>

        <header className="mb-8">
          <p className="text-[0.7rem] tracking-[0.18em] uppercase text-brand-accent mb-2">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
          <h1 className="font-display font-light text-3xl sm:text-4xl text-brand-cream">
            New <span className="italic text-brand-accent">business line</span>
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
                    onClick={() => navigate("/settings/business-setup")}
                  >
                    Save & exit
                  </Button>
                  <Button
                    type="button"
                    variant="gold"
                    onClick={handleNext}
                    rightIcon={<ChevronRight className="w-4 h-4" />}
                    loading={createMutation.isPending}
                  >
                    {stepIndex === STEPS.length - 1
                      ? "Review & Create"
                      : "Continue"}
                  </Button>
                </div>
              </>
            }
          >
            {stepIndex === 0 && (
              <StepIdentity register={register} errors={errors} />
            )}
            {stepIndex === 1 && (
              <StepBranding
                control={control}
                register={register}
                errors={errors}
                businessKey={businessKey}
              />
            )}
            {stepIndex === 2 && (
              <StepFinancial control={control} register={register} errors={errors} />
            )}
            {stepIndex === 3 && (
              <StepLocalisation control={control} />
            )}
            {stepIndex === 4 && (
              <StepProvisioning
                control={control}
                register={register}
                errors={errors}
                provisionSchema={!!provisionSchema}
              />
            )}
          </WizardShell>
        </form>
      </div>

      <ConfirmationModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSubmitFinal}
        title="Create this business?"
        message={
          <div className="space-y-3">
            <p>
              Ready to create <strong>{watch("display_name")}</strong>
              {watch("legal_name") && <> ({watch("legal_name")})</>}.
            </p>
            {provisionSchema ? (
              <div className="rounded-lg bg-brand-accent/[0.08] border border-brand-accent/30 p-3 text-xs text-brand-black/80">
                <strong>Full provisioning</strong> will create the{" "}
                <code className="font-mono bg-brand-cream/60 px-1 rounded">
                  {watch("business_key")}
                </code>{" "}
                Postgres schema and run every template migration. This isn't
                reversible without manual SQL.
              </div>
            ) : (
              <p className="text-text-on-light-muted">
                Only the configuration row will be written — no schema changes.
              </p>
            )}
          </div>
        }
        tone={provisionSchema ? "danger" : "warn"}
        confirmPhrase={provisionSchema ? watch("business_key") : undefined}
        confirmLabel={provisionSchema ? "Provision now" : "Create"}
        loading={createMutation.isPending}
      />
    </>
  );
}
