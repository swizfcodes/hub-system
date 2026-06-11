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
import { Input } from "@components/ui/Input";
import { Textarea } from "@components/ui/Textarea";
import { Button } from "@components/ui/Button";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

const SOCIAL_PLATFORMS = [
  {
    key: "instagram" as const,
    label: "Instagram",
    placeholder: "https://instagram.com/yourbrand",
  },
  {
    key: "facebook" as const,
    label: "Facebook",
    placeholder: "https://facebook.com/yourbrand",
  },
  {
    key: "tiktok" as const,
    label: "TikTok",
    placeholder: "https://tiktok.com/@yourbrand",
  },
  {
    key: "twitter" as const,
    label: "X / Twitter",
    placeholder: "https://x.com/yourbrand",
  },
  {
    key: "youtube" as const,
    label: "YouTube",
    placeholder: "https://youtube.com/@yourbrand",
  },
  {
    key: "linkedin" as const,
    label: "LinkedIn",
    placeholder: "https://linkedin.com/company/yourbrand",
  },
] as const;

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
      secondary_colour: business.secondary_colour ?? "#F5F0EB",
      mission_statement: business.mission_statement ?? "",
      brand_fonts: {
        heading: business.brand_fonts?.heading ?? "",
        body: business.brand_fonts?.body ?? "",
      },
      social_links: {
        instagram: business.social_links?.instagram ?? "",
        facebook: business.social_links?.facebook ?? "",
        tiktok: business.social_links?.tiktok ?? "",
        twitter: business.social_links?.twitter ?? "",
        youtube: business.social_links?.youtube ?? "",
        linkedin: business.social_links?.linkedin ?? "",
      },
      email_footer_text: business.email_footer_text ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: BrandingPatchValues) => {
      const socialLinks = values.social_links
        ? Object.fromEntries(
            Object.entries(values.social_links).filter(([, v]) => v),
          )
        : undefined;

      return updateBusiness(business.business_key, {
        ...values,
        logo_path: values.logo_path || undefined,
        secondary_colour: values.secondary_colour || undefined,
        mission_statement: values.mission_statement || undefined,
        brand_fonts:
          values.brand_fonts?.heading || values.brand_fonts?.body
            ? values.brand_fonts
            : undefined,
        social_links: Object.keys(socialLinks || {}).length ? socialLinks : {},
        email_footer_text: values.email_footer_text || undefined,
      });
    },
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
      className="space-y-8"
    >
      {/* Logo & Colours */}
      <section>
        <SectionHeader title="Logo & colours" />
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
          <div className="space-y-6">
            <Controller
              name="accent_colour"
              control={control}
              render={({ field }) => (
                <BrandColorPicker
                  value={field.value || "#C9A86C"}
                  onChange={field.onChange}
                  label="Primary colour"
                />
              )}
            />
            <Controller
              name="secondary_colour"
              control={control}
              render={({ field }) => (
                <BrandColorPicker
                  value={field.value || "#F5F0EB"}
                  onChange={field.onChange}
                  label="Secondary colour"
                />
              )}
            />
          </div>
        </div>
      </section>

      {/* Typography */}
      <section>
        <SectionHeader
          title="Typography"
          hint="Font names used in emails and documents. Use web-safe fonts or Google Fonts names."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            {...register("brand_fonts.heading")}
            label="Heading font"
            placeholder="e.g. Georgia, Playfair Display"
          />
          <Input
            {...register("brand_fonts.body")}
            label="Body font"
            placeholder="e.g. Arial, Inter"
          />
        </div>
      </section>

      {/* Social Links */}
      <section>
        <SectionHeader
          title="Social links"
          hint="Only filled links appear as icons in your transactional emails. Leave blank to hide."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIAL_PLATFORMS.map((p) => (
            <Input
              key={p.key}
              {...register(`social_links.${p.key}`)}
              label={p.label}
              placeholder={p.placeholder}
              error={
                (
                  errors.social_links as
                    | Record<string, { message?: string }>
                    | undefined
                )?.[p.key]?.message
              }
            />
          ))}
        </div>
      </section>

      {/* Mission & Footer */}
      <section>
        <SectionHeader title="Email footer" />
        <div className="space-y-5">
          <Textarea
            {...register("mission_statement")}
            label="Mission statement"
            hint="Up to 280 characters"
            error={errors.mission_statement?.message}
          />
          <Textarea
            {...register("email_footer_text")}
            label="Email footer text"
            hint="Legal / compliance line shown at the bottom of every transactional email. Up to 500 characters."
            placeholder="e.g. Brand Name is a registered trademark of XYZ Ltd. RC 1234567. 12 Example Road, Lagos, Nigeria."
            error={errors.email_footer_text?.message}
          />
        </div>
      </section>

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

function SectionHeader({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <h3 className="font-display text-lg text-brand-black">{title}</h3>
      {hint && (
        <p className="text-xs text-text-on-light-muted mt-0.5">{hint}</p>
      )}
    </div>
  );
}
