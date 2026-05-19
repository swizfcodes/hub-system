import { useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { Topbar } from '@components/shell/Topbar';
import { Breadcrumbs } from '@components/ui/Breadcrumbs';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select } from '@components/ui/Select';
import { Textarea } from '@components/ui/Textarea';
import { Card } from '@components/ui/Card';
import { poCreateSchema, type POCreateValues } from '@lib/schemas/purchasing';
import { createPO } from '@services/purchasing/pos';
import { listSuppliers } from '@services/purchasing/suppliers';
import { listProducts } from '@services/catalogue/products';
import { CURRENCIES } from '@lib/constants/currencies';
import { fmtMoney } from '@lib/format';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';

export default function PONew() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search] = useSearchParams();
  const prefillSupplierId = search.get('supplier_id') ?? '';

  const { data: suppliersResp } = useQuery({ queryKey: ['purchasing', 'suppliers'], queryFn: () => listSuppliers({ limit: 200 }) });
  const { data: productsResp }  = useQuery({ queryKey: ['catalogue', 'products', 'all'], queryFn: () => listProducts({ limit: 200 }) });
  const suppliers = suppliersResp?.data ?? [];
  const products  = productsResp?.data ?? [];

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<POCreateValues>({
    resolver: zodResolver(poCreateSchema),
    defaultValues: {
      supplier_id: prefillSupplierId, currency: 'USD',
      shipping_cost: 0, import_duty: 0, other_charges: 0,
      lines: [{ product_id: '', quantity_ordered: 1, unit_price: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const linesWatch = watch('lines');
  const supplierId = watch('supplier_id');
  const currency = watch('currency');
  const shipping = watch('shipping_cost') ?? 0;
  const duty = watch('import_duty') ?? 0;
  const other = watch('other_charges') ?? 0;
  const fxRate = watch('exchange_rate');

  const selectedSupplier = suppliers.find((s) => s.supplier_id === supplierId);

  // Auto-prefill currency from supplier preference
  useEffect(() => {
    if (selectedSupplier) setValue('currency', selectedSupplier.preferred_currency);
  }, [selectedSupplier?.supplier_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtotal = useMemo(() => (linesWatch ?? []).reduce((s, l) => s + (l.quantity_ordered ?? 0) * (l.unit_price ?? 0), 0), [linesWatch]);
  const total = subtotal + (shipping || 0) + (duty || 0) + (other || 0);
  const ngnEquivalent = fxRate ? total * fxRate : null;

  const mutation = useMutation({
    mutationFn: (v: POCreateValues) => createPO({
      ...v,
      expected_delivery: v.expected_delivery || undefined,
      delivery_address: v.delivery_address || undefined,
      exchange_rate: v.exchange_rate || undefined,
      rfq_id: v.rfq_id || undefined,
      notes: v.notes || undefined,
    }),
    onSuccess: (po) => {
      qc.invalidateQueries({ queryKey: ['purchasing', 'pos'] });
      showToast.success(`PO ${po.po_number} created`);
      navigate(`/procurement/purchase-orders/${po.po_id}`);
    },
    onError: (e) => showToast.error('Could not save', errMsg(e)),
  });

  return (
    <>
      <Topbar title="New PO" subtitle="Purchase Order" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <Breadcrumbs items={[{ label: 'Hub', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'POs', to: '/procurement/purchase-orders' }, { label: 'New' }]} />
          <Button variant="ghost" size="sm" leftIcon={<ChevronLeft className="w-4 h-4" />} onClick={() => navigate('/procurement/purchase-orders')}>Cancel</Button>
        </div>

        <header className="mb-6">
          <p className="text-[0.7rem] tracking-[0.18em] uppercase text-orika-gold mb-2">New purchase order</p>
          <h1 className="font-display font-light text-3xl sm:text-4xl text-orika-cream">Issue a <span className="italic text-orika-gold">PO</span></h1>
        </header>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
          <Card className="p-5 sm:p-6 space-y-4">
            <Controller
              control={control}
              name="supplier_id"
              render={({ field }) => (
                <Select {...field} label="Supplier"
                  placeholder="Pick a supplier"
                  options={suppliers.map((s) => ({ value: s.supplier_id, label: `${s.display_name} (${s.supplier_code})` }))}
                  error={errors.supplier_id?.message} />
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input {...register('expected_delivery')} type="date" label="Expected delivery" />
              <Input {...register('delivery_address')}  label="Delivery address" placeholder="Lagos warehouse" />
            </div>
          </Card>

          {/* Lines */}
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold">Line items</h3>
              <Button type="button" size="sm" variant="secondary" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => append({ product_id: '', quantity_ordered: 1, unit_price: 0 })}>Add line</Button>
            </div>
            <div className="space-y-3">
              {fields.map((f, i) => (
                <div key={f.id} className="rounded-xl border border-orika-graphite bg-orika-black/30 p-3.5">
                  <div className="flex items-start gap-2">
                    <span className="text-[0.6rem] text-orika-smoke font-mono uppercase tracking-widest mt-3 w-7">L{i + 1}</span>
                    <div className="flex-1 grid gap-3 sm:grid-cols-[2fr_auto_auto] items-end">
                      <Controller
                        control={control}
                        name={`lines.${i}.product_id`}
                        render={({ field }) => (
                          <Select surface="dark" {...field} label="Product"
                            placeholder="Pick a product"
                            options={products.map((p) => ({ value: p.product_id, label: `${p.name} · ${p.sku}` }))} />
                        )}
                      />
                      <Input surface="dark" {...register(`lines.${i}.quantity_ordered` as const, { valueAsNumber: true })} type="number" min={1} label="Qty" />
                      <Input surface="dark" {...register(`lines.${i}.unit_price` as const, { valueAsNumber: true })} type="number" step="0.01" label="Unit price" />
                    </div>
                    {fields.length > 1 && (
                      <button type="button" onClick={() => remove(i)} className="p-2 mt-7 text-orika-smoke hover:text-state-danger" aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                  {linesWatch?.[i]?.quantity_ordered > 0 && linesWatch?.[i]?.unit_price > 0 && (
                    <div className="mt-2 ml-7 text-[0.65rem] text-orika-smoke text-right">
                      Line total · <span className="font-mono text-orika-cream">{fmtMoney(linesWatch[i].quantity_ordered * linesWatch[i].unit_price, currency)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Charges + FX + totals */}
          <Card className="p-5 sm:p-6">
            <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold mb-4">Charges & currency</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Select {...register('currency')} label="Currency"
                options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.symbol} ${c.code}` }))} />
              <Input {...register('shipping_cost', { valueAsNumber: true })} type="number" step="0.01" label="Shipping" />
              <Input {...register('import_duty', { valueAsNumber: true })} type="number" step="0.01" label="Import duty" />
              <Input {...register('other_charges', { valueAsNumber: true })} type="number" step="0.01" label="Other charges" />
              <Input {...register('exchange_rate', { valueAsNumber: true })} type="number" step="0.0001" label="FX rate → NGN" hint="Locked at approval" className="sm:col-span-2" />
            </div>
            <div className="mt-5 rounded-xl bg-orika-black/40 border border-orika-graphite p-4">
              <Total label="Subtotal" value={fmtMoney(subtotal, currency)} />
              <Total label="Shipping" value={fmtMoney(shipping, currency)} />
              <Total label="Import duty" value={fmtMoney(duty, currency)} />
              <Total label="Other" value={fmtMoney(other, currency)} />
              <div className="border-t border-orika-graphite mt-2 pt-2">
                <Total label="Total" value={fmtMoney(total, currency)} bold />
                {ngnEquivalent != null && currency !== 'NGN' && (
                  <Total label="NGN equivalent" value={fmtMoney(ngnEquivalent, 'NGN')} hint="@ locked rate" />
                )}
              </div>
            </div>
            <Textarea {...register('notes')} label="Notes (optional)" className="mt-4" rows={2} />
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline-light" onClick={() => navigate('/procurement/purchase-orders')}>Cancel</Button>
            <Button type="submit" variant="gold" loading={mutation.isPending}>Create PO</Button>
          </div>
        </form>
      </div>
    </>
  );
}

function Total({ label, value, bold, hint }: { label: string; value: string; bold?: boolean; hint?: string }) {
  return (
    <div className={`flex items-baseline justify-between text-xs py-0.5 ${bold ? 'font-bold' : ''}`}>
      <span className="text-orika-smoke">{label}{hint && <span className="ml-1 text-[0.6rem]">{hint}</span>}</span>
      <span className={`font-mono ${bold ? 'text-orika-gold text-base' : 'text-orika-cream'}`}>{value}</span>
    </div>
  );
}
