import { useForm, Controller } from "react-hook-form";
import { NumberField } from "@components/ui/NumberField";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Business } from "@typedefs/settings";
import {
  financialPatchSchema,
  type FinancialPatchValues,
} from "@lib/schemas/business";
import { updateBusiness } from "@services/settings/businesses";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Button } from "@components/ui/Button";
import { CURRENCIES } from "@lib/constants/currencies";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function FinancialTab({ business }: { business: Business }) {
  const qc = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FinancialPatchValues>({
    resolver: zodResolver(financialPatchSchema),
    defaultValues: {
      default_currency: business.default_currency,
      fiscal_year_start: business.fiscal_year_start,
      vat_rate: business.vat_rate,
      wht_rate: business.wht_rate,
      vat_number: business.vat_number ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FinancialPatchValues) =>
      updateBusiness(business.business_key, {
        ...values,
        vat_number: values.vat_number || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "businesses"] });
      showToast.success("Financial settings saved");
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
        <Select
          {...register("default_currency")}
          label="Default currency"
          options={CURRENCIES.map((c) => ({
            value: c.code,
            label: `${c.symbol} ${c.name} (${c.code})`,
          }))}
          error={errors.default_currency?.message}
        />
        <Select
          {...register("fiscal_year_start", { valueAsNumber: true })}
          label="Fiscal year starts"
          options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          error={errors.fiscal_year_start?.message}
        />
        <Controller
          control={control}
          name="vat_rate"
          render={({ field, fieldState }) => (
            <NumberField
              decimal
              label="VAT rate"
              placeholder="0.075"
              hint="Decimal 0–1 (0.075 = 7.5%)"
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="wht_rate"
          render={({ field, fieldState }) => (
            <NumberField
              decimal
              label="WHT rate"
              placeholder="0.05"
              hint="Decimal 0–1 (0.05 = 5%)"
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Input
          {...register("vat_number")}
          label="VAT number"
          className="sm:col-span-2"
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          disabled={!isDirty}
          loading={mutation.isPending}
        >
          Save financial
        </Button>
      </div>
    </form>
  );
}
