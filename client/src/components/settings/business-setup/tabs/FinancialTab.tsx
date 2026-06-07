import { useForm } from "react-hook-form";
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
        <Input
          {...register("vat_rate", { valueAsNumber: true })}
          type="number"
          step="0.001"
          label="VAT rate"
          hint="Decimal 0–1 (0.075 = 7.5%)"
          error={errors.vat_rate?.message}
        />
        <Input
          {...register("wht_rate", { valueAsNumber: true })}
          type="number"
          step="0.001"
          label="WHT rate"
          hint="Decimal 0–1 (0.05 = 5%)"
          error={errors.wht_rate?.message}
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
