/**
 * LoyaltyComponents.tsx
 * Exports: TierBadge, PointsCard, TransactionList,
 *          TierFormModal, RedeemModal, AwardModal
 */
import { useForm, Controller } from "react-hook-form";
import { NumberField } from "@components/ui/NumberField";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trophy, Award, Minus, Plus } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import {
  createTier,
  updateTier,
  redeemPoints,
  manualAward,
} from "@services/loyalty";
import {
  TRANSACTION_TYPE_META,
  DEFAULT_TIER_COLOURS,
  createTierSchema,
  awardPointsSchema,
  redeemPointsSchema,
  type CreateTierValues,
  type AwardPointsValues,
  type RedeemPointsValues,
} from "@lib/constants/loyaltyConstants";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtDate } from "@lib/format";
import { cn } from "@lib/cn";
import type { LoyaltyTier, LoyaltyTransaction } from "@typedefs/loyalty";

// ── TierBadge ─────────────────────────────────────────────────────────────────

export function TierBadge({
  tier,
  size = "sm",
}: {
  tier: LoyaltyTier | null;
  size?: "xs" | "sm" | "md";
}) {
  if (!tier) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-white/10 font-medium text-brand-smoke",
          size === "xs"
            ? "px-1.5 py-0.5 text-[0.55rem]"
            : size === "md"
              ? "px-3 py-1 text-xs"
              : "px-2 py-0.5 text-[0.65rem]",
        )}
      >
        No Tier
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        size === "xs"
          ? "px-2 py-0.5 text-[0.55rem]"
          : size === "md"
            ? "px-3 py-1 text-sm"
            : "px-2.5 py-0.5 text-xs",
      )}
      style={{
        color: tier.colour,
        borderColor: `${tier.colour}50`,
        backgroundColor: `${tier.colour}18`,
      }}
    >
      <Trophy className={cn(size === "md" ? "h-4 w-4" : "h-3 w-3")} />
      {tier.tier_name}
    </span>
  );
}

// ── PointsCard ────────────────────────────────────────────────────────────────

export function PointsCard({
  balance,
  tier,
  onRedeem,
  onAward,
  canApprove = false,
}: {
  balance: number;
  tier: LoyaltyTier | null;
  onRedeem: () => void;
  onAward: () => void;
  canApprove?: boolean;
}) {
  const accentColor = tier?.colour ?? "#9E9891";

  return (
    <div
      className="rounded-2xl border p-5 space-y-4"
      style={{
        borderColor: `${accentColor}30`,
        background: `linear-gradient(135deg, ${accentColor}10 0%, transparent 60%)`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-1">
            Points Balance
          </p>
          <p
            className="font-display text-4xl font-light tabular-nums"
            style={{ color: accentColor }}
          >
            {balance.toLocaleString()}
          </p>
          <p className="text-[0.65rem] text-brand-smoke mt-0.5">
            loyalty points
          </p>
        </div>
        <TierBadge tier={tier} size="md" />
      </div>

      {tier && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-brand-smoke">
            <span>{tier.min_points.toLocaleString()} pts</span>
            <span>
              {tier.max_points
                ? `${tier.max_points.toLocaleString()} pts`
                : "No limit"}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-brand-graphite overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                backgroundColor: accentColor,
                width: tier.max_points
                  ? `${Math.min(100, ((balance - tier.min_points) / (tier.max_points - tier.min_points)) * 100).toFixed(0)}%`
                  : "100%",
              }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={onRedeem} fullWidth>
          <Minus className="h-3.5 w-3.5" />
          Redeem
        </Button>
        {canApprove && (
          <Button size="sm" variant="ghost" onClick={onAward} fullWidth>
            <Plus className="h-3.5 w-3.5" />
            Award
          </Button>
        )}
      </div>
    </div>
  );
}

// ── TransactionList ───────────────────────────────────────────────────────────

export function TransactionList({
  transactions,
}: {
  transactions: LoyaltyTransaction[];
}) {
  if (!transactions.length) {
    return (
      <div className="py-8 text-center rounded-xl border border-white/5">
        <Award className="mx-auto h-8 w-8 text-brand-smoke/30 mb-2" />
        <p className="text-sm text-brand-smoke">No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {transactions.map((tx) => {
        const meta = TRANSACTION_TYPE_META[tx.transaction_type];
        const isPositive = tx.points > 0;

        return (
          <div
            key={tx.transaction_id}
            className="flex items-center gap-3 rounded-xl px-4 py-3 border border-white/5 hover:border-white/10 transition-colors"
            style={{ backgroundColor: meta.bgColor }}
          >
            {/* Type pill */}
            <div
              className="shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide"
              style={{ color: meta.color, backgroundColor: `${meta.color}25` }}
            >
              {meta.label}
            </div>

            {/* Notes / reference */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-brand-cream truncate">
                {tx.notes ??
                  (tx.reference_type ? `Ref: ${tx.reference_type}` : "—")}
              </p>
              <p className="text-[10px] text-brand-smoke/60">
                {fmtDate(tx.created_at)}
              </p>
            </div>

            {/* Points */}
            <p
              className="font-semibold tabular-nums text-sm shrink-0"
              style={{ color: meta.color }}
            >
              {isPositive ? "+" : ""}
              {tx.points.toLocaleString()}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── TierFormModal ─────────────────────────────────────────────────────────────

interface TierFormModalProps {
  open: boolean;
  onClose: () => void;
  existing?: LoyaltyTier | null;
}

export function TierFormModal({ open, onClose, existing }: TierFormModalProps) {
  const qc = useQueryClient();
  const isEdit = !!existing;

  const form = useForm<CreateTierValues>({
    resolver: zodResolver(createTierSchema),
    defaultValues: {
      tier_name: existing?.tier_name ?? "",
      min_points: existing?.min_points ?? 0,
      max_points: existing?.max_points ?? undefined,
      colour: existing?.colour ?? DEFAULT_TIER_COLOURS[0],
      display_order: existing?.display_order ?? 0,
      benefits: existing?.benefits ?? {},
    },
  });

  const mutation = useMutation({
    mutationFn: (values: CreateTierValues) =>
      isEdit ? updateTier(existing!.tier_id, values) : createTier(values),
    onSuccess: () => {
      showToast.success(isEdit ? "Tier updated" : "Tier created");
      qc.invalidateQueries({ queryKey: ["loyalty-tiers"] });
      form.reset();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const watchedColour = form.watch("colour");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Tier" : "New Tier"}
      size="sm"
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
            {isEdit ? "Save Changes" : "Create Tier"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Controller
          name="tier_name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              label="Tier Name *"
              placeholder="e.g. Silver, Gold, Platinum"
              surface="light"
              error={fieldState.error?.message}
            />
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="min_points"
            control={form.control}
            render={({ field, fieldState }) => (
              <NumberField
                surface="light"
                label="Min Points *"
                placeholder="0"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            name="max_points"
            control={form.control}
            render={({ field, fieldState }) => (
              <NumberField
                surface="light"
                label="Max Points"
                placeholder="∞"
                value={field.value ?? undefined}
                onValueChange={(v) => field.onChange(v ?? null)}
                onBlur={field.onBlur}
                hint="Leave blank for top tier"
                error={fieldState.error?.message}
              />
            )}
          />
        </div>

        {/* Colour picker */}
        <div className="space-y-2">
          <p className="text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted">
            Tier Colour
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {DEFAULT_TIER_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => form.setValue("colour", c)}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-all",
                  watchedColour === c
                    ? "border-gray-800 scale-110"
                    : "border-transparent",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              {...form.register("colour")}
              className="h-7 w-7 rounded-full border-2 border-gray-200 cursor-pointer overflow-hidden"
              title="Custom colour"
            />
          </div>
          {form.formState.errors.colour && (
            <p className="text-xs text-state-danger">
              {form.formState.errors.colour.message}
            </p>
          )}
        </div>

        <Controller
          name="display_order"
          control={form.control}
          render={({ field }) => (
            <NumberField
              surface="light"
              label="Display Order"
              placeholder="0"
              hint="Lower number = higher position in tier list"
              value={field.value}
              onValueChange={(v) => field.onChange(v ?? 0)}
              onBlur={field.onBlur}
            />
          )}
        />
      </div>
    </Modal>
  );
}

// ── RedeemModal ───────────────────────────────────────────────────────────────

interface RedeemModalProps {
  open: boolean;
  onClose: () => void;
  contactId: string;
  balance: number;
}

export function RedeemModal({
  open,
  onClose,
  contactId,
  balance,
}: RedeemModalProps) {
  const qc = useQueryClient();
  const form = useForm<RedeemPointsValues>({
    resolver: zodResolver(redeemPointsSchema),
    defaultValues: { points: 0, reference_type: "manual" },
  });

  const mutation = useMutation({
    mutationFn: (values: RedeemPointsValues) => redeemPoints(contactId, values),
    onSuccess: (result) => {
      showToast.success(
        `Redeemed! New balance: ${result.balance_after.toLocaleString()} pts`,
      );
      qc.invalidateQueries({ queryKey: ["contact-loyalty", contactId] });
      form.reset();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Redeem Points"
      size="sm"
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
            variant="gold"
            onClick={form.handleSubmit((v) => mutation.mutate(v))}
            loading={mutation.isPending}
          >
            Redeem Points
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-brand-accent/20 bg-brand-accent/5 px-4 py-3 text-sm">
          <span className="text-brand-smoke">Current balance: </span>
          <span className="font-semibold text-brand-accent">
            {balance.toLocaleString()} pts
          </span>
        </div>
        <Controller
          name="points"
          control={form.control}
          render={({ field, fieldState }) => (
            <NumberField
              surface="light"
              label="Points to Redeem *"
              placeholder="0"
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              hint={`Max: ${balance.toLocaleString()} pts`}
            />
          )}
        />
      </div>
    </Modal>
  );
}

// ── AwardModal ────────────────────────────────────────────────────────────────

interface AwardModalProps {
  open: boolean;
  onClose: () => void;
  contactId: string;
}

export function AwardModal({ open, onClose, contactId }: AwardModalProps) {
  const qc = useQueryClient();
  const form = useForm<AwardPointsValues>({
    resolver: zodResolver(awardPointsSchema),
    defaultValues: { points: 0, transaction_type: "bonus", notes: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: AwardPointsValues) => manualAward(contactId, values),
    onSuccess: (result) => {
      showToast.success(
        `Done. New balance: ${result.balance_after.toLocaleString()} pts`,
      );
      qc.invalidateQueries({ queryKey: ["contact-loyalty", contactId] });
      form.reset();
      onClose();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Award / Adjust Points"
      size="sm"
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
            Confirm
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Controller
          name="transaction_type"
          control={form.control}
          render={({ field }) => (
            <Select
              label="Type"
              surface="light"
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              options={[
                {
                  value: "bonus",
                  label: "Bonus — add points (promotion, reward)",
                },
                {
                  value: "adjustment",
                  label: "Adjustment — correct an error (can be negative)",
                },
              ]}
            />
          )}
        />
        <Controller
          name="points"
          control={form.control}
          render={({ field, fieldState }) => (
            <NumberField
              surface="light"
              allowNegative
              label="Points *"
              placeholder="0"
              hint="Use a negative number for a downward adjustment"
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          name="notes"
          control={form.control}
          render={({ field }) => (
            <Input
              {...field}
              label="Notes"
              placeholder="Reason for this award or adjustment"
              surface="light"
            />
          )}
        />
      </div>
    </Modal>
  );
}
