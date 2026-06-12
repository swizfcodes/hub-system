// ── ChartOfAccounts.tsx ───────────────────────────────────────────────────────
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Upload } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { Modal } from "@components/ui/Modal";
import { Badge } from "@components/ui/Badge";
import {
  COATable,
  AccountFormModal,
} from "@components/accounting/AccountComponents";
import { listAccounts, getAccountLedger } from "@services/accounting";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney, fmtDate } from "@lib/format";
import type { Account, LedgerLine } from "@typedefs/accounting";

export function ChartOfAccounts() {
  const { currency } = useActiveBusiness();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [ledgerAccount, setLedger] = useState<Account | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["coa"],
    queryFn: () => listAccounts(),
  });

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ["ledger", ledgerAccount?.account_id],
    queryFn: () => getAccountLedger(ledgerAccount!.account_id),
    enabled: !!ledgerAccount,
  });

  const ledgerLines: LedgerLine[] = ledgerData?.data ?? [];

  return (
    <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Chart of Accounts"
        subtitle="Manage your account structure. System accounts are protected."
        crumbs={[
          { label: "Accounting", to: "/accounting" },
          { label: "Accounts" },
        ]}
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              title="Excel import — coming soon"
              disabled
            >
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              New Account
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : (
        <COATable
          accounts={accounts}
          onEdit={(acc) => setEditTarget(acc)}
          onLedger={(acc) => setLedger(acc)}
          currency={currency}
        />
      )}

      <AccountFormModal
        open={showCreate || !!editTarget}
        onClose={() => {
          setShowCreate(false);
          setEditTarget(null);
        }}
        existing={editTarget ?? undefined}
      />

      {/* Ledger drawer */}
      <Modal
        open={!!ledgerAccount}
        onClose={() => setLedger(null)}
        title={
          ledgerAccount
            ? `${ledgerAccount.account_code} — ${ledgerAccount.account_name}`
            : ""
        }
        size="xl"
        surface="dark"
      >
        {ledgerLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 rounded" />
            ))}
          </div>
        ) : ledgerLines.length === 0 ? (
          <p className="text-sm text-brand-smoke py-8 text-center">
            No transactions posted to this account yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {[
                    "Date",
                    "Entry #",
                    "Description",
                    "Debit",
                    "Credit",
                    "Balance",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-[0.65rem] uppercase tracking-widest text-brand-smoke"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {ledgerLines.map((line, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="px-3 py-2 text-brand-smoke">
                      {fmtDate(line.entry_date)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-brand-accent">
                      {line.entry_number}
                    </td>
                    <td className="px-3 py-2 text-brand-cloud max-w-xs truncate">
                      {line.description}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-brand-cream">
                      {line.debit > 0 ? fmtMoney(line.debit, currency) : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-brand-cream">
                      {line.credit > 0 ? fmtMoney(line.credit, currency) : "—"}
                    </td>
                    <td
                      className="px-3 py-2 tabular-nums font-medium"
                      style={{
                        color:
                          line.running_balance >= 0 ? "#C9A86C" : "#E74C3C",
                      }}
                    >
                      {fmtMoney(Math.abs(line.running_balance), currency)}
                      {line.running_balance < 0 ? " CR" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── JournalsPage.tsx ──────────────────────────────────────────────────────────
import { useQuery as useQueryJ } from "@tanstack/react-query";
import { FilePlus, Eye } from "lucide-react";
import { Badge as BadgeJ } from "@components/ui/Badge";
import {
  ManualJournalModal,
  JournalDetail as JD,
} from "@components/accounting/AccountComponents";
import { listJournals, getJournal } from "@services/accounting";
import { REFERENCE_TYPE_LABEL } from "@lib/constants/accountingConstants";
import { useActiveBusiness as useABJ } from "@hooks/useActiveBusiness";
import { fmtMoney as fmtJ, fmtDate as fmtDJ } from "@lib/format";

export function JournalsPage() {
  const { currency } = useABJ();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelected] = useState<string | null>(null);
  const [refTypeFilter, setRefType] = useState("");

  const { data, isLoading } = useQueryJ({
    queryKey: ["journals", refTypeFilter],
    queryFn: () => listJournals({ reference_type: refTypeFilter || undefined }),
  });
  const journals = data?.data ?? [];

  const { data: selected } = useQueryJ({
    queryKey: ["journal", selectedId],
    queryFn: () => getJournal(selectedId!),
    enabled: !!selectedId,
  });

  const refTypes = [
    "",
    "manual",
    "invoice",
    "sales_order",
    "pos_transaction",
    "expense",
    "payroll_run",
  ];

  return (
    <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Journal Entries"
        subtitle="All double-entry postings from every module — plus manual adjustments."
        crumbs={[
          { label: "Accounting", to: "/accounting" },
          { label: "Journals" },
        ]}
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <FilePlus className="h-4 w-4" />
            Manual Entry
          </Button>
        }
      />

      {/* Reference type filter pills */}
      <div className="flex gap-2 flex-wrap">
        {refTypes.map((t) => (
          <button
            key={t}
            onClick={() => setRefType(t)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              refTypeFilter === t
                ? "bg-brand-accent text-brand-black"
                : "bg-brand-graphite text-brand-cloud hover:bg-brand-graphite/70"
            }`}
          >
            {t === "" ? "All" : (REFERENCE_TYPE_LABEL[t] ?? t)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/5">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-brand-charcoal">
                {[
                  "Entry #",
                  "Date",
                  "Description",
                  "Source",
                  "Total DR",
                  "Status",
                  "",
                ].map((h) => (
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
              {journals.map((je) => (
                <tr
                  key={je.entry_id}
                  className="bg-brand-charcoal hover:bg-brand-graphite/20 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-brand-accent">
                    {je.entry_number}
                  </td>
                  <td className="px-4 py-3 text-brand-smoke">
                    {fmtDJ(je.entry_date)}
                  </td>
                  <td className="px-4 py-3 text-brand-cloud max-w-xs truncate">
                    {je.description}
                  </td>
                  <td className="px-4 py-3 text-xs text-brand-smoke">
                    {REFERENCE_TYPE_LABEL[je.reference_type] ??
                      je.reference_type}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-brand-cream">
                    {fmtJ(je.total_debit ?? 0, currency)}
                  </td>
                  <td className="px-4 py-3">
                    {je.is_reversed ? (
                      <BadgeJ tone="neutral" size="xs">
                        Reversed
                      </BadgeJ>
                    ) : (
                      <BadgeJ tone="sage" size="xs">
                        Posted
                      </BadgeJ>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(je.entry_id)}
                      className="text-brand-smoke hover:text-brand-accent transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ManualJournalModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          qc.invalidateQueries({ queryKey: ["journals"] });
        }}
      />

      <Modal
        open={!!selectedId}
        onClose={() => setSelected(null)}
        title="Journal Entry Detail"
        size="lg"
        surface="dark"
      >
        {selected && (
          <JD
            entry={selected}
            onReverse={() => setSelected(null)}
            currency={currency}
          />
        )}
      </Modal>
    </div>
  );
}

// ── ReportsPage.tsx ───────────────────────────────────────────────────────────
import { useState as useStateR } from "react";
import { useQuery as useQueryR } from "@tanstack/react-query";
import { Tabs } from "@components/ui/Tabs";
import {
  DateRangeFilter,
  PLReportView,
  BalanceSheetView,
  TrialBalanceView,
  CashFlowView,
} from "@components/accounting/ReportComponents";
import {
  getProfitAndLoss,
  getBalanceSheet,
  getTrialBalance,
  getCashFlow,
} from "@services/accounting";
import {
  REPORT_TABS,
  currentYearRange,
} from "@lib/constants/accountingConstants";
import { useActiveBusiness as useABR } from "@hooks/useActiveBusiness";

export function ReportsPage() {
  const { currency } = useABR();
  const yr = currentYearRange();
  const [tab, setTab] = useStateR("pl");
  const [startDate, setStart] = useStateR(yr.start);
  const [endDate, setEnd] = useStateR(yr.end);
  const [asOfDate, setAsOf] = useStateR(new Date().toISOString().split("T")[0]);

  const isBSTab = tab === "balance-sheet";

  const { data: plData, isFetching: plFetch } = useQueryR({
    queryKey: ["pl", startDate, endDate],
    queryFn: () =>
      getProfitAndLoss({ start_date: startDate, end_date: endDate }),
    enabled: tab === "pl",
  });
  const { data: bsData, isFetching: bsFetch } = useQueryR({
    queryKey: ["bs", asOfDate],
    queryFn: () => getBalanceSheet({ as_of_date: asOfDate }),
    enabled: isBSTab,
  });
  const { data: tbData, isFetching: tbFetch } = useQueryR({
    queryKey: ["tb", startDate, endDate],
    queryFn: () =>
      getTrialBalance({ start_date: startDate, end_date: endDate }),
    enabled: tab === "trial-balance",
  });
  const { data: cfData, isFetching: cfFetch } = useQueryR({
    queryKey: ["cf", startDate, endDate],
    queryFn: () => getCashFlow({ start_date: startDate, end_date: endDate }),
    enabled: tab === "cash-flow",
  });

  return (
    <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Financial Reports"
        subtitle="P&L, Balance Sheet, Trial Balance, and Cash Flow — all date-range configurable."
        crumbs={[
          { label: "Accounting", to: "/accounting" },
          { label: "Reports" },
        ]}
      />
      <Tabs
        tabs={REPORT_TABS.map((t) => ({ key: t.key, label: t.label }))}
        active={tab}
        onChange={setTab}
        surface="dark"
        variant="underline"
      />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onStartChange={setStart}
        onEndChange={setEnd}
        asOfDate={asOfDate}
        onAsOfChange={setAsOf}
        mode={isBSTab ? "as_of" : "range"}
      />

      {tab === "pl" && (
        <PLReportView report={plData} currency={currency} loading={plFetch} />
      )}
      {tab === "balance-sheet" && (
        <BalanceSheetView
          report={bsData}
          currency={currency}
          loading={bsFetch}
        />
      )}
      {tab === "trial-balance" && (
        <TrialBalanceView
          report={tbData}
          currency={currency}
          loading={tbFetch}
        />
      )}
      {tab === "cash-flow" && (
        <CashFlowView report={cfData} currency={currency} loading={cfFetch} />
      )}
    </div>
  );
}

// ── ReconciliationPage.tsx ────────────────────────────────────────────────────
import {
  useQuery as useQueryRec,
  useMutation as useMutRec,
  useQueryClient as useQCRec,
} from "@tanstack/react-query";
import {
  CheckCircle as CheckCircleRec,
  Upload as UploadIcon,
} from "lucide-react";
import { listBankStatements, reconcileItem } from "@services/accounting";
import { useActiveBusiness as useABRec } from "@hooks/useActiveBusiness";
import { fmtMoney as fmtRec, fmtDate as fmtDRec } from "@lib/format";
import { showToast as toastRec } from "@hooks/useToast";
import { errMsg as errRec } from "@services/api";

export function ReconciliationPage() {
  const { currency } = useABRec();
  const qc = useQCRec();
  const [filter, setFilter] = useState<"all" | "unreconciled">("unreconciled");
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState("");

  const { data: statements = [], isLoading } = useQueryRec({
    queryKey: ["bank-statements", filter],
    queryFn: () =>
      listBankStatements({
        reconciled: filter === "unreconciled" ? "false" : undefined,
      }),
  });

  const reconcileMutation = useMutRec({
    mutationFn: ({ sid, pid }: { sid: string; pid: string }) =>
      reconcileItem({ statement_id: sid, payment_id: pid }),
    onSuccess: () => {
      toastRec.success("Reconciled");
      qc.invalidateQueries({ queryKey: ["bank-statements"] });
      qc.invalidateQueries({ queryKey: ["accounting-dashboard"] });
      setMatchingId(null);
      setPaymentId("");
    },
    onError: (err) => toastRec.error(errRec(err)),
  });

  return (
    <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Bank Reconciliation"
        subtitle="Match bank statement lines to journal entries."
        crumbs={[
          { label: "Accounting", to: "/accounting" },
          { label: "Reconciliation" },
        ]}
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled
            title="CSV import — backend endpoint pending"
          >
            <UploadIcon className="h-4 w-4" />
            Import Statement
          </Button>
        }
      />

      <div className="flex gap-2">
        {(["unreconciled", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
              filter === f
                ? "bg-brand-accent text-brand-black"
                : "bg-brand-graphite text-brand-cloud"
            }`}
          >
            {f === "unreconciled" ? "Unreconciled" : "All"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/5">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-brand-charcoal">
                {["Date", "Description", "Amount", "Account", "Status", ""].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[0.65rem] font-semibold uppercase tracking-widest text-brand-smoke"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {statements.map((stmt) => (
                <tr
                  key={stmt.statement_id}
                  className="bg-brand-charcoal hover:bg-brand-graphite/20"
                >
                  <td className="px-4 py-3 text-brand-smoke">
                    {fmtDRec(stmt.transaction_date)}
                  </td>
                  <td className="px-4 py-3 text-brand-cloud max-w-xs truncate">
                    {stmt.description}
                  </td>
                  <td
                    className={`px-4 py-3 tabular-nums font-medium ${stmt.amount >= 0 ? "text-brand-cream" : "text-red-400"}`}
                  >
                    {fmtRec(Math.abs(stmt.amount), currency)}
                  </td>
                  <td className="px-4 py-3 text-brand-smoke">
                    {stmt.account_name}
                  </td>
                  <td className="px-4 py-3">
                    {stmt.is_reconciled ? (
                      <Badge tone="sage" size="xs">
                        Reconciled
                      </Badge>
                    ) : (
                      <Badge tone="warn" size="xs" dot>
                        Unmatched
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!stmt.is_reconciled &&
                      (matchingId === stmt.statement_id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={paymentId}
                            onChange={(e) => setPaymentId(e.target.value)}
                            placeholder="Journal entry ID"
                            className="rounded-lg border border-brand-graphite bg-brand-charcoal px-2 py-1 text-xs text-brand-cream w-36 focus:outline-none focus:border-brand-accent/40"
                          />
                          <button
                            onClick={() =>
                              reconcileMutation.mutate({
                                sid: stmt.statement_id,
                                pid: paymentId,
                              })
                            }
                            disabled={!paymentId}
                            className="text-green-400 hover:text-green-300 disabled:opacity-40"
                          >
                            <CheckCircleRec className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setMatchingId(stmt.statement_id)}
                          className="text-xs text-brand-smoke hover:text-brand-accent transition-colors"
                        >
                          Match
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
              {statements.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-brand-smoke"
                  >
                    {filter === "unreconciled"
                      ? "All items reconciled."
                      : "No bank statements imported yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── FiscalPeriodsPage.tsx ─────────────────────────────────────────────────────
import {
  useQuery as useQueryFP,
  useMutation as useMutFP,
  useQueryClient as useQCFP,
} from "@tanstack/react-query";
import { Lock, Unlock } from "lucide-react";
import {
  listFiscalPeriods,
  closePeriod,
  reopenPeriod,
} from "@services/accounting";
import { fmtDate as fmtFP } from "@lib/format";
import { showToast as toastFP } from "@hooks/useToast";
import { errMsg as errFP } from "@services/api";

export function FiscalPeriodsPage() {
  const qc = useQCFP();

  const { data: periods = [], isLoading } = useQueryFP({
    queryKey: ["fiscal-periods"],
    queryFn: listFiscalPeriods,
  });

  const closeMut = useMutFP({
    mutationFn: closePeriod,
    onSuccess: () => {
      toastFP.success("Period closed — journals can no longer be backdated");
      qc.invalidateQueries({ queryKey: ["fiscal-periods"] });
    },
    onError: (err) => toastFP.error(errFP(err)),
  });

  const reopenMut = useMutFP({
    mutationFn: reopenPeriod,
    onSuccess: () => {
      toastFP.success("Period reopened — use carefully");
      qc.invalidateQueries({ queryKey: ["fiscal-periods"] });
    },
    onError: (err) => toastFP.error(errFP(err)),
  });

  return (
    <div className="px-4 sm:px-8 py-6 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="Fiscal Periods"
        subtitle="Close periods to prevent backdated journal entries. Reopening requires approval."
        crumbs={[
          { label: "Accounting", to: "/accounting" },
          { label: "Fiscal Periods" },
        ]}
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-brand-charcoal">
                {["Period", "Type", "Dates", "Status", ""].map((h) => (
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
              {periods.map((period) => (
                <tr key={period.period_id} className="bg-brand-charcoal">
                  <td className="px-4 py-3 font-medium text-brand-cream">
                    {period.name}
                  </td>
                  <td className="px-4 py-3 text-brand-smoke capitalize">
                    {period.period_type}
                  </td>
                  <td className="px-4 py-3 text-brand-smoke">
                    {fmtFP(period.start_date)} — {fmtFP(period.end_date)}
                  </td>
                  <td className="px-4 py-3">
                    {period.is_closed ? (
                      <Badge tone="neutral" size="xs">
                        Closed
                      </Badge>
                    ) : (
                      <Badge tone="sage" size="xs" dot>
                        Open
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!period.is_closed ? (
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Close ${period.name}? This will prevent any new journals for this period.`,
                            )
                          )
                            closeMut.mutate(period.period_id);
                        }}
                        className="flex items-center gap-1.5 text-xs text-brand-smoke hover:text-amber-400 transition-colors"
                      >
                        <Lock className="h-3.5 w-3.5" /> Close
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Reopen ${period.name}? This allows backdated entries. Use with caution.`,
                            )
                          )
                            reopenMut.mutate(period.period_id);
                        }}
                        className="flex items-center gap-1.5 text-xs text-brand-smoke hover:text-brand-accent transition-colors"
                      >
                        <Unlock className="h-3.5 w-3.5" /> Reopen
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {periods.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-brand-smoke"
                  >
                    No fiscal periods configured. Seed the fiscal_periods table.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
