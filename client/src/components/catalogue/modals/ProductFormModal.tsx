import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select } from '@components/ui/Select';
import { Textarea } from '@components/ui/Textarea';
import { productCreateSchema, type ProductCreateValues } from '@lib/schemas/catalogue';
import { createProduct, updateProduct, listImages } from '@services/catalogue/products';
import { listCategories } from '@services/catalogue/categories';
import { CURRENCIES } from '@lib/constants/currencies';
import { SCENT_FAMILIES } from '@lib/constants/scent-families';
import { showToast } from '@hooks/useToast';
import { api, errMsg } from '@services/api';
import type { Product } from '@typedefs/catalogue';

const PRODUCT_FORMATS = [
  'Grand Edition',
  'Signature Edition',
  'Curated Gift Set',
  'Car Diffuser',
] as const;

const API_BASE = (api.defaults.baseURL ?? '').replace(/\/api$/, '');

interface Props {
  open: boolean;
  onClose: () => void;
  business?: string; // pass the current business context
  editing?: Product | null;
  onSaved?: (p: Product) => void;
}

export function ProductFormModal({ open, onClose, business = 'diffusers', editing, onSaved }: Props) {
  const qc = useQueryClient();
  const isDiffusers = business === 'diffusers';

  const { data: categories = [] } = useQuery({
    queryKey: ['catalogue', 'categories'],
    queryFn: () => listCategories(false),
  });

  // Load existing images when editing, so we can auto-populate web.images
  const { data: existingImages = [] } = useQuery({
    queryKey: ['catalogue', 'images', editing?.product_id],
    queryFn: () => listImages(editing!.product_id),
    enabled: !!editing?.product_id,
  });

  const existingWeb = (editing as any)?.store_product;

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<ProductCreateValues>({
    resolver: zodResolver(productCreateSchema),
    defaultValues: editing ? {
      sku: editing.sku,
      name: editing.name,
      description: editing.description ?? '',
      category_id: editing.category_id ?? '',
      cost_price: editing.cost_price,
      selling_price: editing.selling_price,
      min_selling_price: editing.min_selling_price ?? undefined,
      currency: editing.currency,
      weight_grams: editing.weight_grams ?? undefined,
      custom_fields: editing.custom_fields ?? {},
      reorder_level: editing.reorder_level,
      reorder_quantity: editing.reorder_quantity,
      // pre-fill web block if already published
      web: existingWeb ? {
        slug: existingWeb.slug,
        scent_family: existingWeb.scent_family,
        format: existingWeb.format,
        size_ml: existingWeb.size_ml,
        top_notes: existingWeb.top_notes?.join(', ') ?? '',
        heart_notes: existingWeb.heart_notes?.join(', ') ?? '',
        base_notes: existingWeb.base_notes?.join(', ') ?? '',
        web_description: existingWeb.web_description ?? '',
        is_published: existingWeb.is_published,
      } : undefined,
    } : {
      sku: '', name: '', description: '', category_id: '',
      cost_price: 0, selling_price: 0, currency: 'NGN',
      custom_fields: {}, reorder_level: 0, reorder_quantity: 0,
    },
  });

  // Watch is_published to show/hide required web fields
  const isPublished = useWatch({ control, name: 'web.is_published' });

  const mutation = useMutation({
    mutationFn: (v: ProductCreateValues) => {
      // Build image URLs from uploaded product images
      const imageUrls = existingImages
        .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
        .map((img) => `${API_BASE}/documents/${img.document_id}/image`);

      const web = v.web && isDiffusers ? {
        slug: v.web.slug,
        scent_family: v.web.scent_family,
        format: v.web.format,
        size_ml: v.web.size_ml,
        top_notes: v.web.top_notes ? v.web.top_notes.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        heart_notes: v.web.heart_notes ? v.web.heart_notes.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        base_notes: v.web.base_notes ? v.web.base_notes.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        web_description: v.web.web_description || undefined,
        images: imageUrls,
        is_published: v.web.is_published ?? false,
      } : undefined;

      const payload = {
        ...v,
        category_id: v.category_id || undefined,
        description: v.description || undefined,
        min_selling_price: v.min_selling_price || undefined,
        weight_grams: v.weight_grams || undefined,
        web,
      };

      return editing
        ? updateProduct(editing.product_id, payload as Partial<Product>)
        : createProduct(payload as Partial<Product>);
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['catalogue'] });
      showToast.success(editing ? 'Product saved' : `${p.name} added`);
      reset(); onClose(); onSaved?.(p);
    },
    onError: (e) => showToast.error('Could not save', errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      surface="light"
      size="lg"
      title={editing ? 'Edit product' : 'New product'}
      description={editing ? undefined : 'A primary barcode is generated automatically.'}
      footer={<>
        <Button variant="outline-light" onClick={() => { reset(); onClose(); }}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting || mutation.isPending} onClick={handleSubmit((v) => mutation.mutate(v))}>
          {editing ? 'Save changes' : 'Create product'}
        </Button>
      </>}
    >
      <form className="space-y-6">
        {/* ── Core ERP fields ── */}
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

        {/* ── Storefront / web block (diffusers only) ── */}
        {isDiffusers && (
          <div className="border-t border-gray-200 pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Storefront listing</p>
                <p className="text-xs text-gray-500 mt-0.5">Publish this product to the Orika Living website</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('web.is_published')} className="rounded" />
                <span className="text-sm text-gray-700">Published</span>
              </label>
            </div>

            {isPublished && (
              <div className="grid gap-4 sm:grid-cols-2 bg-gray-50 rounded-lg p-4">
                <Input
                  {...register('web.slug')}
                  label="URL slug"
                  placeholder="amber-noir-200ml"
                  hint="Lowercase, hyphens only"
                  error={(errors as any).web?.slug?.message}
                />
                <Input
                  {...register('web.size_ml', { valueAsNumber: true })}
                  type="number"
                  label="Size (ml)"
                  error={(errors as any).web?.size_ml?.message}
                />
                <Select
                  {...register('web.scent_family')}
                  label="Scent family"
                  options={[{ value: '', label: '—' }, ...SCENT_FAMILIES.map((s) => ({ value: s, label: s }))]}
                  error={(errors as any).web?.scent_family?.message}
                />
                <Select
                  {...register('web.format')}
                  label="Format"
                  options={[{ value: '', label: '—' }, ...PRODUCT_FORMATS.map((f) => ({ value: f, label: f }))]}
                  error={(errors as any).web?.format?.message}
                />
                <Input
                  {...register('web.top_notes')}
                  label="Top notes"
                  placeholder="Bergamot, Cardamom"
                  hint="Comma-separated"
                  className="sm:col-span-2"
                />
                <Input
                  {...register('web.heart_notes')}
                  label="Heart notes"
                  placeholder="Rose, Jasmine"
                  hint="Comma-separated"
                  className="sm:col-span-2"
                />
                <Input
                  {...register('web.base_notes')}
                  label="Base notes"
                  placeholder="Sandalwood, Musk"
                  hint="Comma-separated"
                  className="sm:col-span-2"
                />
                <Textarea
                  {...register('web.web_description')}
                  label="Web description"
                  rows={3}
                  hint="Leave blank to use the ERP description"
                  className="sm:col-span-2"
                />
                {existingImages.length > 0 && (
                  <p className="sm:col-span-2 text-xs text-gray-500">
                    {existingImages.length} image{existingImages.length > 1 ? 's' : ''} will be included on the storefront. Manage images from the product detail page.
                  </p>
                )}
                {existingImages.length === 0 && (
                  <p className="sm:col-span-2 text-xs text-amber-600">
                    No images uploaded yet. Add images from the product detail page before publishing.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}