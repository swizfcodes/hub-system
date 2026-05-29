import { useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select } from '@components/ui/Select';
import { ContactSearchInput } from '@components/shared/ContactSearchInput';
import { createInvoice } from '@services/invoicing/invoices';
import { createInvoiceSchema, type CreateInvoiceValues } from '@lib/schemas/invoicing';
import { INVOICE_TYPE_OPTIONS } from '@lib/constants/invoicingConstants';
import { useActiveBusiness } from '@hooks/useActiveBusiness';
import { fmtMoney } from '@lib/format';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';
import { api } from '@services/api';
import type { Contact } from '@typedefs/contacts';
import { cn } from '@lib/cn';

const DEFAULT_LINE = {
  product_id:      '',
  description:     '',
  quantity:        1,
  unit_price:      0,
  discount_amount: 0,
};

const STEPS = [
  { key: 'customer', label: 'Customer'  },
  { key: 'lines',    label: 'Items'     },
  { key: 'review',   label: 'Review'    },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

interface Props {
  open:      boolean;
  onClose:   () => void;
  onCreated: (invoiceId: string) => void;
  /** Pre-fill from Sales order or POS */
  prefill?: {
    contact_id:   string;
    contact_name: string;
    order_id?:    string;
  };
}

export function InvoiceFormModal({ open, onClose, onCreated, prefill }: Props) {
  const qc                     = useQueryClient();
  const { currency, vatRate }  = useActiveBusiness();

  const [step, setStep]           = useState<StepKey>('customer');
  const [contact, setContact]     = useState<Contact | null>(null);
  const [productQuery, setProductQuery] = useState('');

  const form = useForm<CreateInvoiceValues>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      contact_id:           prefill?.contact_id ?? '',
      invoice_type:         'standard',
      due_date:             '',
      discount_total:       0,
      currency:             currency,
      notes:                '',
      payment_instructions: '',
      lines:                [DEFAULT_LINE],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const watchedLines  = form.watch('lines');
  const vatRateNum    = vatRate ?? 0.075;

  const lineSubtotal = watchedLines.reduce((sum, l) => {
    return sum + (l.unit_price * l.quantity - (l.discount_amount ?? 0));
  }, 0);
  const vatTotal  = lineSubtotal * vatRateNum;
  const discTotal = form.watch('discount_total') ?? 0;
  const grandTotal = lineSubtotal + vatTotal - discTotal;

  // Product search
  const { data: productResults = [] } = useQuery({
    queryKey: ['products-search', productQuery],
    queryFn: async () => {
      if (productQuery.length < 2) return [];
      const { data } = await api.get('/catalogue/products', {
        params: { search: productQuery, limit: 8 },
      });
      return data.data ?? [];
    },
    enabled: productQuery.length >= 2,
  });

  const mutation = useMutation({
    mutationFn: createInvoice,
    onSuccess: (inv) => {
      showToast.success(`Invoice ${inv.invoice_number} created`);
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice-kpis'] });
      onCreated(inv.invoice_id);
      form.reset();
      setStep('customer');
      setContact(null);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  function handleContactChange(c: Contact | null) {
    setContact(c);
    form.setValue('contact_id', c?.contact_id ?? '');
  }

  async function handleNext() {
    if (step === 'customer') {
      const ok = await form.trigger(['contact_id', 'invoice_type', 'due_date']);
      if (ok) setStep('lines');
    } else if (step === 'lines') {
      const ok = await form.trigger('lines');
      if (ok) setStep('review');
    }
  }

  function handleBack() {
    if (step === 'lines')  setStep('customer');
    if (step === 'review') setStep('lines');
  }

  // ── Step: Customer ──────────────────────────────────────────────────────────

  function StepCustomer() {
    return (
      <div className="space-y-5">
        <ContactSearchInput
          value={contact}
          onChange={handleContactChange}
          label="Customer"
          required
        />
        {form.formState.errors.contact_id && (
          <p className="text-xs text-state-danger">
            {form.formState.errors.contact_id.message}
          </p>
        )}

        <Controller
          name="invoice_type"
          control={form.control}
          render={({ field }) => (
            <Select
              label="Invoice Type"
              options={INVOICE_TYPE_OPTIONS}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              surface="light"
            />
          )}
        />

        <Controller
          name="due_date"
          control={form.control}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              label="Due Date"
              type="date"
              surface="light"
              error={fieldState.error?.message}
            />
          )}
        />

        <Controller
          name="payment_instructions"
          control={form.control}
          render={({ field }) => (
            <Input
              {...field}
              label="Payment Instructions / Link (optional)"
              placeholder="Bank account details or Paystack link"
              surface="light"
            />
          )}
        />

        <Controller
          name="notes"
          control={form.control}
          render={({ field }) => (
            <Input
              {...field}
              label="Notes (optional)"
              placeholder="Any additional notes for the customer"
              surface="light"
            />
          )}
        />
      </div>
    );
  }

  // ── Step: Lines ─────────────────────────────────────────────────────────────

  function StepLines() {
    return (
      <div className="space-y-4">
        {/* Product search */}
        <div className="space-y-1">
          <label className="block text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted">
            Search Catalogue
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orika-smoke" />
            <input
              type="text"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Type to search products..."
              className="w-full rounded-xl border border-orika-cloud/40 bg-white py-3 pl-10 pr-4 text-sm text-orika-black shadow-sm focus:border-orika-black focus:outline-none focus:ring-1 focus:ring-orika-black"
            />
          </div>
          {productQuery.length >= 2 && productResults.length > 0 && (
            <div className="rounded-xl border border-orika-cloud/30 bg-white shadow-lg">
              {productResults.map((p: any) => (
                <button
                  key={p.product_id}
                  type="button"
                  onClick={() => {
                    append({
                      product_id:      p.product_id,
                      description:     p.name,
                      quantity:        1,
                      unit_price:      p.selling_price,
                      discount_amount: 0,
                    });
                    setProductQuery('');
                  }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-orika-cloud/20 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-orika-black">{p.name}</p>
                    <p className="text-xs text-text-on-light-muted">{p.sku}</p>
                  </div>
                  <span className="text-sm font-semibold text-orika-black tabular-nums">
                    {fmtMoney(p.selling_price, currency)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="space-y-3">
          {fields.map((field, i) => (
            <div
              key={field.id}
              className="rounded-xl border border-orika-cloud/30 bg-orika-cloud/10 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-on-light-muted">
                  Line {i + 1}
                </span>
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-text-on-light-muted hover:text-state-danger transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Controller
                name={`lines.${i}.description`}
                control={form.control}
                render={({ field: f, fieldState }) => (
                  <Input
                    {...f}
                    label="Description"
                    placeholder="Product or service"
                    surface="light"
                    error={fieldState.error?.message}
                  />
                )}
              />

              <div className="grid grid-cols-3 gap-3">
                <Controller
                  name={`lines.${i}.quantity`}
                  control={form.control}
                  render={({ field: f, fieldState }) => (
                    <Input
                      {...f}
                      label="Qty"
                      type="number"
                      min={1}
                      surface="light"
                      onChange={(e) => f.onChange(parseInt(e.target.value) || 1)}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  name={`lines.${i}.unit_price`}
                  control={form.control}
                  render={({ field: f, fieldState }) => (
                    <Input
                      {...f}
                      label="Unit Price"
                      type="number"
                      step="0.01"
                      min={0}
                      surface="light"
                      onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Controller
                  name={`lines.${i}.discount_amount`}
                  control={form.control}
                  render={({ field: f }) => (
                    <Input
                      {...f}
                      label="Discount (₦)"
                      type="number"
                      step="0.01"
                      min={0}
                      surface="light"
                      onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)}
                    />
                  )}
                />
              </div>

              {/* Line subtotal preview */}
              <p className="text-right text-xs text-text-on-light-muted">
                Line total:{' '}
                <span className="font-semibold text-orika-black">
                  {fmtMoney(
                    (watchedLines[i]?.unit_price ?? 0) * (watchedLines[i]?.quantity ?? 1)
                    - (watchedLines[i]?.discount_amount ?? 0),
                    currency,
                  )}
                </span>
              </p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => append(DEFAULT_LINE)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-orika-cloud/50 py-3 text-sm text-text-on-light-muted hover:border-orika-black hover:text-orika-black transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Line
        </button>
      </div>
    );
  }

  // ── Step: Review ────────────────────────────────────────────────────────────

  function StepReview() {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-orika-cloud/30 bg-orika-cloud/10 p-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-text-on-light-muted">Customer</span>
            <span className="font-medium text-orika-black">
              {contact?.display_name ?? '—'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-on-light-muted">Type</span>
            <span className="font-medium text-orika-black capitalize">
              {form.watch('invoice_type').replace('_', ' ')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-on-light-muted">Due</span>
            <span className="font-medium text-orika-black">{form.watch('due_date')}</span>
          </div>
        </div>

        {/* Lines */}
        <div className="space-y-1">
          {watchedLines.map((l, i) => (
            <div key={i} className="flex justify-between text-sm py-1">
              <span className="text-text-on-light-muted truncate max-w-[60%]">
                {l.description || `Line ${i + 1}`} × {l.quantity}
              </span>
              <span className="tabular-nums text-orika-black">
                {fmtMoney(l.unit_price * l.quantity - (l.discount_amount ?? 0), currency)}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="space-y-1 border-t border-orika-cloud/30 pt-3 text-sm">
          <TotalRow label="Subtotal" value={lineSubtotal} currency={currency} />
          {discTotal > 0 && <TotalRow label="Order Discount" value={-discTotal} currency={currency} muted />}
          <TotalRow label={`VAT (${(vatRateNum * 100).toFixed(1)}%)`} value={vatTotal} currency={currency} muted />
          <div className="border-t border-orika-cloud/30 pt-2">
            <TotalRow label="Total" value={grandTotal} currency={currency} bold />
          </div>
        </div>

        {/* Order-level discount */}
        <Controller
          name="discount_total"
          control={form.control}
          render={({ field }) => (
            <Input
              {...field}
              label="Order Discount (₦, optional)"
              type="number"
              step="0.01"
              min={0}
              surface="light"
              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
            />
          )}
        />
      </div>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const isLastStep = step === 'review';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Invoice"
      size="lg"
      surface="light"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {/* Step indicator */}
          <div className="flex gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s.key}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i <= stepIndex
                    ? 'w-8 bg-orika-black'
                    : 'w-4 bg-orika-cloud/50',
                )}
              />
            ))}
          </div>
          <div className="flex gap-3">
            {stepIndex > 0 && (
              <Button variant="ghost" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            {!isLastStep ? (
              <Button onClick={handleNext}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={form.handleSubmit((v) => mutation.mutate(v))}
                loading={mutation.isPending}
              >
                Create Invoice
              </Button>
            )}
          </div>
        </div>
      }
    >
      {step === 'customer' && <StepCustomer />}
      {step === 'lines'    && <StepLines />}
      {step === 'review'   && <StepReview />}
    </Modal>
  );
}

function TotalRow({
  label, value, currency, muted = false, bold = false,
}: {
  label: string; value: number; currency: string; muted?: boolean; bold?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={muted ? 'text-text-on-light-muted' : 'text-orika-black'}>{label}</span>
      <span className={cn('tabular-nums', bold ? 'font-semibold text-orika-black' : muted ? 'text-text-on-light-muted' : 'text-orika-black')}>
        {fmtMoney(value, currency)}
      </span>
    </div>
  );
}
