import { UseFormRegister, FieldErrors } from "react-hook-form";
import type { BusinessCreateValues } from "@lib/schemas/business";
import { Input } from "@components/ui/Input";
import { Textarea } from "@components/ui/Textarea";

interface Props {
  register: UseFormRegister<BusinessCreateValues>;
  errors: FieldErrors<BusinessCreateValues>;
}

export function StepIdentity({ register, errors }: Props) {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display font-light text-3xl text-brand-black">
          Identity
        </h2>
        <p className="text-sm text-text-on-light-muted mt-1.5">
          Tell us about this business. The <em>key</em> is permanent — pick
          carefully.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          {...register("business_key")}
          label="Business key (permanent)"
          placeholder="e.g. jewelry"
          hint="Lowercase, letters / digits / underscores. Used in URLs and schema names."
          error={errors.business_key?.message as string | undefined}
        />
        <Input
          {...register("display_name")}
          label="Display name"
          placeholder="e.g. My Brand"
          error={errors.display_name?.message as string | undefined}
        />
        <Input
          {...register("legal_name")}
          label="Legal name"
          placeholder="e.g. My Brand Ltd"
          className="sm:col-span-2"
          error={errors.legal_name?.message as string | undefined}
        />
        <Input
          {...register("email")}
          type="email"
          label="Business email"
          placeholder="contact@orika.example"
          error={errors.email?.message as string | undefined}
        />
        <Input
          {...register("phone")}
          label="Business phone"
          placeholder="+234 ..."
          error={errors.phone?.message as string | undefined}
        />
        <Input
          {...register("website")}
          label="Website"
          placeholder="https://orika.com"
          className="sm:col-span-2"
          error={errors.website?.message as string | undefined}
        />
        <Textarea
          {...register("address")}
          label="Registered address"
          placeholder="Plot 5, Admiralty Way, Lekki Phase 1, Lagos"
          className="sm:col-span-2"
        />
        <Input
          {...register("tin")}
          label="TIN (Tax ID)"
          placeholder="123456789-0001"
          error={errors.tin?.message as string | undefined}
        />
        <Input
          {...register("cac_number")}
          label="CAC number"
          placeholder="RC 1234567"
          error={errors.cac_number?.message as string | undefined}
        />
      </div>
    </div>
  );
}
