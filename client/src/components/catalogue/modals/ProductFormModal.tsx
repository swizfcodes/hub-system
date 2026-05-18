import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select } from '@components/ui/Select';
import { Textarea } from '@components/ui/Textarea';
import { productCreateSchema, type ProductCreateValues } from '@lib/schemas/catalogue';
import { createProduct, updateProduct } from '@services/catalogue/products';
import { listCategories } from '@services/catalogue/categories';
import { CURRENCIES } from '@lib/constants/currencies';
import { showToast } from '@hooks/useToast';
import { errMsg } from '@services/api';
import type { Product } from '@typedefs/catalogue';

interface Props {
  open: boolean;
  onClose: () => void;
  editing?: Product | null;
  onSaved?: (p: Product) => void;
}

export function ProductFormModal({ open, onClose, editing, onSaved }: Props) {
  const qc = useQueryClient();
  const { data: categories = [] } = useQuery({ queryKey: ['catalogue', 'categories'], queryFn: () => listCategories(false) });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProductCreateValues>({
    resolver: zodResolver(productCreateSchema),
    defaultValues: editing ? {
      sku: editing.sku, name: editing.name, description: editing.description ?? '',
      category_id: editing.category_id ?? '', cost_price: editing.cost_price, selling_price: editing.selling_price,
      min_selling_price: editing.min_selling_price ?? undefined, currency: editing.currency,
      weight_grams: editing.weight_grams ?? undefined, custom_fields: editing.custom_fields ?? {},
      reorder_level: editing.reorder_level, reorder_quantity: editing.reorder_quantity,
    } : {
      sku: '', name: '', description: '', category_id: '', cost_price: 0, selling_price: 0,
      currency: 'NGN', custom_fields: {}, reorder_level: 0, reorder_quantity: 0,
    },
  });

  const mutation = useMutation({
    mutationFn: (v: ProductCreateValues) => {
      const payload = {
        ...v,
        category_id: v.category_id || undefined,
        description: v.description || undefined,
        min_selling_price: v.min_selling_price || undefined,
        weight_grams: v.weight_grams || undefined,
      };
      return editing ? updateProduct(editing.product_id, payload as Partial<Product>) : createProduct(payload as Partial<Product>);
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['catalogue'] });
      showToast.success(editing ? 'Product saved' : `${p.name} added`);
      reset(); onClose(); onSaved?.(p);
    },
    onError: (e) => showToast.error('Could not save', errMsg(e)),
  });

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} surface="light" size="lg"
      title={editing ? 'Edit product' : 'New product'}
      description={editing ? undefined : 'A primary barcode is generated automatically. Edit any time.'}
      footer={<>
        <Button variant="outline-light" onClick={() => { reset(); onClose(); }}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting || mutation.isPending} onClick={handleSubmit((v) => mutation.mutate(v))}>
          {editing ? 'Save changes' : 'Create product'}
        </Button>
      </>}>
      <form className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input {...register('sku')} label="SKU" placeholder="JWL-R-001" hint="Letters/digits/dashes" error={errors.sku?.message} disabled={!!editing} />
          <Input {...register('name')} label="Name" error={errors.name?.message} />
          <Textarea {...register('description')} label="Description" rows={3} className="sm:col-span-2" />
          <Select {...register('category_id')} label="Category"
            options={[{ value: '', label: '—' }, ...categories.map((c) => ({ value: c.category_id, label: c.name }))]} />
          <Select {...register('currency')} label="Currency"
            options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.symbol} ${c.code}` }))} />
          <Input {...register('cost_price', { valueAsNumber: true })} type="number" step="0.01" label="Cost price" />
          <Input {...register('selling_price', { valueAsNumber: true })} type="number" step="0.01" label="Selling price" />
          <Input {...register('min_selling_price', { valueAsNumber: true })} type="number" step="0.01" label="Min selling (POS floor)" error={errors.min_selling_price?.message} />
          <Input {...register('weight_grams', { valueAsNumber: true })} type="number" step="0.01" label="Weight (g)" />
          <Input {...register('reorder_level', { valueAsNumber: true })} type="number" label="Reorder at quantity" hint="Low-stock alert" />
          <Input {...register('reorder_quantity', { valueAsNumber: true })} type="number" label="Reorder qty" hint="How many to order when triggered" />
        </div>
      </form>
    </Modal>
  );
}
