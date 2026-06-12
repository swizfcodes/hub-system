import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Wallet, Star, Archive, Pencil } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Switch } from "@components/ui/Switch";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import { Modal } from "@components/ui/Modal";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { DropdownMenu } from "@components/ui/DropdownMenu";
import { ConfirmationModal } from "@components/ui/ConfirmationModal";
import {
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deactivateBankAccount,
} from "@services/settings/bankAccounts";
import { listBusinesses } from "@services/settings/businesses";
import { useBusinessStore } from "@stores/useBusinessStore";
import {
  bankAccountSchema,
  type BankAccountValues,
} from "@lib/schemas/bankAccount";
import { CURRENCIES } from "@lib/constants/currencies";
import { maskAccountNumber } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { BankAccount } from "@typedefs/settings";

export default function BankAccounts() {
  const qc = useQueryClient();
  const active = useBusinessStore((s) => s.active);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<BankAccount | null>(null);

  const { data: businesses = [] } = useQuery({
    queryKey: ["settings", "businesses", "active"],
    queryFn: () => listBusinesses(false),
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["settings", "bank-accounts", { business: active }],
    queryFn: () => listBankAccounts(active ?? undefined),
    enabled: !!active,
  });

  const archive = useMutation({
    mutationFn: (id: string) => deactivateBankAccount(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "bank-accounts"] });
      showToast.success("Bank account archived");
      setArchiving(null);
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <>
      <Topbar title="Bank Accounts" subtitle={`Banking · ${active ?? "—"}`} />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-5xl mx-auto">
        <PageHeader
          title="Bank Accounts"
          subtitle="Bank accounts per business. One account per business+currency can be marked primary — that's the default account for payouts and settlements."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Settings", to: "/settings" },
            { label: "Bank Accounts" },
          ]}
          actions={
            <Button
              variant="gold"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setCreating(true)}
              disabled={!active}
            >
              Add Account
            </Button>
          }
        />

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={<Wallet className="w-7 h-7" />}
            title="No bank accounts yet"
            description={`Add the first bank account for ${active ?? "this business"}.`}
            action={
              <Button
                variant="gold"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setCreating(true)}
              >
                Add account
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {accounts.map((acc) => (
              <Card
                key={acc.account_id}
                className="p-5 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-brand-graphite text-brand-accent flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-brand-cream">
                      {acc.bank_name}
                    </span>
                    {acc.is_primary && (
                      <Badge tone="gold" size="xs">
                        <Star className="w-3 h-3" /> Primary
                      </Badge>
                    )}
                    <Badge tone="neutral" size="xs">
                      {acc.currency}
                    </Badge>
                    {!acc.is_active && (
                      <Badge tone="danger" size="xs">
                        Archived
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-brand-cloud mt-1">
                    {acc.account_name}
                  </div>
                  <div className="text-xs font-mono text-brand-smoke mt-0.5">
                    {maskAccountNumber(acc.account_number)}
                  </div>
                </div>
                <DropdownMenu
                  items={[
                    {
                      label: "Edit",
                      icon: <Pencil className="w-3.5 h-3.5" />,
                      onClick: () => setEditing(acc),
                    },
                    {
                      label: "Archive",
                      icon: <Archive className="w-3.5 h-3.5" />,
                      destructive: true,
                      disabled: !acc.is_active,
                      onClick: () => setArchiving(acc),
                    },
                  ]}
                />
              </Card>
            ))}
          </div>
        )}
      </div>

      <BankAccountFormModal
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        editing={editing}
        defaultBusiness={active}
        businesses={businesses.map((b) => ({
          value: b.business_key,
          label: b.display_name,
        }))}
      />

      <ConfirmationModal
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={() => {
          archiving && archive.mutateAsync(archiving.account_id);
        }}
        title={`Archive “${archiving?.bank_name}”?`}
        message={
          <p>
            This account will no longer appear in payment selectors. Past
            transactions remain.
          </p>
        }
        confirmLabel="Archive"
        loading={archive.isPending}
      />
    </>
  );
}

function BankAccountFormModal({
  open,
  onClose,
  editing,
  defaultBusiness,
  businesses,
}: {
  open: boolean;
  onClose: () => void;
  editing: BankAccount | null;
  defaultBusiness: string | null;
  businesses: { value: string; label: string }[];
}) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    control: _c,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BankAccountValues>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: editing
      ? {
          business: editing.business,
          bank_name: editing.bank_name,
          account_name: editing.account_name,
          account_number: editing.account_number,
          sort_code: editing.sort_code ?? "",
          currency: editing.currency,
          is_primary: editing.is_primary,
          paystack_recipient_code: editing.paystack_recipient_code ?? "",
          flutterwave_bank_code: editing.flutterwave_bank_code ?? "",
        }
      : {
          business: defaultBusiness ?? "",
          bank_name: "",
          account_name: "",
          account_number: "",
          sort_code: "",
          currency: "NGN",
          is_primary: false,
          paystack_recipient_code: "",
          flutterwave_bank_code: "",
        },
  });

  const isPrimary = watch("is_primary");

  const mutation = useMutation({
    mutationFn: (v: BankAccountValues) =>
      editing ? updateBankAccount(editing.account_id, v) : createBankAccount(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "bank-accounts"] });
      showToast.success(editing ? "Account updated" : "Account added");
      reset();
      onClose();
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      surface="light"
      size="md"
      title={editing ? "Edit bank account" : "New bank account"}
      footer={
        <>
          <Button
            variant="outline-light"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={isSubmitting || mutation.isPending}
            onClick={handleSubmit((v) => mutation.mutate(v))}
          >
            {editing ? "Save changes" : "Add account"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        noValidate
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            {...register("business")}
            label="Business"
            options={businesses}
            error={errors.business?.message}
          />
          <Select
            {...register("currency")}
            label="Currency"
            options={CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
            error={errors.currency?.message}
          />
          <Input
            {...register("bank_name")}
            label="Bank name"
            placeholder="GTBank"
            className="sm:col-span-2"
            error={errors.bank_name?.message}
          />
          <Input
            {...register("account_name")}
            label="Account name"
            placeholder="e.g. My Brand Ltd"
            className="sm:col-span-2"
            error={errors.account_name?.message}
          />
          <Input
            {...register("account_number")}
            label="Account number"
            placeholder="0123456789"
            error={errors.account_number?.message}
          />
          <Input
            {...register("sort_code")}
            label="Sort code"
            placeholder="058152036"
            hint="Optional"
          />
          <Input
            {...register("paystack_recipient_code")}
            label="Paystack recipient code"
            hint="Optional"
          />
          <Input
            {...register("flutterwave_bank_code")}
            label="Flutterwave bank code"
            hint="Optional"
          />
        </div>
        <div className="p-3 rounded-xl bg-brand-cream/50 border border-brand-cloud/40">
          <Switch
            surface="light"
            checked={!!isPrimary}
            onChange={(v) => setValue("is_primary", v)}
            label="Primary account"
            description="Only one primary per business+currency. Setting this will demote any existing primary."
          />
        </div>
      </form>
    </Modal>
  );
}
