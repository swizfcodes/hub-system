import { UseFormRegister, FieldErrors } from 'react-hook-form';
import type { BusinessCreateValues } from '@lib/schemas/business';
import { Input } from '@components/ui/Input';
import { Select } from '@components/ui/Select';
import { CURRENCIES } from '@lib/constants/currencies';

interface Props {
  register: UseFormRegister<BusinessCreateValues>;
  errors: FieldErrors<BusinessCreateValues>;
}

const MONTHS = [
  'January','February','March','April','May','June','July','August','September','October','November','December',
];

export function StepFinancial({ register, errors }: Props) {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display font-light text-3xl text-orika-black">Financial</h2>
        <p className="text-sm text-text-on-light-muted mt-1.5">Currency, fiscal year and tax defaults. You can add more tax rates later in Tax Rates.</p>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <Select
          {...register('default_currency')}
          label="Default currency"
          options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.symbol}  ${c.name} (${c.code})` }))}
          error={errors.default_currency?.message as string | undefined}
        />
        <Select
          {...register('fiscal_year_start', { valueAsNumber: true })}
          label="Fiscal year starts"
          options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
          error={errors.fiscal_year_start?.message as string | undefined}
        />
        <Input
          {...register('vat_rate', { valueAsNumber: true })}
          type="number"
          step="0.001"
          label="VAT rate"
          placeholder="0.075"
          hint="Decimal 0–1 (0.075 = 7.5%)"
          error={errors.vat_rate?.message as string | undefined}
        />
        <Input
          {...register('wht_rate', { valueAsNumber: true })}
          type="number"
          step="0.001"
          label="WHT rate"
          placeholder="0.05"
          hint="Decimal 0–1 (0.05 = 5%)"
          error={errors.wht_rate?.message as string | undefined}
        />
        <Input
          {...register('vat_number')}
          label="VAT number"
          placeholder="VAT-12345"
          className="sm:col-span-2"
          error={errors.vat_number?.message as string | undefined}
        />
      </div>
    </div>
  );
}
