import { Controller, Control, UseFormRegister } from "react-hook-form";
import type { BusinessCreateValues } from "@lib/schemas/business";
import { Switch } from "@components/ui/Switch";
import { Input } from "@components/ui/Input";

interface Props {
  control: Control<BusinessCreateValues>;
  register: UseFormRegister<BusinessCreateValues>;
}

const PAYMENT_METHODS = [
  {
    key: "card",
    label: "Card payments",
    description: "Visa, Mastercard, Verve via Paystack / Flutterwave",
  },
  {
    key: "transfer",
    label: "Bank transfer",
    description: "Direct transfer to one of your bank accounts",
  },
  { key: "cash", label: "Cash", description: "For in-store POS sales" },
  {
    key: "mobile_money",
    label: "Mobile money",
    description: "M-Pesa, OPay, PalmPay and similar",
  },
  {
    key: "cheque",
    label: "Cheque",
    description: "For B2B / wholesale partners",
  },
  {
    key: "paystack",
    label: "Paystack checkout link",
    description: "Hosted Paystack page",
  },
  {
    key: "flutterwave",
    label: "Flutterwave checkout",
    description: "Hosted Flutterwave page",
  },
];

export function StepLocalisation({ control, register }: Props) {
  return (
    <div className="space-y-8">
      <header>
        <h2 className="font-display font-light text-3xl text-orika-black">
          Localisation & Payments
        </h2>
        <p className="text-sm text-text-on-light-muted mt-1.5">
          Which payment methods does this business accept? Cash handling can be
          tightened here too.
        </p>
      </header>

      <div>
        <div className="text-[0.7rem] tracking-widest uppercase font-medium text-text-on-light-muted mb-3">
          Accepted payment methods
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PAYMENT_METHODS.map((pm) => (
            <Controller
              key={pm.key}
              control={control}
              name={`payment_methods.${pm.key}` as const}
              render={({ field }) => (
                <div className="p-3 rounded-xl bg-white/50 border border-orika-cloud/40">
                  <Switch
                    surface="light"
                    checked={!!field.value}
                    onChange={field.onChange}
                    label={pm.label}
                    description={pm.description}
                  />
                </div>
              )}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="text-[0.7rem] tracking-widest uppercase font-medium text-text-on-light-muted mb-3">
          Cash handling rules
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            {...register(
              "cash_handling_rules.require_supervisor_approval_above",
              { valueAsNumber: true },
            )}
            type="number"
            label="Supervisor approval above"
            placeholder="100000"
            hint="Cash sales over this amount need supervisor sign-off"
          />
          <Input
            {...register("cash_handling_rules.require_double_count_above", {
              valueAsNumber: true,
            })}
            type="number"
            label="Double-count above"
            placeholder="50000"
            hint="Cash drawer closes requiring two staff counts"
          />
        </div>
      </div>
    </div>
  );
}
