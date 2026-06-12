import {
  Controller,
  Control,
  UseFormRegister,
  FieldErrors,
} from "react-hook-form";
import { Database, ShieldAlert, Sparkles } from "lucide-react";
import type { BusinessCreateValues } from "@lib/schemas/business";
import { Input } from "@components/ui/Input";
import { cn } from "@lib/cn";

interface Props {
  control: Control<BusinessCreateValues>;
  register: UseFormRegister<BusinessCreateValues>;
  errors: FieldErrors<BusinessCreateValues>;
  provisionSchema: boolean;
}

export function StepProvisioning({
  control,
  register,
  errors,
  provisionSchema,
}: Props) {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-display font-light text-3xl text-brand-black">
          Advanced — Database Provisioning
        </h2>
        <p className="text-sm text-text-on-light-muted mt-1.5">
          Choose how this business's Postgres schema gets created. Provisioning
          runs migrations and seeds default sequences — it can't be partially
          undone.
        </p>
      </header>

      <Controller
        control={control}
        name="provision_schema"
        render={({ field }) => (
          <div className="space-y-4">
            <ProvOption
              selected={!field.value}
              onClick={() => field.onChange(false)}
              icon={<Database className="w-5 h-5" />}
              title="Config only"
              tagline="I'll provision the schema manually"
              body="Use this if you've already created the Postgres schema with your own migrations (or you're seeding the system in development). Only the business_config row will be written."
            />
            <ProvOption
              selected={!!field.value}
              onClick={() => field.onChange(true)}
              icon={<Sparkles className="w-5 h-5" />}
              title="Full provisioning"
              tagline="Recommended for new businesses"
              body="Creates the Postgres schema, runs every template migration, seeds the document_numbering sequences, and pushes this business into the active-business cache so users can switch to it immediately."
              accent
            />
          </div>
        )}
      />

      {provisionSchema && (
        <div className="rounded-2xl border border-brand-accent/30 bg-brand-accent/[0.04] p-5 animate-slide-up space-y-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-brand-accent mt-0.5 shrink-0" />
            <div className="text-sm text-brand-black/80">
              <strong>Provisioning will create the following:</strong>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-text-on-light-muted">
                <li>A new Postgres schema named after the business key</li>
                <li>
                  Every table in the standard business template (sales, stock,
                  accounting, payroll, logistics, etc.)
                </li>
                <li>
                  A complete set of document numbering sequences (invoice, PO,
                  quotation, payslip, etc.)
                </li>
                <li>An entry in the in-memory active-business cache</li>
              </ul>
            </div>
          </div>

          <Input
            {...register("prefix")}
            label="Document prefix"
            placeholder="JWL"
            hint="2–5 uppercase letters. Used in document numbers (e.g. JWL-INV-0001)."
            error={errors.prefix?.message as string | undefined}
          />
        </div>
      )}
    </div>
  );
}

function ProvOption({
  selected,
  onClick,
  icon,
  title,
  tagline,
  body,
  accent,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  tagline: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left p-5 rounded-2xl border transition-all",
        selected
          ? accent
            ? "bg-brand-accent/[0.08] border-brand-accent shadow-glow-sm"
            : "bg-brand-black/[0.04] border-brand-black"
          : "bg-white/40 border-brand-cloud/40 hover:border-brand-black/40",
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
            accent
              ? "bg-brand-accent/20 text-brand-accent-dim"
              : "bg-brand-cream text-brand-black",
          )}
        >
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-xl text-brand-black">
              {title}
            </span>
            {accent && (
              <span className="text-[0.6rem] uppercase tracking-widest px-2 py-0.5 bg-brand-accent/20 text-brand-accent-dim rounded-full font-bold">
                Recommended
              </span>
            )}
          </div>
          <div className="text-xs text-text-on-light-muted mt-0.5 italic">
            {tagline}
          </div>
          <p className="text-sm text-brand-black/70 mt-2 leading-relaxed">
            {body}
          </p>
        </div>
        <div
          className={cn(
            "w-5 h-5 rounded-full border-2 shrink-0 mt-1",
            selected ? "border-brand-accent bg-brand-accent" : "border-brand-cloud",
          )}
        />
      </div>
    </button>
  );
}
