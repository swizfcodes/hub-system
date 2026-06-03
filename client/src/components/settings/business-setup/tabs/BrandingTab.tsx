import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Business } from '@typedefs/settings';
import { brandingPatchSchema, type BrandingPatchValues } from '@lib/schemas/business';
import { updateBusiness } from '@services/settings/businesses';
import { LogoDropZone } from '../LogoDropZone';
import { BrandColorPicker } from '../BrandColorPicker';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { Button } from '@components/ui/Button';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';

const SOCIAL_PLATFORMS = [
  { key: 'instagram' as const, label: 'Instagram',  placeholder: 'https://instagram.com/yourbrand' },
  { key: 'facebook'  as const, label: 'Facebook',   placeholder: 'https://facebook.com/yourbrand' },
  { key: 'tiktok'    as const, label: 'TikTok',     placeholder: 'https://tiktok.com/@yourbrand' },
  { key: 'twitter'   as const, label: 'X / Twitter', placeholder: 'https://x.com/yourbrand' },
  { key: 'youtube'   as const, label: 'YouTube',    placeholder: 'https://youtube.com/@yourbrand' },
  { key: 'linkedin'  as const, label: 'LinkedIn',   placeholder: 'https://linkedin.com/company/yourbrand' },
] as const;
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
      logo_path:         business.logo_path ?? '',
      accent_colour:     business.accent_colour,
      mission_statement: business.mission_statement ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: BrandingPatchValues) => {
      // Strip empty strings from social_links so the DB stores only populated ones
      const socialLinks = values.social_links
        ? Object.fromEntries(Object.entries(values.social_links).filter(([, v]) => v))
        : undefined;

      return updateBusiness(business.business_key, {
        ...values,
        logo_path:         values.logo_path || undefined,
        mission_statement: values.mission_statement || undefined,
        brand_fonts:       (values.brand_fonts?.heading || values.brand_fonts?.body) ? values.brand_fonts : undefined,
        social_links:      Object.keys(socialLinks || {}).length ? socialLinks : {},
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
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Controller
          name="logo_path"
          control={control}
          render={({ field }) => (
            <LogoDropZone value={field.value} onChange={field.onChange} businessKey={business.business_key} />
          )}
        />
        <Controller
          name="accent_colour"
          control={control}
          render={({ field }) => (
            <BrandColorPicker value={field.value || '#C9A86C'} onChange={field.onChange} />
          )}
        />
      </div>
      <Textarea
        {...register('mission_statement')}
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

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-display text-lg text-orika-black">{title}</h3>
      {hint && <p className="text-xs text-text-on-light-muted mt-0.5">{hint}</p>}
    </div>
  );
}
