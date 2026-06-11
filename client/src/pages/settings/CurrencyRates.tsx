import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { Plus, TrendingUp, Database, RefreshCw } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Select } from "@components/ui/Select";
import { NumberField } from "@components/ui/NumberField";
import { Card } from "@components/ui/Card";
import { Modal } from "@components/ui/Modal";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import {
  listCurrencyRates,
  createCurrencyRate,
} from "@services/settings/currencyRates";
import { syncCurrencyRates } from "@services/sales/orders";
import { CURRENCIES } from "@lib/constants/currencies";
import { fmtDateTime } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";

interface NewRateValues {
  from_currency: string;
  to_currency: string;
  rate: number;
}

export default function CurrencyRates() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [filterFrom, setFilterFrom] = useState<string>("");

  const syncMutation = useMutation({
    mutationFn: syncCurrencyRates,
    onSuccess: () => {
      showToast.success("Currency rates synced from live feed");
      qc.invalidateQueries({ queryKey: ["settings", "currency-rates"] });
    },
    onError: (e) => showToast.error("Sync failed", errMsg(e)),
  });

  const { data: rates = [], isLoading } = useQuery({
    queryKey: ["settings", "currency-rates", { from: filterFrom }],
    queryFn: () =>
      listCurrencyRates({ from: filterFrom || undefined, limit: 100 }),
  });

  const grouped = rates.reduce<Record<string, typeof rates>>((acc, r) => {
    const key = `${r.from_currency}→${r.to_currency}`;
    (acc[key] = acc[key] || []).push(r);
    return acc;
  }, {});

  return (
    <>
      <Topbar title="Currency Rates" subtitle="FX rates · manual overrides" />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-5xl mx-auto">
        <PageHeader
          title="Currency Rates"
          subtitle="Exchange rates against NGN, fed by the daily currency sync job. Add manual overrides here when a feed is unavailable or you need to lock a rate."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Settings", to: "/settings" },
            { label: "Currency Rates" },
          ]}
          actions={
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                leftIcon={<RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />}
                onClick={() => syncMutation.mutate()}
                loading={syncMutation.isPending}
              >
                Sync Now
              </Button>
              <Button
                variant="gold"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setCreating(true)}
              >
                Manual Override
              </Button>
            </div>
          }
        />

        {/* Filter */}
        <div className="mb-6 max-w-xs">
          <Select
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            label="Filter by source currency"
            options={[
              { value: "", label: "All currencies" },
              ...CURRENCIES.map((c) => ({ value: c.code, label: c.code })),
            ]}
            surface="dark"
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <EmptyState
            icon={<TrendingUp className="w-7 h-7" />}
            title="No currency rates"
            description="Rates will appear once the daily sync runs, or add a manual override."
          />
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([pair, list]) => {
              const latest = list[0];
              return (
                <Card key={pair} className="p-5">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-brand-smoke">
                        {pair}
                      </div>
                      <div className="font-display text-3xl text-brand-cream mt-0.5 tabular-nums">
                        {latest.rate.toLocaleString("en-NG", {
                          maximumFractionDigits: 4,
                        })}
                      </div>
                      <div className="text-xs text-brand-smoke mt-1 flex items-center gap-1.5">
                        <Database className="w-3 h-3" /> {latest.source} ·{" "}
                        {fmtDateTime(latest.valid_at)}
                      </div>
                    </div>
                    <Sparkline
                      values={list
                        .slice(0, 20)
                        .reverse()
                        .map((r) => r.rate)}
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {list.slice(0, 8).map((r) => (
                      <div
                        key={r.rate_id}
                        className="p-2 rounded-lg bg-brand-black/30 border border-brand-graphite"
                      >
                        <div className="font-mono text-brand-cream">
                          {r.rate.toLocaleString("en-NG", {
                            maximumFractionDigits: 4,
                          })}
                        </div>
                        <div className="text-brand-smoke text-[0.65rem] mt-0.5">
                          {fmtDateTime(r.valid_at)}
                        </div>
                        <div className="text-brand-smoke text-[0.6rem] mt-0.5 uppercase tracking-wide">
                          {r.source}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        surface="light"
        size="sm"
        title="Manual rate override"
        description="Use sparingly. Logged in the audit trail as a manual override."
        footer={null}
      >
        <NewRateForm
          onSuccess={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["settings", "currency-rates"] });
          }}
          onCancel={() => setCreating(false)}
        />
      </Modal>
    </>
  );
}

function NewRateForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
  } = useForm<NewRateValues>({
    defaultValues: { from_currency: "USD", to_currency: "NGN", rate: 1500 },
  });
  const mutation = useMutation({
    mutationFn: (v: NewRateValues) =>
      createCurrencyRate({ ...v, source: "manual" }),
    onSuccess: () => {
      showToast.success("Rate added");
      onSuccess();
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });
  return (
    <form
      onSubmit={handleSubmit((v) => mutation.mutate(v))}
      className="space-y-4"
    >
      <div className="grid gap-3 grid-cols-2">
        <Select
          {...register("from_currency")}
          label="From"
          options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
        />
        <Select
          {...register("to_currency")}
          label="To"
          options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
        />
      </div>
      <Controller
        control={control}
        name="rate"
        render={({ field, fieldState }) => (
          <NumberField
            decimal
            surface="light"
            label="Rate"
            placeholder="1500"
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline-light" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={mutation.isPending}>
          Save rate
        </Button>
      </div>
    </form>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map(
      (v, i) =>
        `${(i * 100) / (values.length - 1)},${30 - ((v - min) / range) * 28}`,
    )
    .join(" ");
  return (
    <svg
      width="120"
      height="32"
      viewBox="0 0 100 32"
      className="text-brand-accent"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={pts}
      />
    </svg>
  );
}
