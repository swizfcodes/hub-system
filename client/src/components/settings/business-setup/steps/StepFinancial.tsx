import {
  Controller,
  Control,
  UseFormRegister,
  FieldErrors,
} from "react-hook-form";
import { NumberField } from "@components/ui/NumberField";
import type { BusinessCreateValues } from "@lib/schemas/business";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { CURRENCIES } from "@lib/constants/currencies";

interface Props {
  control: Control<BusinessCreateValues>;
  register: UseFormRegister<BusinessCreateValues>;
  errors: FieldErrors<BusinessCreateValues>;
}

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

export function StepFinancial({ control, register, errors }: Props) {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display font-light text-3xl text-brand-black">
          Financial
        </h2>
        <p className="text-sm text-text-on-light-muted mt-1.5">
          Currency, fiscal year and tax defaults. You can add more tax rates
          later in Tax Rates.
        </p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <Select
          {...register("default_currency")}
          label="Default currency"
          options={CURRENCIES.map((c) => ({
            value: c.code,
            label: `${c.symbol}  ${c.name} (${c.code})`,
          }))}
          error={errors.default_currency?.message as string | undefined}
        />
        <Select
          {...register("fiscal_year_start", { valueAsNumber: true })}
          label="Fiscal year starts"
          options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          error={errors.fiscal_year_start?.message as string | undefined}
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
          placeholder="VAT-12345"
          className="sm:col-span-2"
          error={errors.vat_number?.message as string | undefined}
        />
      </div>
    </div>
  );
}
