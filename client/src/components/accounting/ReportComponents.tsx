/**
 * ReportComponents.tsx
 * Exports: PLReportView, BalanceSheetView, TrialBalanceView, CashFlowView,
 *          DateRangeFilter, ReportSummaryCard
 */
import { Input } from "@components/ui/Input";
import { Skeleton } from "@components/ui/Skeleton";
import { fmtMoney } from "@lib/format";
import { cn } from "@lib/cn";
import type {
  PLReport,
  BalanceSheetReport,
  TrialBalanceReport,
  CashFlowReport,
} from "@typedefs/accounting";

// ── DateRangeFilter ───────────────────────────────────────────────────────────

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  asOfDate?: string; // for balance sheet (single date)
  onAsOfChange?: (v: string) => void;
  mode?: "range" | "as_of";
}

export function DateRangeFilter({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  asOfDate,
  onAsOfChange,
  mode = "range",
}: DateRangeFilterProps) {
  if (mode === "as_of") {
    return (
      <div className="flex items-center gap-3">
        <Input
          label="As of Date"
          type="date"
          value={asOfDate}
          onChange={(e) => onAsOfChange?.(e.target.value)}
          surface="dark"
          className="w-44"
        />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <Input
        label="From"
        type="date"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        surface="dark"
        className="w-40"
      />
      <span className="text-brand-smoke mt-4">—</span>
      <Input
        label="To"
        type="date"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        surface="dark"
        className="w-40"
      />
    </div>
  );
}

// ── ReportSummaryCard ─────────────────────────────────────────────────────────

export function ReportSummaryCard({
  label,
  value,
  currency,
  positive = true,
}: {
  label: string;
  value: number;
  currency: string;
  positive?: boolean;
}) {
  const isGood = positive ? value >= 0 : value <= 0;
  return (
    <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-5 py-4">
      <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
        {label}
      </p>
      <p
        className={cn(
          "font-display text-2xl font-light tabular-nums",
          isGood ? "text-brand-accent" : "text-red-400",
        )}
      >
        {fmtMoney(Math.abs(value), currency)}
        {value < 0 && <span className="text-sm ml-1">(loss)</span>}
      </p>
    </div>
  );
}

// ── PLReportView ──────────────────────────────────────────────────────────────

export function PLReportView({
  report,
  currency = "NGN",
  loading = false,
}: {
  report?: PLReport | null;
  currency?: string;
  loading?: boolean;
}) {
  if (loading) return <ReportSkeleton />;
  if (!report)
    return (
      <ReportEmpty text="Select a date range to generate the P&L report." />
    );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <ReportSummaryCard
          label="Total Revenue"
          value={report.total_income}
          currency={currency}
        />
        <ReportSummaryCard
          label="Total Expenses"
          value={report.total_expenses}
          currency={currency}
        />
        <ReportSummaryCard
          label="Net Profit"
          value={report.net_profit}
          currency={currency}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSection
          title="Revenue"
          rows={report.income}
          currency={currency}
          total={report.total_income}
          totalLabel="Total Revenue"
        />
        <ReportSection
          title="Expenses"
          rows={report.expenses}
          currency={currency}
          total={report.total_expenses}
          totalLabel="Total Expenses"
        />
      </div>
    </div>
  );
}

// ── BalanceSheetView ──────────────────────────────────────────────────────────

export function BalanceSheetView({
  report,
  currency = "NGN",
  loading = false,
}: {
  report?: BalanceSheetReport | null;
  currency?: string;
  loading?: boolean;
}) {
  if (loading) return <ReportSkeleton />;
  if (!report)
    return <ReportEmpty text="Select a date to generate the Balance Sheet." />;

  const isBalanced =
    Math.abs(
      report.total_assets - (report.total_liabilities + report.total_equity),
    ) < 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <ReportSummaryCard
          label="Total Assets"
          value={report.total_assets}
          currency={currency}
        />
        <ReportSummaryCard
          label="Total Liabilities"
          value={report.total_liabilities}
          currency={currency}
        />
        <ReportSummaryCard
          label="Total Equity"
          value={report.total_equity}
          currency={currency}
        />
      </div>
      {!isBalanced && (
        <div className="rounded-xl border border-red-500/30 bg-red-900/10 px-4 py-3 text-sm text-red-400">
          ⚠ Balance sheet is not balanced. Total Assets ≠ Liabilities + Equity.
          Check for missing journal entries.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ReportSection
          title="Assets"
          rows={report.assets}
          currency={currency}
          total={report.total_assets}
          totalLabel="Total Assets"
        />
        <ReportSection
          title="Liabilities"
          rows={report.liabilities}
          currency={currency}
          total={report.total_liabilities}
          totalLabel="Total Liabilities"
        />
        <ReportSection
          title="Equity"
          rows={report.equity}
          currency={currency}
          total={report.total_equity}
          totalLabel="Total Equity"
        />
      </div>
    </div>
  );
}

// ── TrialBalanceView ──────────────────────────────────────────────────────────

export function TrialBalanceView({
  report,
  currency = "NGN",
  loading = false,
}: {
  report?: TrialBalanceReport | null;
  currency?: string;
  loading?: boolean;
}) {
  if (loading) return <ReportSkeleton />;
  if (!report)
    return (
      <ReportEmpty text="Select a date range to generate the Trial Balance." />
    );

  const totalDebit = report.data.reduce(
    (s, r) => s + parseFloat(String(r.total_debit)),
    0,
  );
  const totalCredit = report.data.reduce(
    (s, r) => s + parseFloat(String(r.total_credit)),
    0,
  );
  const isBalanced = Math.abs(totalDebit - totalCredit) < 1;

  return (
    <div className="space-y-4">
      {!isBalanced && (
        <div className="rounded-xl border border-red-500/30 bg-red-900/10 px-4 py-3 text-sm text-red-400">
          ⚠ Trial balance is out of balance. DR {fmtMoney(totalDebit, currency)}{" "}
          ≠ CR {fmtMoney(totalCredit, currency)}.
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-white/5">
        <table className="w-full min-w-[500px] text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-brand-charcoal">
              {["Code", "Account", "Type", "Debit", "Credit"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-widest text-brand-smoke"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {report.data.map((row) => (
              <tr
                key={row.account_code}
                className="bg-brand-charcoal hover:bg-brand-graphite/20"
              >
                <td className="px-4 py-2.5 font-mono text-xs text-brand-accent">
                  {row.account_code}
                </td>
                <td className="px-4 py-2.5 text-brand-cream">
                  {row.account_name}
                </td>
                <td className="px-4 py-2.5 text-brand-smoke capitalize text-xs">
                  {row.account_type}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-brand-cream">
                  {row.total_debit > 0
                    ? fmtMoney(row.total_debit, currency)
                    : "—"}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-brand-cream">
                  {row.total_credit > 0
                    ? fmtMoney(row.total_credit, currency)
                    : "—"}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-white/20 bg-brand-graphite/30 font-semibold">
              <td
                colSpan={3}
                className="px-4 py-3 text-brand-smoke uppercase text-xs tracking-wide"
              >
                Totals
              </td>
              <td className="px-4 py-3 tabular-nums text-brand-cream">
                {fmtMoney(totalDebit, currency)}
              </td>
              <td className="px-4 py-3 tabular-nums text-brand-cream">
                {fmtMoney(totalCredit, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CashFlowView ──────────────────────────────────────────────────────────────

export function CashFlowView({
  report,
  currency = "NGN",
  loading = false,
}: {
  report?: CashFlowReport | null;
  currency?: string;
  loading?: boolean;
}) {
  if (loading) return <ReportSkeleton />;
  if (!report)
    return (
      <ReportEmpty text="Cash Flow report requires the backend endpoint (see patch notes)." />
    );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <ReportSummaryCard
          label="Net Operating"
          value={report.net_operating}
          currency={currency}
        />
        <ReportSummaryCard
          label="Net Investing"
          value={report.net_investing}
          currency={currency}
        />
        <ReportSummaryCard
          label="Net Financing"
          value={report.net_financing}
          currency={currency}
        />
        <ReportSummaryCard
          label="Net Cash Flow"
          value={report.net_cash_movement}
          currency={currency}
        />
      </div>

      <CashFlowSection
        title="Operating Activities"
        items={report.operating_activities}
        net={report.net_operating}
        currency={currency}
      />
      <CashFlowSection
        title="Investing Activities"
        items={report.investing_activities}
        net={report.net_investing}
        currency={currency}
      />
      <CashFlowSection
        title="Financing Activities"
        items={report.financing_activities}
        net={report.net_financing}
        currency={currency}
      />
    </div>
  );
}

function CashFlowSection({
  title,
  items,
  net,
  currency,
}: {
  title: string;
  items: { label: string; amount: number }[];
  net: number;
  currency: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-4">
        {title}
      </p>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-brand-cloud">{item.label}</span>
            <span
              className={cn(
                "tabular-nums",
                item.amount >= 0 ? "text-brand-cream" : "text-red-400",
              )}
            >
              {item.amount >= 0 ? "" : "("}
              {fmtMoney(Math.abs(item.amount), currency)}
              {item.amount < 0 ? ")" : ""}
            </span>
          </div>
        ))}
        <div className="flex justify-between text-sm font-semibold border-t border-white/10 pt-2">
          <span className="text-brand-smoke">Net {title.split(" ")[0]}</span>
          <span
            className={cn(
              "tabular-nums",
              net >= 0 ? "text-brand-accent" : "text-red-400",
            )}
          >
            {fmtMoney(Math.abs(net), currency)}
            {net < 0 ? " (outflow)" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function ReportSection({
  title,
  rows,
  currency,
  total,
  totalLabel,
}: {
  title: string;
  rows: { account_code: string; account_name: string; balance: number }[];
  currency: string;
  total: number;
  totalLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-brand-charcoal p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-3">
        {title}
      </p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.account_code} className="flex justify-between text-sm">
            <span className="text-brand-cloud truncate">
              {row.account_name}
            </span>
            <span className="tabular-nums text-brand-cream ml-4 shrink-0">
              {fmtMoney(parseFloat(String(row.balance)), currency)}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-xs text-brand-smoke/50">No entries</p>
        )}
        <div className="flex justify-between text-sm font-semibold border-t border-white/10 pt-2">
          <span className="text-brand-smoke">{totalLabel}</span>
          <span className="tabular-nums text-brand-accent">
            {fmtMoney(total, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}

function ReportEmpty({ text }: { text: string }) {
  return (
    <div className="py-16 text-center rounded-2xl border border-white/5 bg-brand-charcoal">
      <p className="text-sm text-brand-smoke">{text}</p>
    </div>
  );
}
