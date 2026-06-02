import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Business } from "@typedefs/settings";
import {
  profilePatchSchema,
  type ProfilePatchValues,
} from "@lib/schemas/business";
import { updateBusiness } from "@services/settings/businesses";
import { Input } from "@components/ui/Input";
import { Textarea } from "@components/ui/Textarea";
import { Button } from "@components/ui/Button";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

export function ProfileTab({ business }: { business: Business }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<ProfilePatchValues>({
    resolver: zodResolver(profilePatchSchema),
    defaultValues: {
      display_name: business.display_name,
      legal_name: business.legal_name,
      email: business.email ?? "",
      phone: business.phone ?? "",
      website: business.website ?? "",
      address: business.address ?? "",
      tin: business.tin ?? "",
      cac_number: business.cac_number ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: ProfilePatchValues) =>
      updateBusiness(business.business_key, {
        ...values,
        email: values.email || undefined,
        phone: values.phone || undefined,
        website: values.website || undefined,
        address: values.address || undefined,
        tin: values.tin || undefined,
        cac_number: values.cac_number || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "businesses"] });
      showToast.success("Profile saved");
    },
    onError: (e) => showToast.error("Save failed", errMsg(e)),
  });

  return (
    <form
      onSubmit={handleSubmit((v) => mutation.mutate(v))}
      noValidate
      className="space-y-6"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          {...register("display_name")}
          label="Display name"
          error={errors.display_name?.message}
        />
        <Input
          {...register("legal_name")}
          label="Legal name"
          error={errors.legal_name?.message}
        />
        <Input
          {...register("email")}
          label="Business email"
          type="email"
          error={errors.email?.message}
        />
        <Input
          {...register("phone")}
          label="Business phone"
          error={errors.phone?.message}
        />
        <Input
          {...register("website")}
          label="Website"
          className="sm:col-span-2"
          error={errors.website?.message}
        />
        <Textarea
          {...register("address")}
          label="Registered address"
          className="sm:col-span-2"
        />
        <Input {...register("tin")} label="TIN" />
        <Input {...register("cac_number")} label="CAC number" />
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          disabled={!isDirty}
          loading={mutation.isPending}
        >
          Save profile
        </Button>
      </div>
    </form>
  );
}
