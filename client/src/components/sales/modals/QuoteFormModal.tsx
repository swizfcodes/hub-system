import { useState, useCallback } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ChevronLeft, ChevronRight, User, Package, Tag, Eye, Search } from 'lucide-react';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { Select } from '@components/ui/Select';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';
import { createQuotation } from '@services/sales/quotations';
import { fmtMoney } from '@lib/format';
import { createQuotationSchema, type CreateQuotationValues } from '@lib/schemas/sales';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { useActiveBusiness } from '@hooks/useActiveBusiness';
import { cn } from '@lib/cn';
import { ContactSearchInput } from '@components/shared/ContactSearchInput';
import type { Contact } from '@typedefs/contacts';
import { api } from '@services/api';

interface Props {
  open:       boolean;
  onClose:    () => void;
  onCreated:  (id: string) => void;
  /** Pre-fill from a CRM deal card */
  prefill?: {
    contact_id:   string;
    contact_name: string;
    deal_id:      string;
  };
}

const STEPS = [
  { key: 'customer',  label: 'Customer', icon: User    },
  { key: 'products',  label: 'Products', icon: Package },
  { key: 'pricing',   label: 'Pricing',  icon: Tag     },
  { key: 'review',    label: 'Review',   icon: Eye     },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

const DEFAULT_LINE = {
  product_id:   '',
  description:  '',
  quantity:     1,
  unit_price:   0,
  discount_pct: 0,
};

export function QuoteFormModal({ open, onClose, onCreated, prefill }: Props) {
  const isMobile    = useMediaQuery('(max-width: 640px)');
  const qc          = useQueryClient();
  const { currency, vatRate } = useActiveBusiness();

  const [step, setStep]             = useState<StepKey>('customer');
  const [orderDiscType, setOrderDiscType] = useState<'percentage' | 'fixed'>('percentage');

  // Contact — drives form.contact_id
  const [selectedContact, setSelectedContact] = useState<Contact | null>(
    prefill
      ? { contact_id: prefill.contact_id, display_name: prefill.contact_name } as Contact
      : null,
  );

  // Product search for line-item picker
  const [productQuery, setProductQuery] = useState('');

  const { data: productResults = [] } = useQuery({
    queryKey: ['products-search', productQuery],
    queryFn: async () => {
      if (!productQuery.trim() || productQuery.length < 2) return [];
      const { data } = await api.get('/catalogue/products', {
        params: { search: productQuery, limit: 10 },
      });
      return data.data ?? [];
    },
    enabled: productQuery.length >= 2,
  });

  const form = useForm<CreateQuotationValues>({
    resolver: zodResolver(createQuotationSchema),
    defaultValues: {
      contact_id:          prefill?.contact_id ?? '',
      deal_id:             prefill?.deal_id    ?? '',
      assigned_to:         '',
      valid_until:         '',
      payment_terms:       '',
      notes:               '',
      terms_conditions:    '',
      order_discount_type:  'percentage',
      order_discount_value: 0,
      lines: [DEFAULT_LINE],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const mutation = useMutation({
    mutationFn: createQuotation,
    onSuccess: (q) => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      qc.invalidateQueries({ queryKey: ['sales-kpis'] });
      showToast.success(`Quotation ${q.quotation_number} created`);
      onCreated(q.quotation_id);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  // ── Derived totals ──────────────────────────────────────────────────────────
  const lines = form.watch('lines');
  const orderDiscValue = form.watch('order_discount_value') ?? 0;

  const lineSubtotal = lines.reduce((sum, l) => {
    const gross = (l.unit_price ?? 0) * (l.quantity ?? 0);
    const disc  = gross * ((l.discount_pct ?? 0) / 100);
    return sum + gross - disc;
  }, 0);

  const orderDisc =
    orderDiscType === 'percentage'
      ? lineSubtotal * ((orderDiscValue ?? 0) / 100)
      : (orderDiscValue ?? 0);

  const netAfterDisc = lineSubtotal - orderDisc;
  const vat          = netAfterDisc * (vatRate ?? 0.075);
  const total        = netAfterDisc + vat;

  // ── Step navigation ─────────────────────────────────────────────────────────
  const stepIndex  = STEPS.findIndex((s) => s.key === step);
  const isFirst    = stepIndex === 0;
  const isLast     = stepIndex === STEPS.length - 1;

  const goNext = useCallback(() => {
    if (!isLast) setStep(STEPS[stepIndex + 1].key);
  }, [stepIndex, isLast]);

  const goPrev = useCallback(() => {
    if (!isFirst) setStep(STEPS[stepIndex - 1].key);
  }, [stepIndex, isFirst]);

  const onSubmit = form.handleSubmit((values) => {
    mutation.mutate({
      ...values,
      order_discount_type:  orderDiscType,
      order_discount_value: orderDiscValue,
    });
  });

  // ── Render helpers ──────────────────────────────────────────────────────────

  function StepCustomer() {
    return (
      <div className="space-y-4">
        {/* Contact search with quick-create */}
        <ContactSearchInput
          value={selectedContact}
          onChange={(contact) => {
            setSelectedContact(contact);
            form.setValue('contact_id', contact?.contact_id ?? '');
          }}
          label="Customer"
          required
        />
        {form.formState.errors.contact_id && (
          <p className="text-xs text-red-400">{form.formState.errors.contact_id.message}</p>
        )}
        <Controller
          name="deal_id"
          control={form.control}
          render={({ field }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-orika-cloud">
                CRM Deal (optional)
              </label>
              <Input {...field} placeholder="Link to a CRM deal" />
            </div>
          )}
        />
        <Controller
          name="valid_until"
          control={form.control}
          render={({ field, fieldState }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-orika-cloud">
                Valid Until *
              </label>
              <Input
                {...field}
                type="date"
                error={fieldState.error?.message}
              />
            </div>
          )}
        />
        <Controller
          name="payment_terms"
          control={form.control}
          render={({ field }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-orika-cloud">
                Payment Terms
              </label>
              <Input {...field} placeholder="e.g. 50% deposit, balance on delivery" />
            </div>
          )}
        />
      </div>
    );
  }

  function StepProducts() {
    return (
      <div className="space-y-3">
        {fields.map((field, i) => (
          <div
            key={field.id}
            className="rounded-lg border border-white/5 bg-orika-graphite/20 p-3"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className="text-xs font-medium text-orika-smoke">Line {i + 1}</span>
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-orika-smoke hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Product search — populates description + unit_price */}
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-orika-smoke">Search Catalogue</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-orika-smoke" />
                  <input
                    type="text"
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Type to search products..."
                    className="w-full rounded-lg border border-white/10 bg-orika-graphite py-2 pl-8 pr-3 text-sm text-orika-cream placeholder-orika-smoke/50 focus:border-orika-gold/50 focus:outline-none"
                  />
                </div>
                {productQuery.length >= 2 && productResults.length > 0 && (
                  <div className="mt-1 rounded-lg border border-white/10 bg-orika-charcoal shadow-lg">
                    {productResults.map((p: any) => (
                      <button
                        key={p.product_id}
                        type="button"
                        onClick={() => {
                          form.setValue(`lines.${i}.product_id`,  p.product_id);
                          form.setValue(`lines.${i}.description`, p.name);
                          form.setValue(`lines.${i}.unit_price`,  p.selling_price);
                          setProductQuery('');
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-orika-graphite/40 transition-colors"
                      >
                        <div>
                          <p className="text-xs font-medium text-orika-cream">{p.name}</p>
                          <p className="text-[10px] text-orika-smoke">{p.sku}</p>
                        </div>
                        <span className="text-xs font-semibold text-orika-gold tabular-nums">
                          {fmtMoney(p.selling_price, currency)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Controller
                name={`lines.${i}.description`}
                control={form.control}
                render={({ field: f, fieldState }) => (
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-orika-smoke">Description *</label>
                    <Input {...f} placeholder="Product or service description" error={fieldState.error?.message} />
                  </div>
                )}
              />
              <Controller
                name={`lines.${i}.quantity`}
                control={form.control}
                render={({ field: f, fieldState }) => (
                  <div>
                    <label className="mb-1 block text-xs text-orika-smoke">Qty *</label>
                    <Input
                      {...f}
                      type="number"
                      min={1}
                      onChange={(e) => f.onChange(parseInt(e.target.value) || 1)}
                      error={fieldState.error?.message}
                    />
                  </div>
                )}
              />
              <Controller
                name={`lines.${i}.unit_price`}
                control={form.control}
                render={({ field: f, fieldState }) => (
                  <div>
                    <label className="mb-1 block text-xs text-orika-smoke">Unit Price *</label>
                    <Input
                      {...f}
                      type="number"
                      step="0.01"
                      min={0}
                      onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)}
                      error={fieldState.error?.message}
                    />
                  </div>
                )}
              />
              <Controller
                name={`lines.${i}.discount_pct`}
                control={form.control}
                render={({ field: f }) => (
                  <div>
                    <label className="mb-1 block text-xs text-orika-smoke">Line Discount %</label>
                    <Input
                      {...f}
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                )}
              />
              <div className="flex items-end">
                <p className="text-xs text-orika-smoke">
                  Line total:{' '}
                  <span className="font-medium text-orika-cream">
                    {fmtMoney(
                      (() => {
                        const q   = lines[i]?.quantity   ?? 0;
                        const p   = lines[i]?.unit_price ?? 0;
                        const d   = lines[i]?.discount_pct ?? 0;
                        const g   = q * p;
                        return g - g * (d / 100);
                      })(),
                      currency,
                    )}
                  </span>
                </p>
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => append(DEFAULT_LINE)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 py-3 text-sm text-orika-smoke transition-colors hover:border-orika-gold/40 hover:text-orika-gold"
        >
          <Plus className="h-4 w-4" />
          Add line item
        </button>
      </div>
    );
  }

  function StepPricing() {
    return (
      <div className="space-y-4">
        {/* Order-level discount */}
        <div>
          <label className="mb-2 block text-xs font-medium text-orika-cloud">
            Order-Level Discount
          </label>
          <div className="flex gap-2">
            <Select
              value={orderDiscType}
              onChange={(e) => setOrderDiscType(e.target.value as typeof orderDiscType)}
              className="w-36"
              options={[
                { value: 'percentage', label: 'Percentage'   },
                { value: 'fixed',      label: 'Fixed Amount' },
              ]}
            />
            <Controller
              name="order_discount_value"
              control={form.control}
              render={({ field: f }) => (
                <Input
                  {...f}
                  type="number"
                  step="0.01"
                  min={0}
                  max={orderDiscType === 'percentage' ? 100 : undefined}
                  onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)}
                  placeholder={orderDiscType === 'percentage' ? '0%' : '0.00'}
                  className="flex-1"
                />
              )}
            />
          </div>
        </div>

        <Controller
          name="notes"
          control={form.control}
          render={({ field }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-orika-cloud">Notes</label>
              <Textarea {...field} rows={3} placeholder="Internal or customer-facing notes" />
            </div>
          )}
        />
        <Controller
          name="terms_conditions"
          control={form.control}
          render={({ field }) => (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-orika-cloud">
                Terms & Conditions
              </label>
              <Textarea {...field} rows={3} placeholder="Payment terms, return policy, etc." />
            </div>
          )}
        />
      </div>
    );
  }

  function StepReview() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-orika-cloud">
          Review the totals before creating the quotation.
        </p>

        <div className="rounded-lg border border-white/5 bg-orika-graphite/20 p-4 space-y-2">
          <TotalRow label="Line Subtotal"  value={fmtMoney(lineSubtotal, currency)} />
          {orderDisc > 0 && (
            <TotalRow label="Order Discount"  value={`−${fmtMoney(orderDisc, currency)}`} muted />
          )}
          <TotalRow label="Net"             value={fmtMoney(netAfterDisc, currency)} />
          <TotalRow label="VAT (7.5%)"      value={fmtMoney(vat, currency)} muted />
          <div className="border-t border-white/10 pt-2">
            <TotalRow label="Total"         value={fmtMoney(total, currency)} bold />
          </div>
        </div>

        <p className="text-xs text-orika-smoke">
          {lines.length} line item{lines.length !== 1 ? 's' : ''}. A PDF will be available on the
          quotation page. The quote will be saved as a draft — you can send it after reviewing.
        </p>
      </div>
    );
  }

  const stepContent: Record<StepKey, React.ReactNode> = {
    customer: <StepCustomer />,
    products: <StepProducts />,
    pricing:  <StepPricing  />,
    review:   <StepReview   />,
  };

  // On desktop, render all steps at once
  const bodyContent = isMobile ? (
    <>{stepContent[step]}</>
  ) : (
    <div className="space-y-8">
      <SectionHeading icon={User}    title="Customer" />
      <StepCustomer />
      <SectionHeading icon={Package} title="Products" />
      <StepProducts  />
      <SectionHeading icon={Tag}     title="Pricing"  />
      <StepPricing   />
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-3">
      {isMobile ? (
        <>
          <Button variant="ghost" onClick={isFirst ? onClose : goPrev} disabled={mutation.isPending}>
            {isFirst ? 'Cancel' : <><ChevronLeft className="h-4 w-4" /> Back</>}
          </Button>
          {isLast ? (
            <Button onClick={onSubmit} loading={mutation.isPending}>
              Create Quotation
            </Button>
          ) : (
            <Button onClick={goNext}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={mutation.isPending}>
            Create Quotation
          </Button>
        </>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        isMobile
          ? `New Quote — ${STEPS[stepIndex].label} (${stepIndex + 1}/${STEPS.length})`
          : 'New Quotation'
      }
      size="lg"
      surface="light"
      footer={footer}
    >
      {/* Mobile step indicator */}
      {isMobile && (
        <div className="mb-6 flex gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i <= stepIndex ? 'bg-orika-gold' : 'bg-orika-graphite',
              )}
            />
          ))}
        </div>
      )}

      {bodyContent}
    </Modal>
  );
}

function SectionHeading({
  icon: Icon,
  title,
}: {
  icon: typeof User;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-black/10 pb-2">
      <Icon className="h-4 w-4 text-orika-gold" />
      <h3 className="text-sm font-semibold text-orika-black">{title}</h3>
    </div>
  );
}

function TotalRow({
  label,
  value,
  muted = false,
  bold  = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?:  boolean;
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className={muted ? 'text-orika-smoke' : 'text-orika-cloud'}>{label}</span>
      <span className={cn('tabular-nums', bold ? 'font-semibold text-orika-cream' : muted ? 'text-orika-smoke' : 'text-orika-cream')}>
        {value}
      </span>
    </div>
  );
}
