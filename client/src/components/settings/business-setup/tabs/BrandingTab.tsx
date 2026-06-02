import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Business } from "@typedefs/settings";
import {
  brandingPatchSchema,
  type BrandingPatchValues,
} from "@lib/schemas/business";
import { updateBusiness } from "@services/settings/businesses";
import { LogoDropZone } from "../LogoDropZone";
import { BrandColorPicker } from "../BrandColorPicker";
import { Textarea } from "@components/ui/Textarea";
import { Button } from "@components/ui/Button";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

export function BrandingTab({ business }: { business: Business }) {
  const qc = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<BrandingPatchValues>({
    resolver: zodResolver(brandingPatchSchema),
    defaultValues: {
      logo_path: business.logo_path ?? "",
      accent_colour: business.accent_colour,
      mission_statement: business.mission_statement ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: BrandingPatchValues) =>
      updateBusiness(business.business_key, {
        ...values,
        logo_path: values.logo_path || undefined,
        mission_statement: values.mission_statement || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "businesses"] });
      showToast.success("Branding saved");
    },
    onError: (e) => showToast.error("Save failed", errMsg(e)),
  });

  return (
    <form
      onSubmit={handleSubmit((v) => mutation.mutate(v))}
      noValidate
      className="space-y-6"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Controller
          name="logo_path"
          control={control}
          render={({ field }) => (
            <LogoDropZone
              value={field.value}
              onChange={field.onChange}
              businessKey={business.business_key}
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
        hint="Up to 280 characters"
        error={errors.mission_statement?.message}
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          disabled={!isDirty}
          loading={mutation.isPending}
        >
          Save branding
        </Button>
      </div>
    </form>
  );
}
