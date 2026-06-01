/**
 * QuoteFormModal — New Quotation wizard
 *
 * FIX: All step sub-components are defined at MODULE LEVEL (outside
 * QuoteFormModal). The original code defined them inside the parent which
 * caused React to treat them as new component types on every parent re-render,
 * unmounting + remounting and losing all input state. Typing a single
 * character in the catalogue search would eject the user from the field.
 *
 * FIX: ProductSearchRow has its own isolated `query` state. Each line gets
 * its own instance — searching line 2 does not affect line 1 or line 3.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useForm, useFieldArray, Controller, type UseFormReturn, type FieldArrayWithId } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ChevronLeft, ChevronRight, User, Package, Tag, Eye, Search } from 'lucide-react';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { Select } from '@components/ui/Select';
import { ContactSearchInput } from '@components/shared/ContactSearchInput';
import { showToast } from '@hooks/useToast';
import { api, errMsg } from '@services/api';
import { createQuotation } from '@services/sales/quotations';
import { fmtMoney } from '@lib/format';
import { createQuotationSchema, type CreateQuotationValues } from '@lib/schemas/sales';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { useActiveBusiness } from '@hooks/useActiveBusiness';
import { cn } from '@lib/cn';
import type { Contact } from '@typedefs/contacts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  open:      boolean;
  onClose:   () => void;
  onCreated: (id: string) => void;
  prefill?: {
    contact_id:   string;
    contact_name: string;
    deal_id:      string;
  };
}

const STEPS = [
  { key: 'customer', label: 'Customer', icon: User    },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'pricing',  label: 'Pricing',  icon: Tag     },
  { key: 'review',   label: 'Review',   icon: Eye     },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

const DEFAULT_LINE = {
  product_id:   '',
  description:  '',
  quantity:     1,
  unit_price:   0,
  discount_pct: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE-LEVEL COMPONENTS
// These MUST live outside QuoteFormModal so React never sees them as new types
// on re-renders. Defining them inside the parent was the root cause of the
// "Search Catalogue kicks you out" bug.
// ─────────────────────────────────────────────────────────────────────────────

// ── Per-line product search — fully isolated state ────────────────────────────

interface ProductSearchRowProps {
  lineIndex: number;
  currency:  string;
  onSelect:  (p: { product_id: string; name: string; selling_price: number }) => void;
}

function ProductSearchRow({ lineIndex, currency, onSelect }: ProductSearchRowProps) {
  // Each line has its own isolated query — typing in line 2 does NOT affect
  // line 1 or line 3. This was previously a single shared state causing bugs.
  const [query,   setQuery]   = useState('');
  const [isOpen,  setIsOpen]  = useState(false);
  const wrapRef               = useRef<HTMLDivElement>(null);
  // Track the input's viewport rect so we can portal the dropdown with
  // position:fixed — this escapes the modal's overflow-y-auto clipping.
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);

  const { data: results = [] } = useQuery({
    queryKey: ['products-search-line', lineIndex, query],
    queryFn: async () => {
      if (query.trim().length < 2) return [];
      const { data } = await api.get('/catalogue/products', {
        params: { search: query.trim(), limit: 10 },
      });
      return data.data ?? [];
    },
    enabled: query.trim().length >= 2,
  });

  // Recompute dropdown anchor whenever it's open (handles modal scroll).
  useEffect(() => {
    if (!isOpen) return;
    function updateRect() {
      if (wrapRef.current) setDropRect(wrapRef.current.getBoundingClientRect());
    }
    updateRect();
    // Listen on capture phase to catch scroll inside the modal.
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);
    return () => {
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [isOpen]);

  // Close dropdown on outside click.
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleSelect(p: { product_id: string; name: string; selling_price: number }) {
    onSelect(p);
    setQuery('');
    setIsOpen(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setIsOpen(true);
    if (wrapRef.current) setDropRect(wrapRef.current.getBoundingClientRect());
  }

  // Portaled dropdown — rendered at document.body level so it escapes
  // the modal's overflow-y-auto container and is never clipped.
  const showDropdown = isOpen && query.trim().length >= 2 && dropRect;
  const dropdown = showDropdown ? ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        top:   dropRect.bottom + 4,
        left:  dropRect.left,
        width: dropRect.width,
        zIndex: 9999,
      }}
      className="rounded-lg border border-white/10 bg-orika-charcoal shadow-xl"
    >
      {results.length > 0 ? (
        results.map((p: { product_id: string; name: string; sku?: string; selling_price: number }) => (
          <button
            key={p.product_id}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleSelect(p); }}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-orika-graphite/40 transition-colors"
          >
            <div>
              <p className="text-xs font-medium text-orika-cream">{p.name}</p>
              {p.sku && <p className="text-[10px] text-orika-smoke">{p.sku}</p>}
            </div>
            <span className="text-xs font-semibold text-orika-gold tabular-nums ml-3 shrink-0">
              {fmtMoney(p.selling_price, currency)}
            </span>
          </button>
        ))
      ) : (
        <div className="px-3 py-3">
          <p className="text-xs text-orika-smoke">No products found for &ldquo;{query}&rdquo;</p>
        </div>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={wrapRef} className="relative sm:col-span-2">
      <label className="mb-1 block text-xs text-orika-smoke">Search Catalogue</label>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-orika-smoke" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => {
            if (query.length >= 2) {
              setIsOpen(true);
              if (wrapRef.current) setDropRect(wrapRef.current.getBoundingClientRect());
            }
          }}
          placeholder="Type product name or SKU..."
          className="w-full rounded-lg border border-white/10 bg-orika-graphite py-2 pl-8 pr-3 text-sm text-orika-cream placeholder-orika-smoke/50 focus:border-orika-gold/50 focus:outline-none"
        />
      </div>
      {dropdown}
    </div>
  );
}

// ── Step: Customer ────────────────────────────────────────────────────────────

interface StepCustomerProps {
  form:            UseFormReturn<CreateQuotationValues>;
  selectedContact: Contact | null;
  setContact:      (c: Contact | null) => void;
}

function StepCustomer({ form, selectedContact, setContact }: StepCustomerProps) {
  return (
    <div className="space-y-4">
      <ContactSearchInput
        value={selectedContact}
        onChange={(c) => {
          setContact(c);
          form.setValue('contact_id', c?.contact_id ?? '');
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
            <label className="mb-1.5 block text-xs font-medium text-orika-cloud">CRM Deal (optional)</label>
            <Input {...field} placeholder="Link to a CRM deal" />
          </div>
        )}
      />
      <Controller
        name="valid_until"
        control={form.control}
        render={({ field, fieldState }) => (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-orika-cloud">Valid Until *</label>
            <Input {...field} type="date" error={fieldState.error?.message} />
          </div>
        )}
      />
      <Controller
        name="payment_terms"
        control={form.control}
        render={({ field }) => (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-orika-cloud">Payment Terms</label>
            <Input {...field} placeholder="e.g. 50% deposit, balance on delivery" />
          </div>
        )}
      />
    </div>
  );
}

// ── Step: Products ────────────────────────────────────────────────────────────

interface StepProductsProps {
  form:     UseFormReturn<CreateQuotationValues>;
  fields:   FieldArrayWithId<CreateQuotationValues, 'lines'>[];
  append:   (v: typeof DEFAULT_LINE) => void;
  remove:   (i: number) => void;
  lines:    CreateQuotationValues['lines'];
  currency: string;
}

function StepProducts({ form, fields, append, remove, lines, currency }: StepProductsProps) {
  return (
    <div className="space-y-3">
      {fields.map((field, i) => (
        <div key={field.id} className="rounded-lg border border-white/5 bg-orika-graphite/20 p-3">
          <div className="flex items-start justify-between gap-2 mb-3">
            <span className="text-xs font-medium text-orika-smoke">Line {i + 1}</span>
            {fields.length > 1 && (
              <button type="button" onClick={() => remove(i)} className="text-orika-smoke hover:text-red-400 transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Per-line product search — each has its own isolated state */}
            <ProductSearchRow
              lineIndex={i}
              currency={currency}
              onSelect={(p) => {
                form.setValue(`lines.${i}.product_id`,  p.product_id);
                form.setValue(`lines.${i}.description`, p.name);
                form.setValue(`lines.${i}.unit_price`,  p.selling_price);
              }}
            />

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
                  <Input {...f} type="number" min={1} onChange={(e) => f.onChange(parseInt(e.target.value) || 1)} error={fieldState.error?.message} />
                </div>
              )}
            />
            <Controller
              name={`lines.${i}.unit_price`}
              control={form.control}
              render={({ field: f, fieldState }) => (
                <div>
                  <label className="mb-1 block text-xs text-orika-smoke">Unit Price *</label>
                  <Input {...f} type="number" step="0.01" min={0} onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)} error={fieldState.error?.message} />
                </div>
              )}
            />
            <Controller
              name={`lines.${i}.discount_pct`}
              control={form.control}
              render={({ field: f }) => (
                <div>
                  <label className="mb-1 block text-xs text-orika-smoke">Discount %</label>
                  <Input {...f} type="number" step="0.01" min={0} max={100} onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)} />
                </div>
              )}
            />
            <div className="flex items-end">
              <p className="text-xs text-orika-smoke">
                Line total:{' '}
                <span className="font-medium text-orika-cream">
                  {fmtMoney((() => {
                    const q = lines[i]?.quantity   ?? 0;
                    const p = lines[i]?.unit_price ?? 0;
                    const d = lines[i]?.discount_pct ?? 0;
                    const g = q * p;
                    return g - g * (d / 100);
                  })(), currency)}
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
        <Plus className="h-4 w-4" /> Add line item
      </button>
    </div>
  );
}

// ── Step: Pricing ─────────────────────────────────────────────────────────────

interface StepPricingProps {
  form:            UseFormReturn<CreateQuotationValues>;
  orderDiscType:   'percentage' | 'fixed';
  setOrderDiscType: (t: 'percentage' | 'fixed') => void;
}

function StepPricing({ form, orderDiscType, setOrderDiscType }: StepPricingProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block text-xs font-medium text-orika-cloud">Order-Level Discount</label>
        <div className="flex gap-2">
          <Select
            value={orderDiscType}
            onChange={(e) => setOrderDiscType(e.target.value as 'percentage' | 'fixed')}
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
            <label className="mb-1.5 block text-xs font-medium text-orika-cloud">Terms & Conditions</label>
            <Textarea {...field} rows={3} placeholder="Payment terms, return policy, etc." />
          </div>
        )}
      />
    </div>
  );
}

// ── Step: Review ──────────────────────────────────────────────────────────────

interface StepReviewProps {
  lineSubtotal:  number;
  orderDisc:     number;
  netAfterDisc:  number;
  vat:           number;
  total:         number;
  lineCount:     number;
  currency:      string;
}

function StepReview({ lineSubtotal, orderDisc, netAfterDisc, vat, total, lineCount, currency }: StepReviewProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-orika-cloud">Review the totals before creating the quotation.</p>
      <div className="rounded-lg border border-white/5 bg-orika-graphite/20 p-4 space-y-2">
        <TotalRow label="Line Subtotal"  value={fmtMoney(lineSubtotal, currency)} />
        {orderDisc > 0 && <TotalRow label="Order Discount" value={`-${fmtMoney(orderDisc, currency)}`} muted />}
        <TotalRow label="Net"            value={fmtMoney(netAfterDisc, currency)} />
        <TotalRow label="VAT (7.5%)"     value={fmtMoney(vat, currency)} muted />
        <div className="border-t border-white/10 pt-2">
          <TotalRow label="Total"        value={fmtMoney(total, currency)} bold />
        </div>
      </div>
      <p className="text-xs text-orika-smoke">
        {lineCount} line item{lineCount !== 1 ? 's' : ''}. A PDF will be available on the quotation page.
        The quote will be saved as a draft.
      </p>
    </div>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: typeof User; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-black/10 pb-2">
      <Icon className="h-4 w-4 text-orika-gold" />
      <h3 className="text-sm font-semibold text-orika-black">{title}</h3>
    </div>
  );
}

function TotalRow({ label, value, muted = false, bold = false }: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className={muted ? 'text-orika-smoke' : 'text-orika-cloud'}>{label}</span>
      <span className={cn('tabular-nums', bold ? 'font-semibold text-orika-cream' : muted ? 'text-orika-smoke' : 'text-orika-cream')}>
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function QuoteFormModal({ open, onClose, onCreated, prefill }: Props) {
  const isMobile              = useMediaQuery('(max-width: 640px)');
  const qc                    = useQueryClient();
  const { currency, vatRate } = useActiveBusiness();

  const [step, setStep]             = useState<StepKey>('customer');
  const [orderDiscType, setOrderDiscType] = useState<'percentage' | 'fixed'>('percentage');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(
    prefill ? { contact_id: prefill.contact_id, display_name: prefill.contact_name } as Contact : null,
  );

  const form = useForm<CreateQuotationValues>({
    resolver: zodResolver(createQuotationSchema),
    defaultValues: {
      contact_id:           prefill?.contact_id ?? '',
      deal_id:              prefill?.deal_id    ?? '',
      assigned_to:          '',
      valid_until:          '',
      payment_terms:        '',
      notes:                '',
      terms_conditions:     '',
      order_discount_type:  'percentage',
      order_discount_value: 0,
      lines: [DEFAULT_LINE],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });

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

  // Derived totals
  const lines          = form.watch('lines');
  const orderDiscValue = form.watch('order_discount_value') ?? 0;
  const lineSubtotal   = lines.reduce((sum, l) => {
    const gross = (l.unit_price ?? 0) * (l.quantity ?? 0);
    return sum + gross - gross * ((l.discount_pct ?? 0) / 100);
  }, 0);
  const orderDisc    = orderDiscType === 'percentage' ? lineSubtotal * ((orderDiscValue ?? 0) / 100) : (orderDiscValue ?? 0);
  const netAfterDisc = lineSubtotal - orderDisc;
  const vat          = netAfterDisc * (vatRate ?? 0.075);
  const total        = netAfterDisc + vat;

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const isFirst   = stepIndex === 0;
  const isLast    = stepIndex === STEPS.length - 1;

  const goNext = useCallback(() => { if (!isLast)  setStep(STEPS[stepIndex + 1].key); }, [stepIndex, isLast]);
  const goPrev = useCallback(() => { if (!isFirst) setStep(STEPS[stepIndex - 1].key); }, [stepIndex, isFirst]);

  const onSubmit = form.handleSubmit((values) => {
    mutation.mutate({ ...values, order_discount_type: orderDiscType, order_discount_value: orderDiscValue });
  });

  // Shared props to step components
  const sharedProductsProps: StepProductsProps = { form, fields, append, remove, lines, currency: currency ?? 'NGN' };

  const footer = (
    <div className="flex items-center justify-between gap-3">
      {isMobile ? (
        <>
          <Button variant="ghost" onClick={isFirst ? onClose : goPrev} disabled={mutation.isPending}>
            {isFirst ? 'Cancel' : <><ChevronLeft className="h-4 w-4" /> Back</>}
          </Button>
          {isLast
            ? <Button onClick={onSubmit} loading={mutation.isPending}>Create Quotation</Button>
            : <Button onClick={goNext}>Next <ChevronRight className="h-4 w-4" /></Button>
          }
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={onSubmit} loading={mutation.isPending}>Create Quotation</Button>
        </>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isMobile ? `New Quote - ${STEPS[stepIndex].label} (${stepIndex + 1}/${STEPS.length})` : 'New Quotation'}
      size="lg"
      surface="light"
      footer={footer}
    >
      {isMobile && (
        <div className="mb-6 flex gap-1.5">
          {STEPS.map((s, i) => (
            <div key={s.key} className={cn('h-1 flex-1 rounded-full transition-colors', i <= stepIndex ? 'bg-orika-gold' : 'bg-orika-graphite')} />
          ))}
        </div>
      )}

      {/* Mobile: one step at a time */}
      {isMobile && (
        <>
          {step === 'customer' && <StepCustomer form={form} selectedContact={selectedContact} setContact={setSelectedContact} />}
          {step === 'products' && <StepProducts {...sharedProductsProps} />}
          {step === 'pricing'  && <StepPricing  form={form} orderDiscType={orderDiscType} setOrderDiscType={setOrderDiscType} />}
          {step === 'review'   && <StepReview   lineSubtotal={lineSubtotal} orderDisc={orderDisc} netAfterDisc={netAfterDisc} vat={vat} total={total} lineCount={lines.length} currency={currency ?? 'NGN'} />}
        </>
      )}

      {/* Desktop: all steps visible at once */}
      {!isMobile && (
        <div className="space-y-8">
          <SectionHeading icon={User}    title="Customer" />
          <StepCustomer form={form} selectedContact={selectedContact} setContact={setSelectedContact} />
          <SectionHeading icon={Package} title="Products" />
          <StepProducts {...sharedProductsProps} />
          <SectionHeading icon={Tag}     title="Pricing" />
          <StepPricing   form={form} orderDiscType={orderDiscType} setOrderDiscType={setOrderDiscType} />
        </div>
      )}
    </Modal>
  );
}
