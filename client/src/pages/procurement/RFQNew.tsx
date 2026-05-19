import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Trash2, Sparkles } from 'lucide-react';
import { Topbar } from '@components/shell/Topbar';
import { Breadcrumbs } from '@components/ui/Breadcrumbs';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Card } from '@components/ui/Card';
import { Checkbox } from '@components/ui/Checkbox';
import { rfqCreateSchema, type RFQCreateValues } from '@lib/schemas/purchasing';
import { createRFQ } from '@services/purchasing/rfqs';
import { listSuppliers } from '@services/purchasing/suppliers';
import { listProducts } from '@services/catalogue/products';
import { ProductFormModal } from '@components/catalogue/modals/ProductFormModal';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';

export default function RFQNew() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddLineIndex, setQuickAddLineIndex] = useState<number | null>(null);

  const { data: suppliersResp } = useQuery({ queryKey: ['purchasing', 'suppliers'], queryFn: () => listSuppliers({ limit: 200 }) });
  const { data: productsResp }  = useQuery({ queryKey: ['catalogue', 'products', 'all'], queryFn: () => listProducts({ limit: 200 }) });

  const suppliers = suppliersResp?.data ?? [];
  const products  = productsResp?.data ?? [];

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<RFQCreateValues>({
    resolver: zodResolver(rfqCreateSchema),
    defaultValues: {
      title: '', response_deadline: '', notes: '',
      invited_supplier_ids: [],
      lines: [{ product_id: '', description: '', quantity_needed: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const invitedIds = watch('invited_supplier_ids') ?? [];

  const mutation = useMutation({
    mutationFn: (v: RFQCreateValues) => createRFQ({
      ...v,
      response_deadline: v.response_deadline || undefined,
      notes: v.notes || undefined,
      lines: v.lines.map((l) => ({ ...l, product_id: l.product_id || undefined, target_price: l.target_price || undefined })),
      invited_supplier_ids: v.invited_supplier_ids,
    }),
    onSuccess: (rfq) => {
      qc.invalidateQueries({ queryKey: ['purchasing', 'rfqs'] });
      showToast.success(`RFQ ${rfq.rfq_number} created`);
      navigate(`/procurement/rfqs/${rfq.rfq_id}`);
    },
    onError: (e) => showToast.error('Could not save', errMsg(e)),
  });

  return (
    <>
      <Topbar title="New RFQ" subtitle="Request for Quote" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <Breadcrumbs items={[{ label: 'Hub', to: '/' }, { label: 'Procurement', to: '/procurement' }, { label: 'RFQs', to: '/procurement/rfqs' }, { label: 'New' }]} />
          <Button variant="ghost" size="sm" leftIcon={<ChevronLeft className="w-4 h-4" />} onClick={() => navigate('/procurement/rfqs')}>Cancel</Button>
        </div>

        <header className="mb-6">
          <p className="text-[0.7rem] tracking-[0.18em] uppercase text-orika-gold mb-2">New request for quote</p>
          <h1 className="font-display font-light text-3xl sm:text-4xl text-orika-cream">Source <span className="italic text-orika-gold">best value</span></h1>
        </header>

        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-6">
          {/* Header section */}
          <Card className="p-5 sm:p-6 space-y-4">
            <Input {...register('title')} label="RFQ title" placeholder="Q2 raw materials · diffuser glass bottles" error={errors.title?.message} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input {...register('response_deadline')} type="date" label="Response deadline" hint="Suppliers must submit before this date" />
              <Input {...register('notes')} label="Notes (optional)" />
            </div>
          </Card>

          {/* Line items */}
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold">Line items</h3>
              <Button type="button" size="sm" variant="secondary" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => append({ product_id: '', description: '', quantity_needed: 1 })}>
                Add line
              </Button>
            </div>
            <div className="space-y-3">
              {fields.map((f, i) => (
                <div key={f.id} className="rounded-xl border border-orika-graphite bg-orika-black/30 p-3.5">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-[0.6rem] text-orika-smoke font-mono uppercase tracking-widest mt-2 w-7">L{i + 1}</span>
                    <div className="flex-1 grid gap-3 sm:grid-cols-[2fr_2fr_auto_auto] items-end">
                      <Controller
                        control={control}
                        name={`lines.${i}.product_id`}
                        render={({ field }) => (
                          <div>
                            <div className="text-[0.6rem] uppercase tracking-widest text-orika-smoke mb-1.5">Product (optional)</div>
                            <div className="flex gap-1">
                              <select {...field} className="flex-1 bg-orika-charcoal border border-orika-graphite text-orika-cream rounded-xl py-3 px-3 text-sm">
                                <option value="">Catalogue product…</option>
                                {products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name} · {p.sku}</option>)}
                              </select>
                              <button type="button" onClick={() => { setQuickAddLineIndex(i); setQuickAddOpen(true); }} className="px-2 rounded-xl bg-orika-gold/20 text-orika-gold hover:bg-orika-gold/30 transition-colors" title="Quick-add new product">
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      />
                      <Input surface="dark" {...register(`lines.${i}.description` as const)} label="Description" placeholder="Or describe what you need" />
                      <Input surface="dark" {...register(`lines.${i}.quantity_needed` as const, { valueAsNumber: true })} type="number" min={1} label="Qty" />
                      <Input surface="dark" {...register(`lines.${i}.target_price` as const, { valueAsNumber: true })} type="number" step="0.01" label="Target price" hint="Optional, internal" />
                    </div>
                    {fields.length > 1 && (
                      <button type="button" onClick={() => remove(i)} className="p-2 mt-6 text-orika-smoke hover:text-state-danger" aria-label="Remove line"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {errors.lines && <p className="mt-2 text-xs text-state-danger">{(errors.lines as { message?: string }).message}</p>}
          </Card>

          {/* Invited suppliers */}
          <Card className="p-5 sm:p-6">
            <div className="flex items-start gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-orika-gold shrink-0 mt-0.5" />
              <div>
                <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold">Invited suppliers</h3>
                <p className="text-xs text-orika-cloud mt-1">Each will get a unique tokenised URL to submit their quote. Pick at least one — pick many for competitive pricing.</p>
              </div>
            </div>
            <Controller
              control={control}
              name="invited_supplier_ids"
              render={({ field }) => (
                <div className="grid gap-2 sm:grid-cols-2">
                  {suppliers.length === 0 ? (
                    <p className="text-sm text-orika-smoke italic col-span-full">
                      No suppliers yet. <Link to="/procurement/suppliers" className="text-orika-gold underline">Add one</Link> first.
                    </p>
                  ) : suppliers.map((s) => {
                    const checked = field.value.includes(s.supplier_id);
                    return (
                      <Checkbox
                        key={s.supplier_id}
                        surface="dark"
                        checked={checked}
                        onChange={(on) => {
                          if (on) field.onChange([...field.value, s.supplier_id]);
                          else    field.onChange(field.value.filter((id) => id !== s.supplier_id));
                        }}
                        label={<span><strong className="text-orika-cream">{s.display_name}</strong> <span className="text-orika-smoke text-[0.6rem]">· {s.preferred_currency} · Net {s.payment_terms_days}d</span></span>}
                      />
                    );
                  })}
                </div>
              )}
            />
            {errors.invited_supplier_ids && <p className="mt-2 text-xs text-state-danger">{errors.invited_supplier_ids.message}</p>}
            {invitedIds.length > 0 && <p className="mt-3 text-[0.65rem] text-orika-gold">{invitedIds.length} supplier{invitedIds.length > 1 ? 's' : ''} will be invited</p>}
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline-light" onClick={() => navigate('/procurement/rfqs')}>Cancel</Button>
            <Button type="submit" variant="gold" loading={mutation.isPending}>Create RFQ</Button>
          </div>
        </form>
      </div>

      {/* Quick-add product modal — Q2 answer B */}
      <ProductFormModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onSaved={(p) => {
          if (quickAddLineIndex !== null) setValue(`lines.${quickAddLineIndex}.product_id`, p.product_id);
          qc.invalidateQueries({ queryKey: ['catalogue', 'products'] });
          setQuickAddOpen(false);
          setQuickAddLineIndex(null);
        }}
      />
    </>
  );
}
