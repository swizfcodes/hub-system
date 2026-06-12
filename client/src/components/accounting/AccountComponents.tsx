/**
 * AccountComponents.tsx
 * Exports: AccountTypeBadge, COATable, AccountFormModal,
 *          ManualJournalModal, JournalDetail
 */
import { useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { NumberField } from "@components/ui/NumberField";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, RotateCcw, Lock, Eye } from "lucide-react";
import { Badge } from "@components/ui/Badge";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import {
  ACCOUNT_TYPE_META,
  ACCOUNT_TYPE_OPTIONS,
  ACCOUNT_SUBTYPE_OPTIONS,
  REFERENCE_TYPE_LABEL,
} from "@lib/constants/accountingConstants";
import {
  createAccountSchema,
  type CreateAccountValues,
  createJournalSchema,
  type CreateJournalValues,
} from "@lib/schemas/accounting";
import {
  listAccounts,
  createAccount,
  updateAccount,
  createManualJournal,
  reverseJournal,
} from "@services/accounting";
import { fmtMoney, fmtDate } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { cn } from "@lib/cn";
import type { Account, JournalEntry, AccountType } from "@typedefs/accounting";

// ── AccountTypeBadge ──────────────────────────────────────────────────────────

export function AccountTypeBadge({
  type,
  size = "xs",
}: {
  type: AccountType;
  size?: "xs" | "sm";
}) {
  const meta = ACCOUNT_TYPE_META[type];
  return (
    <Badge tone={meta.tone} size={size}>
      {meta.label}
    </Badge>
  );
}

// ── COATable ──────────────────────────────────────────────────────────────────

interface COATableProps {
  accounts: Account[];
  onEdit: (account: Account) => void;
  onLedger: (account: Account) => void;
  currency?: string;
}

export function COATable({
  accounts,
  onEdit,
  onLedger,
  currency: _currency = "NGN",
}: COATableProps) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = accounts.filter((a) => {
    if (typeFilter !== "all" && a.account_type !== typeFilter) return false;
    if (
      search &&
      !a.account_name.toLowerCase().includes(search.toLowerCase()) &&
      !a.account_code.includes(search)
    )
      return false;
    return true;
  });

  const typeButtons = [
    "all",
    "asset",
    "liability",
    "equity",
    "income",
    "expense",
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search accounts…"
          className="rounded-xl border border-white/10 bg-brand-charcoal px-3 py-2 text-sm text-brand-cream placeholder:text-brand-smoke/40 focus:border-brand-accent/40 focus:outline-none"
        />
        <div className="flex gap-1.5 flex-wrap">
          {typeButtons.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                typeFilter === t
                  ? "bg-brand-accent text-brand-black"
                  : "bg-brand-graphite text-brand-cloud hover:bg-brand-graphite/70",
              )}
            >
              {t === "all" ? "All" : ACCOUNT_TYPE_META[t as AccountType].label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/5">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-brand-charcoal">
              {["Code", "Account Name", "Type", "Subtype", "Status", ""].map(
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
            {filtered.map((acc) => (
              <tr
                key={acc.account_id}
                className={cn(
                  "bg-brand-charcoal hover:bg-brand-graphite/20 transition-colors",
                  !acc.is_active && "opacity-50",
                )}
              >
                <td className="px-4 py-3 font-mono text-xs text-brand-accent">
                  {acc.account_code}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-brand-cream">{acc.account_name}</span>
                    {acc.is_system && (
                      <span title="System account">
                        <Lock className="h-3 w-3 text-brand-smoke/50" />
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <AccountTypeBadge type={acc.account_type} />
                </td>
                <td className="px-4 py-3 text-brand-smoke text-xs capitalize">
                  {acc.account_subtype?.replace(/_/g, " ") ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={acc.is_active ? "sage" : "neutral"} size="xs">
                    {acc.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onLedger(acc)}
                      title="View Ledger"
                      className="text-brand-smoke hover:text-brand-accent transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onEdit(acc)}
                      title="Edit"
                      className="text-brand-smoke hover:text-brand-accent transition-colors"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-brand-smoke"
                >
                  No accounts match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── AccountFormModal ──────────────────────────────────────────────────────────

interface AccountFormModalProps {
  open: boolean;
  onClose: () => void;
  existing?: Account;
}

export function AccountFormModal({
  open,
  onClose,
  existing,
}: AccountFormModalProps) {
  const qc = useQueryClient();
  const isEdit = !!existing;
  const isSystem = existing?.is_system ?? false;

  const form = useForm<CreateAccountValues>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      account_code: existing?.account_code ?? "",
      account_name: existing?.account_name ?? "",
      account_type: existing?.account_type ?? "expense",
      account_subtype: existing?.account_subtype ?? "",
      parent_account_id: existing?.parent_account_id ?? "",
      description: existing?.description ?? "",
    },
  });

  const watchedType = form.watch("account_type");

  const mutation = useMutation({
    mutationFn: (values: CreateAccountValues) =>
      isEdit
        ? updateAccount(existing!.account_id, values)
        : createAccount(values),
    onSuccess: () => {
      showToast.success(isEdit ? "Account updated" : "Account created");
      qc.invalidateQueries({ queryKey: ["coa"] });
      form.reset();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Account" : "New Account"}
      size="md"
      surface="light"
      footer={
        <div className="flex justify-end gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit((v) => mutation.mutate(v))}
            loading={mutation.isPending}
          >
            {isEdit ? "Save" : "Create Account"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {isSystem && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-900/10 px-4 py-3 text-xs text-amber-300">
            <Lock className="h-4 w-4 shrink-0 mt-px" />
            System account — code, name, and type cannot be changed. You may
            update the description or archive it.
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="account_code"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input
                {...field}
                label="Code *"
                placeholder="e.g. 6100"
                surface="light"
                disabled={isSystem}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            name="account_type"
            control={form.control}
            render={({ field }) => (
              <Select
                label="Type *"
                options={ACCOUNT_TYPE_OPTIONS}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                surface="light"
                disabled={isSystem}
              />
            )}
          />
        </div>
        <Controller
          name="account_name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              label="Name *"
              placeholder="e.g. Rent & Rates"
              surface="light"
              disabled={isSystem}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          name="account_subtype"
          control={form.control}
          render={({ field }) => (
            <Select
              label="Subtype"
              options={[
                { value: "", label: "None" },
                ...(ACCOUNT_SUBTYPE_OPTIONS[watchedType] ?? []),
              ]}
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value)}
              surface="light"
            />
          )}
        />
        <Controller
          name="description"
          control={form.control}
          render={({ field }) => (
            <Input
              {...field}
              label="Description"
              placeholder="Optional notes"
              surface="light"
            />
          )}
        />
      </div>
    </Modal>
  );
}

// ── ManualJournalModal ────────────────────────────────────────────────────────

interface ManualJournalModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export function ManualJournalModal({
  open,
  onClose,
  onCreated,
}: ManualJournalModalProps) {
  const qc = useQueryClient();
  const { currency } = useActiveBusiness();

  const { data: accounts = [] } = useQuery({
    queryKey: ["coa"],
    queryFn: () => listAccounts({ active: "true" }),
    staleTime: 5 * 60_000,
  });

  const accountOptions = accounts.map((a) => ({
    value: a.account_id,
    label: `${a.account_code} — ${a.account_name}`,
  }));

  const form = useForm<CreateJournalValues>({
    resolver: zodResolver(createJournalSchema),
    defaultValues: {
      entry_date: new Date().toISOString().split("T")[0],
      description: "",
      lines: [
        { account_id: "", debit: 0, credit: 0, description: "" },
        { account_id: "", debit: 0, credit: 0, description: "" },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const watchedLines = form.watch("lines");

  const totalDebit = watchedLines.reduce(
    (s, l) => s + (parseFloat(String(l.debit)) || 0),
    0,
  );
  const totalCredit = watchedLines.reduce(
    (s, l) => s + (parseFloat(String(l.credit)) || 0),
    0,
  );
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const mutation = useMutation({
    mutationFn: createManualJournal,
    onSuccess: (entry) => {
      showToast.success("Journal entry posted");
      qc.invalidateQueries({ queryKey: ["journals"] });
      form.reset();
      onCreated?.(entry.entry_id);
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Manual Journal Entry"
      size="xl"
      surface="light"
      footer={
        <div className="flex items-center justify-between gap-3">
          {/* Live balance indicator */}
          <div
            className={cn(
              "text-xs font-mono px-3 py-1.5 rounded-lg",
              isBalanced
                ? "bg-green-900/20 text-green-400"
                : "bg-red-900/20 text-red-400",
            )}
          >
            {isBalanced
              ? "✓ Balanced"
              : `Out of balance: DR ${fmtMoney(totalDebit, currency)} ≠ CR ${fmtMoney(totalCredit, currency)}`}
          </div>
          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit((v) => mutation.mutate(v))}
              loading={mutation.isPending}
              disabled={!isBalanced}
            >
              Post Entry
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="entry_date"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input
                {...field}
                label="Date *"
                type="date"
                surface="light"
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            name="description"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input
                {...field}
                label="Description *"
                placeholder="Purpose of this entry"
                surface="light"
                error={fieldState.error?.message}
              />
            )}
          />
        </div>

        {/* Journal lines */}
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[0.65rem] uppercase tracking-widest text-brand-smoke px-1">
            <div className="col-span-4">Account</div>
            <div className="col-span-2">Debit (₦)</div>
            <div className="col-span-2">Credit (₦)</div>
            <div className="col-span-3">Narration</div>
            <div className="col-span-1" />
          </div>

          {fields.map((field, i) => (
            <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-4">
                <Controller
                  name={`lines.${i}.account_id`}
                  control={form.control}
                  render={({ field: f, fieldState }) => (
                    <Select
                      options={accountOptions}
                      placeholder="Select account…"
                      value={f.value}
                      onChange={(e) => f.onChange(e.target.value)}
                      surface="light"
                      error={fieldState.error?.message}
                    />
                  )}
                />
              </div>
              <div className="col-span-2">
                <Controller
                  name={`lines.${i}.debit`}
                  control={form.control}
                  render={({ field: f }) => (
                    <NumberField
                      surface="light"
                      decimal
                      placeholder="0.00"
                      value={f.value}
                      onValueChange={(v) => f.onChange(v ?? 0)}
                      onBlur={f.onBlur}
                    />
                  )}
                />
              </div>
              <div className="col-span-2">
                <Controller
                  name={`lines.${i}.credit`}
                  control={form.control}
                  render={({ field: f }) => (
                    <NumberField
                      surface="light"
                      decimal
                      placeholder="0.00"
                      value={f.value}
                      onValueChange={(v) => f.onChange(v ?? 0)}
                      onBlur={f.onBlur}
                    />
                  )}
                />
              </div>
              <div className="col-span-3">
                <Controller
                  name={`lines.${i}.description`}
                  control={form.control}
                  render={({ field: f }) => (
                    <Input {...f} placeholder="Narration" surface="light" />
                  )}
                />
              </div>
              <div className="col-span-1 flex items-start pt-1">
                {fields.length > 2 && (
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-brand-smoke hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              append({ account_id: "", debit: 0, credit: 0, description: "" })
            }
            className="flex items-center gap-1.5 text-xs text-brand-smoke hover:text-brand-accent transition-colors mt-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add line
          </button>
        </div>

        {/* Totals row */}
        <div className="grid grid-cols-12 gap-2 border-t border-brand-graphite pt-2 text-sm font-semibold">
          <div className="col-span-4 text-brand-smoke">Totals</div>
          <div
            className={cn(
              "col-span-2 tabular-nums",
              totalDebit > 0 ? "text-brand-cream" : "text-brand-smoke/40",
            )}
          >
            {fmtMoney(totalDebit, currency)}
          </div>
          <div
            className={cn(
              "col-span-2 tabular-nums",
              totalCredit > 0 ? "text-brand-cream" : "text-brand-smoke/40",
            )}
          >
            {fmtMoney(totalCredit, currency)}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── JournalDetail ─────────────────────────────────────────────────────────────

interface JournalDetailProps {
  entry: JournalEntry;
  onReverse: () => void;
  currency?: string;
}

export function JournalDetail({
  entry,
  onReverse,
  currency = "NGN",
}: JournalDetailProps) {
  const qc = useQueryClient();
  const reverseMutation = useMutation({
    mutationFn: () => reverseJournal(entry.entry_id),
    onSuccess: () => {
      showToast.success("Journal reversed");
      qc.invalidateQueries({ queryKey: ["journals"] });
      onReverse();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const totalDebit = (entry.lines ?? []).reduce(
    (s, l) => s + parseFloat(String(l.debit)),
    0,
  );
  const totalCredit = (entry.lines ?? []).reduce(
    (s, l) => s + parseFloat(String(l.credit)),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-brand-smoke text-xs">Entry Number</p>
          <p className="font-mono text-brand-accent">{entry.entry_number}</p>
        </div>
        <div>
          <p className="text-brand-smoke text-xs">Date</p>
          <p className="text-brand-cream">{fmtDate(entry.entry_date)}</p>
        </div>
        <div>
          <p className="text-brand-smoke text-xs">Reference</p>
          <p className="text-brand-cream">
            {REFERENCE_TYPE_LABEL[entry.reference_type] ?? entry.reference_type}
          </p>
        </div>
        <div>
          <p className="text-brand-smoke text-xs">Status</p>
          {entry.is_reversed ? (
            <Badge tone="neutral" size="xs">
              Reversed
            </Badge>
          ) : (
            <Badge tone="sage" size="xs">
              Posted
            </Badge>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-brand-graphite/30">
              {["Account", "Narration", "Debit", "Credit"].map((h) => (
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
            {(entry.lines ?? []).map((line, i) => (
              <tr key={i} className="bg-brand-charcoal">
                <td className="px-3 py-2">
                  <p className="font-mono text-xs text-brand-accent">
                    {line.account_code}
                  </p>
                  <p className="text-brand-cloud">{line.account_name}</p>
                </td>
                <td className="px-3 py-2 text-brand-smoke">
                  {line.description ?? "—"}
                </td>
                <td className="px-3 py-2 tabular-nums text-brand-cream">
                  {line.debit > 0 ? fmtMoney(line.debit, currency) : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums text-brand-cream">
                  {line.credit > 0 ? fmtMoney(line.credit, currency) : "—"}
                </td>
              </tr>
            ))}
            <tr className="border-t border-white/10 bg-brand-graphite/20 font-semibold">
              <td
                colSpan={2}
                className="px-3 py-2 text-brand-smoke text-xs uppercase tracking-wide"
              >
                Totals
              </td>
              <td className="px-3 py-2 tabular-nums text-brand-cream">
                {fmtMoney(totalDebit, currency)}
              </td>
              <td className="px-3 py-2 tabular-nums text-brand-cream">
                {fmtMoney(totalCredit, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {!entry.is_reversed && (
        <div className="flex justify-end">
          <Button
            variant="danger"
            size="sm"
            onClick={() => reverseMutation.mutate()}
            loading={reverseMutation.isPending}
          >
            <RotateCcw className="h-4 w-4" />
            Reverse Entry
          </Button>
        </div>
      )}
    </div>
  );
}
