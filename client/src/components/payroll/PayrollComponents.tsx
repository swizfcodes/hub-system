/**
 * PayrollComponents.tsx
 * Exports: RunStatusBadge, PayrollModePicker, PayrollSummaryStrip,
 *          ComplianceOutputsPanel, PaymentMethodPicker, PAYEBreakdownRow
 */
import {
  Shield,
  Banknote,
  Download,
  CheckCircle,
  Clock,
  Info,
} from "lucide-react";
import { Badge } from "@components/ui/Badge";
import {
  PAYROLL_STATUS_META,
  COMPLIANCE_OUTPUTS,
  formatPeriod,
} from "@lib/constants/payrollConstants";
import { openCompliancePdf } from "@services/payroll";
import { fmtMoney } from "@lib/format";
import { cn } from "@lib/cn";
import type {
  PayrollRunStatus,
  PayrollMode,
  PaymentMethod,
  PayrollRun,
} from "@typedefs/payroll";

// ── RunStatusBadge ────────────────────────────────────────────────────────────

export function RunStatusBadge({
  status,
  size = "sm",
}: {
  status: PayrollRunStatus;
  size?: "xs" | "sm";
}) {
  const meta = PAYROLL_STATUS_META[status];
  return (
    <Badge tone={meta.tone} size={size} dot={meta.dot}>
      {meta.label}
    </Badge>
  );
}

// ── PayrollModePicker ─────────────────────────────────────────────────────────
// The most important new piece — lets HR/owner choose before initiating a run.

interface PayrollModePickerProps {
  value: PayrollMode;
  onChange: (mode: PayrollMode) => void;
}

export function PayrollModePicker({ value, onChange }: PayrollModePickerProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
        Payroll Mode
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ModeCard
          selected={value === "full_paye"}
          onClick={() => onChange("full_paye")}
          icon={Shield}
          title="Full PAYE"
          subtitle="Itemized salary + all statutory deductions"
          features={[
            "Basic + Housing + Transport allowances",
            "PAYE tax (progressive bands)",
            "Pension (8% employee · 10% employer)",
            "NHF (2.5% of basic)",
            "Compliance outputs: FIRS, PENCOM, NHF",
          ]}
          color="#C9A86C"
        />
        <ModeCard
          selected={value === "simplified"}
          onClick={() => onChange("simplified")}
          icon={Banknote}
          title="Simplified Salary"
          subtitle="Gross to net — no statutory deductions"
          features={[
            "Single consolidated gross salary",
            "Net = Gross (no automatic deductions)",
            "Manual deductions can be entered",
            "No compliance output generation",
            "Suitable for informal payroll arrangements",
          ]}
          color="#9E9891"
        />
      </div>
      {value === "simplified" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-900/10 px-4 py-3 text-xs text-amber-300">
          <Info className="h-4 w-4 shrink-0 mt-px" />
          Simplified mode does not compute statutory deductions. Ensure you are
          compliant with Nigerian tax law before using this mode.
        </div>
      )}
    </div>
  );
}

function ModeCard({
  selected,
  onClick,
  icon: Icon,
  title,
  subtitle,
  features,
  color,
}: {
  selected: boolean;
  onClick: () => void;
  icon: typeof Shield;
  title: string;
  subtitle: string;
  features: string[];
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-5 text-left transition-all",
        selected
          ? "border-brand-accent/60 bg-brand-accent/5"
          : "border-white/5 bg-brand-charcoal hover:border-white/20",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <div>
          <p
            className={cn(
              "text-sm font-semibold",
              selected ? "text-brand-accent" : "text-brand-cream",
            )}
          >
            {title}
          </p>
          <p className="text-xs text-brand-smoke">{subtitle}</p>
        </div>
        {selected && (
          <CheckCircle className="ml-auto h-4 w-4 text-brand-accent shrink-0" />
        )}
      </div>
      <ul className="space-y-1">
        {features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-1.5 text-xs text-brand-smoke"
          >
            <span className="mt-px text-brand-smoke/50">·</span>
            {f}
          </li>
        ))}
      </ul>
    </button>
  );
}

// ── PaymentMethodPicker ───────────────────────────────────────────────────────

interface PaymentMethodPickerProps {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
}

export function PaymentMethodPicker({
  value,
  onChange,
}: PaymentMethodPickerProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
        Payment Method
      </p>
      <div className="flex gap-3">
        {(
          [
            {
              key: "bulk",
              label: "Bulk Bank Transfer",
              sub: "One batch file to the bank",
            },
            {
              key: "individual",
              label: "Individual Transfers",
              sub: "Per-staff transfer records",
            },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={cn(
              "flex-1 rounded-xl border p-3 text-left text-sm transition-all",
              value === opt.key
                ? "border-brand-accent/60 bg-brand-accent/5 text-brand-accent"
                : "border-white/5 bg-brand-charcoal text-brand-smoke hover:border-white/15",
            )}
          >
            <p className="font-medium">{opt.label}</p>
            <p className="text-xs opacity-70 mt-0.5">{opt.sub}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── PayrollSummaryStrip ───────────────────────────────────────────────────────

interface PayrollSummaryStripProps {
  run: PayrollRun;
  currency?: string;
  mode?: PayrollMode;
}

export function PayrollSummaryStrip({
  run,
  currency = "NGN",
  mode = "full_paye",
}: PayrollSummaryStripProps) {
  const isFull = mode === "full_paye";

  const cards = [
    {
      label: "Total Gross",
      value: fmtMoney(run.total_gross, currency),
      color: "#C9A86C",
    },
    {
      label: "Total Net",
      value: fmtMoney(run.total_net, currency),
      color: "#2D6A4F",
    },
    ...(isFull
      ? [
          {
            label: "Total PAYE",
            value: fmtMoney(run.total_paye, currency),
            color: "#C0392B",
          },
          {
            label: "Pension (Emp)",
            value: fmtMoney(run.total_pension_employee, currency),
            color: "#4E9AF1",
          },
          {
            label: "Pension (Empr)",
            value: fmtMoney(run.total_pension_employer, currency),
            color: "#7B68EE",
          },
          {
            label: "NHF",
            value: fmtMoney(run.total_nhf, currency),
            color: "#9E9891",
          },
        ]
      : []),
    {
      label: "Headcount",
      value: String(run.payslip_count ?? 0),
      color: "#9E9891",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3"
        >
          <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
            {card.label}
          </p>
          <p
            className="font-display text-lg font-light tabular-nums"
            style={{ color: card.color }}
          >
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── ComplianceOutputsPanel ────────────────────────────────────────────────────

interface ComplianceOutputsPanelProps {
  runId: string;
  run: PayrollRun;
  currency?: string;
}

export function ComplianceOutputsPanel({
  runId,
  run,
  currency: _currency = "NGN",
}: ComplianceOutputsPanelProps) {
  const period = formatPeriod(run.period_month, run.period_year);

  return (
    <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-5 space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
          Compliance Outputs
        </p>
        <span className="text-xs text-brand-smoke/60">— {period}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {COMPLIANCE_OUTPUTS.map((output) => (
          <button
            key={output.key}
            onClick={() => openCompliancePdf(runId, output.key)}
            className="flex items-start gap-3 rounded-xl border border-white/5 bg-brand-graphite/30 px-4 py-3 hover:border-white/15 transition-colors group text-left"
          >
            <Download className="h-4 w-4 shrink-0 mt-0.5 text-brand-smoke group-hover:text-brand-accent transition-colors" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-brand-cream">
                {output.label}
              </p>
              <p className="text-xs text-brand-smoke">{output.desc}</p>
              {output.deadline && (
                <p
                  className="flex items-center gap-1 mt-1 text-[10px]"
                  style={{ color: output.color }}
                >
                  <Clock className="h-3 w-3" />
                  Due: {output.deadline}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>

      <p className="text-xs text-brand-smoke/50">
        Downloads are CSV files ready for your bank and regulatory portals.
        Ensure all staff have TIN, PFA RSA PIN, and NHF numbers on file.
      </p>
    </div>
  );
}

// ── PAYEBreakdownRow ──────────────────────────────────────────────────────────
// Reusable row for payslip detail breakdown

export function EarningsRow({
  label,
  value,
  currency,
  muted = false,
  bold = false,
}: {
  label: string;
  value: number;
  currency: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className={cn("flex justify-between text-sm", muted && "opacity-60")}>
      <span className="text-brand-smoke">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          bold ? "font-semibold text-brand-cream" : "text-brand-cloud",
        )}
      >
        {fmtMoney(value, currency)}
      </span>
    </div>
  );
}

export function DeductionRow({
  label,
  value,
  currency,
  highlight = false,
}: {
  label: string;
  value: number;
  currency: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-brand-smoke">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          highlight ? "text-red-400" : "text-brand-smoke",
        )}
      >
        ({fmtMoney(value, currency)})
      </span>
    </div>
  );
}
