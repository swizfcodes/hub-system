/**
 * RetailPartnerComponents.tsx
 * Exports: PartnerBadge, ConsignmentBadge, SettlementBadge,
 *          PartnerFormModal, SendConsignmentModal, RecallConsignmentModal,
 *          ReportSaleModal, GenerateSettlementModal, WholesaleDispatchModal
 */
import { useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { NumberField } from "@components/ui/NumberField";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Badge } from "@components/ui/Badge";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { ContactSearchInput } from "@components/shared/ContactSearchInput";
import {
  ARRANGEMENT_META,
  CONSIGNMENT_STATUS_META,
  SETTLEMENT_STATUS_META,
  ARRANGEMENT_OPTIONS,
  CYCLE_OPTIONS,
} from "@lib/constants/retailPartnersConstants";
import {
  createPartnerSchema,
  type CreatePartnerValues,
  sendConsignmentSchema,
  type SendConsignmentValues,
  recallSchema,
  type RecallValues,
  reportSaleSchema,
  type ReportSaleValues,
  generateSettlementSchema,
  type GenerateSettlementValues,
} from "@lib/schemas/retailPartners";
import {
  createPartner,
  updatePartner,
  sendConsignment,
  recallConsignment,
  reportPartnerSale,
  generateSettlement,
  listConsignmentStock,
  getStockLocations,
} from "@services/retailPartners";
import { fmtMoney } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { CatalogueSearchInput } from "@components/shared/CatalogueSearchInput";
import type {
  ArrangementType,
  ConsignmentStatus,
  SettlementStatus,
  RetailPartner,
  ConsignmentStock,
} from "@typedefs/retailPartners";
import type { Contact } from "@typedefs/contacts";

// ── Badges ────────────────────────────────────────────────────────────────────

export function PartnerBadge({
  type,
  size = "sm",
}: {
  type: ArrangementType;
  size?: "xs" | "sm";
}) {
  const meta = ARRANGEMENT_META[type];
  return (
    <Badge tone={meta.tone} size={size}>
      {meta.label}
    </Badge>
  );
}

export function ConsignmentBadge({
  status,
  size = "xs",
}: {
  status: ConsignmentStatus;
  size?: "xs" | "sm";
}) {
  const meta = CONSIGNMENT_STATUS_META[status];
  return (
    <Badge tone={meta.tone} size={size}>
      {meta.label}
    </Badge>
  );
}

export function SettlementBadge({
  status,
  size = "sm",
}: {
  status: SettlementStatus;
  size?: "xs" | "sm";
}) {
  const meta = SETTLEMENT_STATUS_META[status];
  return (
    <Badge tone={meta.tone} size={size}>
      {meta.label}
    </Badge>
  );
}

// ── Location picker hook ──────────────────────────────────────────────────────

function useLocations() {
  const { data = [] } = useQuery({
    queryKey: ["stock-locations"],
    queryFn: getStockLocations,
    staleTime: 5 * 60_000,
  });
  return data.map((l) => ({ value: l.location_id, label: l.name }));
}

// ── PartnerFormModal ──────────────────────────────────────────────────────────

interface PartnerFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (partner: RetailPartner) => void;
  existing?: RetailPartner;
  /** Pre-select the contact (e.g. opened from their profile). */
  defaultContact?: Contact | null;
}

export function PartnerFormModal({
  open,
  onClose,
  onSaved,
  existing,
  defaultContact = null,
}: PartnerFormModalProps) {
  const qc = useQueryClient();
  const [contact, setContact] = useState<Contact | null>(defaultContact);
  const isEdit = !!existing;

  const form = useForm<CreatePartnerValues>({
    resolver: zodResolver(createPartnerSchema),
    defaultValues: {
      contact_id: existing?.contact_id ?? defaultContact?.contact_id ?? "",
      partner_code: existing?.partner_code ?? "",
      arrangement_type: existing?.arrangement_type ?? "consignment",
      consignment_margin_pct: existing?.consignment_margin_pct ?? 0,
      wholesale_discount_pct: existing?.wholesale_discount_pct ?? 0,
      payment_terms_days: existing?.payment_terms_days ?? 30,
      settlement_cycle: existing?.settlement_cycle ?? "monthly",
      credit_limit: existing?.credit_limit ?? 0,
      notes: existing?.notes ?? "",
    },
  });

  const arrangementType = form.watch("arrangement_type");

  const mutation = useMutation({
    mutationFn: (values: CreatePartnerValues) =>
      isEdit
        ? updatePartner(existing!.partner_id, values)
        : createPartner(values),
    onSuccess: (partner) => {
      showToast.success(isEdit ? "Partner updated" : "Partner created");
      qc.invalidateQueries({ queryKey: ["retail-partners"] });
      onSaved(partner);
      form.reset();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Partner" : "New Retail Partner"}
      size="lg"
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
            {isEdit ? "Save Changes" : "Create Partner"}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-4 lg:col-span-2">
          <ContactSearchInput
            value={contact}
            onChange={(c) => {
              setContact(c);
              form.setValue("contact_id", c?.contact_id ?? "");
            }}
            label="Contact (company or person)"
            required
          />
          {form.formState.errors.contact_id && (
            <p className="text-xs text-state-danger">
              {form.formState.errors.contact_id.message}
            </p>
          )}
        </div>

        <Controller
          name="partner_code"
          control={form.control}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              label="Partner Code *"
              placeholder="e.g. SHOP-01"
              surface="light"
              hint="Uppercase, no spaces. Cannot be changed later."
              error={fieldState.error?.message}
            />
          )}
        />

        <Controller
          name="arrangement_type"
          control={form.control}
          render={({ field }) => (
            <Select
              label="Arrangement Type *"
              options={ARRANGEMENT_OPTIONS}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              surface="light"
            />
          )}
        />

        {(arrangementType === "consignment" || arrangementType === "both") && (
          <Controller
            name="consignment_margin_pct"
            control={form.control}
            render={({ field }) => (
              <NumberField
                surface="light"
                decimal
                label="Consignment Margin %"
                placeholder="30"
                hint="% we keep from each sale. e.g. 30 means partner gets 70%."
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        )}

        {(arrangementType === "wholesale" || arrangementType === "both") && (
          <Controller
            name="wholesale_discount_pct"
            control={form.control}
            render={({ field }) => (
              <NumberField
                surface="light"
                decimal
                label="Wholesale Discount %"
                placeholder="0"
                hint="% off RRP for wholesale purchases."
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
        )}

        <Controller
          name="settlement_cycle"
          control={form.control}
          render={({ field }) => (
            <Select
              label="Settlement Cycle"
              options={CYCLE_OPTIONS}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              surface="light"
            />
          )}
        />

        <Controller
          name="payment_terms_days"
          control={form.control}
          render={({ field }) => (
            <NumberField
              surface="light"
              label="Payment Terms (days)"
              placeholder="30"
              hint="Days to settle after statement is sent."
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />

        <Controller
          name="credit_limit"
          control={form.control}
          render={({ field }) => (
            <NumberField
              surface="light"
              decimal
              label="Credit Limit (₦)"
              placeholder="0.00"
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />

        <div className="lg:col-span-2">
          <Controller
            name="notes"
            control={form.control}
            render={({ field }) => (
              <Input
                {...field}
                label="Notes (optional)"
                placeholder="Any special terms or notes about this partner"
                surface="light"
              />
            )}
          />
        </div>
      </div>
    </Modal>
  );
}

// ── SendConsignmentModal ──────────────────────────────────────────────────────

interface SendConsignmentModalProps {
  open: boolean;
  onClose: () => void;
  partner: RetailPartner;
  currency?: string;
}

export function SendConsignmentModal({
  open,
  onClose,
  partner,
  currency = "NGN",
}: SendConsignmentModalProps) {
  const qc = useQueryClient();
  const locations = useLocations();
  // productQuery state removed — handled inside CatalogueSearchInput

  const form = useForm<SendConsignmentValues>({
    resolver: zodResolver(sendConsignmentSchema),
    defaultValues: {
      from_location_id: "",
      sent_date: new Date().toISOString().split("T")[0],
      items: [{ product_id: "", quantity: 1, agreed_price: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const mutation = useMutation({
    mutationFn: (values: SendConsignmentValues) =>
      sendConsignment(partner.partner_id, values),
    onSuccess: (result) => {
      showToast.success(
        `${result.consignments.length} item(s) sent to ${partner.display_name}`,
      );
      qc.invalidateQueries({
        queryKey: ["retail-partner", partner.partner_id],
      });
      qc.invalidateQueries({ queryKey: ["consignment-stock"] });
      onClose();
      form.reset();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Send Consignment — ${partner.display_name}`}
      size="lg"
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
            Send Consignment
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Controller
            name="from_location_id"
            control={form.control}
            render={({ field, fieldState }) => (
              <Select
                label="From Location *"
                options={locations}
                placeholder="Select location..."
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                surface="light"
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            name="sent_date"
            control={form.control}
            render={({ field }) => (
              <Input {...field} label="Date Sent" type="date" surface="light" />
            )}
          />
        </div>

        {/* Product search */}
        <div>
          <label className="block text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted mb-2">
            Search & Add Products
          </label>
          <CatalogueSearchInput
            surface="light"
            currency={currency}
            label=""
            placeholder="Search catalogue…"
            onSelect={(p) =>
              append({
                product_id: p.product_id,
                quantity: 1,
                agreed_price: parseFloat(String(p.selling_price)) || 0,
              })
            }
          />
        </div>

        {/* Line items */}
        <div className="space-y-3">
          {fields.map((field, i) => (
            <div
              key={field.id}
              className="grid grid-cols-3 gap-3 items-end rounded-xl border border-brand-cloud/30 p-3"
            >
              <Controller
                name={`items.${i}.quantity`}
                control={form.control}
                render={({ field: f, fieldState }) => (
                  <NumberField
                    surface="light"
                    label="Qty"
                    placeholder="0"
                    value={f.value}
                    onValueChange={f.onChange}
                    onBlur={f.onBlur}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                name={`items.${i}.agreed_price`}
                control={form.control}
                render={({ field: f, fieldState }) => (
                  <NumberField
                    surface="light"
                    decimal
                    label="Agreed Price (₦)"
                    placeholder="0.00"
                    value={f.value}
                    onValueChange={f.onChange}
                    onBlur={f.onBlur}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <div className="flex items-end">
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="mb-1 text-text-on-light-muted hover:text-state-danger transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ── RecallConsignmentModal ────────────────────────────────────────────────────

interface RecallModalProps {
  open: boolean;
  onClose: () => void;
  partnerId: string;
  consignment: ConsignmentStock;
  currency?: string;
}

export function RecallConsignmentModal({
  open,
  onClose,
  partnerId,
  consignment,
  currency = "NGN",
}: RecallModalProps) {
  const qc = useQueryClient();
  const locations = useLocations();

  const form = useForm<RecallValues>({
    resolver: zodResolver(recallSchema),
    defaultValues: {
      return_to_location_id: "",
      quantity: consignment.quantity_outstanding,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: RecallValues) =>
      recallConsignment(consignment.consignment_id, values),
    onSuccess: (result) => {
      showToast.success(`${result.quantity_recalled} unit(s) recalled`);
      qc.invalidateQueries({ queryKey: ["retail-partner", partnerId] });
      qc.invalidateQueries({ queryKey: ["consignment-stock"] });
      onClose();
      form.reset();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Recall Consignment Stock"
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
            Recall Stock
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-cloud/20 px-4 py-3 text-sm space-y-1">
          <p className="font-medium text-brand-black">
            {consignment.product_name ?? "Product"}
          </p>
          <p className="text-text-on-light-muted">
            Outstanding: {consignment.quantity_outstanding} units @{" "}
            {fmtMoney(consignment.agreed_price, currency)}
          </p>
        </div>
        <Controller
          name="quantity"
          control={form.control}
          render={({ field, fieldState }) => (
            <NumberField
              surface="light"
              label="Quantity to Recall"
              placeholder="0"
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              hint={`Max ${consignment.quantity_outstanding}`}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          name="return_to_location_id"
          control={form.control}
          render={({ field, fieldState }) => (
            <Select
              label="Return To Location *"
              options={locations}
              placeholder="Select location..."
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              surface="light"
              error={fieldState.error?.message}
            />
          )}
        />
      </div>
    </Modal>
  );
}

// ── ReportSaleModal ───────────────────────────────────────────────────────────

interface ReportSaleModalProps {
  open: boolean;
  onClose: () => void;
  partner: RetailPartner;
  currency?: string;
}

export function ReportSaleModal({
  open,
  onClose,
  partner,
  currency = "NGN",
}: ReportSaleModalProps) {
  const qc = useQueryClient();

  const { data: stockData } = useQuery({
    queryKey: ["consignment-stock", partner.partner_id],
    queryFn: () =>
      listConsignmentStock({
        partner_id: partner.partner_id,
        status: "active",
      }),
    enabled: open,
  });

  const activeStock = stockData?.data ?? [];

  const stockOptions = activeStock.map((s) => ({
    value: s.consignment_id,
    label: `${s.product_name ?? s.product_id} — ${s.quantity_outstanding} outstanding @ ${fmtMoney(s.agreed_price, currency)}`,
  }));

  const form = useForm<ReportSaleValues>({
    resolver: zodResolver(reportSaleSchema),
    defaultValues: {
      consignment_id: "",
      quantity_sold: 1,
      sale_price: 0,
      sale_date: new Date().toISOString().split("T")[0],
      notes: "",
    },
  });

  const selectedId = form.watch("consignment_id");
  const selected = activeStock.find((s) => s.consignment_id === selectedId);

  const mutation = useMutation({
    mutationFn: (values: ReportSaleValues) =>
      reportPartnerSale(partner.partner_id, values),
    onSuccess: () => {
      showToast.success("Sale recorded");
      qc.invalidateQueries({
        queryKey: ["retail-partner", partner.partner_id],
      });
      onClose();
      form.reset();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Report Sale — ${partner.display_name}`}
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
            Record Sale
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Controller
          name="consignment_id"
          control={form.control}
          render={({ field, fieldState }) => (
            <Select
              label="Consignment Line *"
              options={stockOptions}
              placeholder="Select item..."
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              surface="light"
              error={fieldState.error?.message}
            />
          )}
        />
        {selected && (
          <div className="grid grid-cols-2 gap-3">
            <Controller
              name="quantity_sold"
              control={form.control}
              render={({ field, fieldState }) => (
                <NumberField
                  surface="light"
                  label="Qty Sold *"
                  placeholder="0"
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  hint={`Max ${selected.quantity_outstanding}`}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="sale_price"
              control={form.control}
              render={({ field, fieldState }) => (
                <NumberField
                  surface="light"
                  decimal
                  label="Sale Price (₦) *"
                  placeholder="0.00"
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>
        )}
        <Controller
          name="sale_date"
          control={form.control}
          render={({ field }) => (
            <Input {...field} label="Sale Date *" type="date" surface="light" />
          )}
        />
        <Controller
          name="notes"
          control={form.control}
          render={({ field }) => (
            <Input
              {...field}
              label="Notes"
              placeholder="Optional"
              surface="light"
            />
          )}
        />
      </div>
    </Modal>
  );
}

// ── GenerateSettlementModal ───────────────────────────────────────────────────

interface GenerateSettlementModalProps {
  open: boolean;
  onClose: () => void;
  partner: RetailPartner;
  currency?: string;
  onGenerated: (settlementId: string) => void;
}

export function GenerateSettlementModal({
  open,
  onClose,
  partner,
  currency: _currency = "NGN",
  onGenerated,
}: GenerateSettlementModalProps) {
  const qc = useQueryClient();

  // Default: first day of previous month to last day of previous month
  const today = new Date();
  const firstOfPrevMonth = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    1,
  )
    .toISOString()
    .split("T")[0];
  const lastOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0)
    .toISOString()
    .split("T")[0];

  const form = useForm<GenerateSettlementValues>({
    resolver: zodResolver(generateSettlementSchema),
    defaultValues: {
      period_start: firstOfPrevMonth,
      period_end: lastOfPrevMonth,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: GenerateSettlementValues) =>
      generateSettlement(partner.partner_id, values),
    onSuccess: (settlement) => {
      showToast.success(`Settlement ${settlement.settlement_number} generated`);
      qc.invalidateQueries({
        queryKey: ["retail-partner", partner.partner_id],
      });
      onGenerated(settlement.settlement_id);
      onClose();
      form.reset();
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Generate Settlement — ${partner.display_name}`}
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
            Generate
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-cloud/20 px-4 py-3 text-sm">
          <p className="text-text-on-light-muted">
            Margin:{" "}
            <strong className="text-brand-black">
              {partner.consignment_margin_pct}%
            </strong>
          </p>
          <p className="text-text-on-light-muted mt-0.5">
            Cycle:{" "}
            <strong className="text-brand-black capitalize">
              {partner.settlement_cycle}
            </strong>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Controller
            name="period_start"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input
                {...field}
                label="Period Start *"
                type="date"
                surface="light"
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            name="period_end"
            control={form.control}
            render={({ field, fieldState }) => (
              <Input
                {...field}
                label="Period End *"
                type="date"
                surface="light"
                error={fieldState.error?.message}
              />
            )}
          />
        </div>
        <p className="text-xs text-text-on-light-muted">
          Settlement includes all consignment sales reported in this period. A
          draft is generated first — you can review before sending.
        </p>
      </div>
    </Modal>
  );
}
