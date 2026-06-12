import {
  UseFormRegister,
  FieldErrors,
  Controller,
  Control,
} from "react-hook-form";
import type { BusinessCreateValues } from "@lib/schemas/business";
import { Textarea } from "@components/ui/Textarea";
import { LogoDropZone } from "../LogoDropZone";
import { BrandColorPicker } from "../BrandColorPicker";

interface Props {
  control: Control<BusinessCreateValues>;
  register: UseFormRegister<BusinessCreateValues>;
  errors: FieldErrors<BusinessCreateValues>;
  businessKey: string;
}

export function StepBranding({
  control,
  register,
  errors,
  businessKey,
}: Props) {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display font-light text-3xl text-brand-black">
          Branding
        </h2>
        <p className="text-sm text-text-on-light-muted mt-1.5">
          A logo, an accent colour and a sentence to set the tone.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Controller
          name="logo_path"
          control={control}
          render={({ field }) => (
            <LogoDropZone
              value={field.value}
              onChange={field.onChange}
              businessKey={businessKey}
            />
          )}
        />

        <Controller
          name="accent_colour"
          control={control}
          render={({ field }) => (
            <BrandColorPicker
              value={field.value || "#C9A86C"}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      <Textarea
        {...register("mission_statement")}
        label="Mission statement"
        placeholder="A single luminous sentence about what this business stands for."
        hint="Up to 280 characters. Shown on PDFs, customer-facing emails, and the business profile."
        error={errors.mission_statement?.message as string | undefined}
      />
    </div>
  );
}
