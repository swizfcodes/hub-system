import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select } from '@components/ui/Select';
import { Textarea } from '@components/ui/Textarea';
import { productCreateSchema, type ProductCreateValues } from '@lib/schemas/catalogue';
import { createProduct, updateProduct, uploadImage } from '@services/catalogue/products';
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

  // --- Image Upload State ---
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs to prevent memory leaks when preview changes or modal closes
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        showToast.error('Invalid file type', 'Please select an image file.');
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const clearImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    clearImage();
    onClose();
  };

  // --- Form State ---
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

  // Re-sync form when editing prop changes
  useEffect(() => {
    if (open) {
      if (editing) {
        reset({
          sku: editing.sku, name: editing.name, description: editing.description ?? '',
          category_id: editing.category_id ?? '', cost_price: editing.cost_price, selling_price: editing.selling_price,
          min_selling_price: editing.min_selling_price ?? undefined, currency: editing.currency,
          weight_grams: editing.weight_grams ?? undefined, custom_fields: editing.custom_fields ?? {},
          reorder_level: editing.reorder_level, reorder_quantity: editing.reorder_quantity,
        });
      } else {
        reset({
          sku: '', name: '', description: '', category_id: '', cost_price: 0, selling_price: 0,
          currency: 'NGN', custom_fields: {}, reorder_level: 0, reorder_quantity: 0,
        });
      }
      clearImage();
    }
  }, [open, editing, reset]);

  // --- Mutation Sequence ---
  const mutation = useMutation({
    mutationFn: async (v: ProductCreateValues) => {
      const payload = {
        ...v,
        category_id: v.category_id || undefined,
        description: v.description || undefined,
        min_selling_price: v.min_selling_price || undefined,
        weight_grams: v.weight_grams || undefined,
      };
      
      // 1. Core Product Payload
      const product = await (editing 
        ? updateProduct(editing.product_id, payload as Partial<Product>) 
        : createProduct(payload as Partial<Product>));

      // 2. Safely Attempt Image Upload
      if (imageFile) {
        try {
          await uploadImage(product.product_id, imageFile, { isPrimary: true });
        } catch (imgError) {
          // We throw a custom structure so the onSuccess block knows the product saved, but the image failed.
          throw { type: 'IMAGE_ERROR', product, originalError: imgError };
        }
      }

      return product;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['catalogue'] });
      showToast.success(editing ? 'Product saved' : `${p.name} added`);
      handleClose(); 
      onSaved?.(p);
    },
    onError: (e: any) => {
      if (e?.type === 'IMAGE_ERROR') {
        // Product was created/updated successfully, but the multipart upload failed.
        qc.invalidateQueries({ queryKey: ['catalogue'] });
        showToast.error('Partial Success', 'Product saved, but the image failed to upload. You can try adding it from the product page.');
        handleClose();
        onSaved?.(e.product);
      } else {
        showToast.error('Could not save', errMsg(e));
      }
    },
  });

  return (
    <Modal open={open} onClose={handleClose} surface="light" size="lg"
      title={editing ? 'Edit product' : 'New product'}
      description={editing ? undefined : 'A primary barcode is generated automatically. Edit any time.'}
      footer={<>
        <Button variant="outline-light" onClick={handleClose}>Cancel</Button>
        <Button variant="primary" loading={isSubmitting || mutation.isPending} onClick={handleSubmit((v) => mutation.mutate(v))}>
          {editing ? 'Save changes' : 'Create product'}
        </Button>
      </>}>
      <form className="space-y-5">
        
        {/* --- Image Upload Block --- */}
        <div className="flex items-center gap-4 p-4 border border-orika-cloud/40 rounded-xl bg-white/50">
          <input type="file" accept="image/*" hidden ref={fileInputRef} onChange={handleImageChange} />
          
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="w-20 h-20 shrink-0 rounded-lg border border-dashed border-orika-graphite/40 flex items-center justify-center bg-white hover:bg-orika-cloud/10 cursor-pointer overflow-hidden relative group transition-colors"
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <ImagePlus className="w-6 h-6 text-orika-smoke group-hover:text-orika-gold transition-colors" />
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-orika-charcoal">
              {editing ? 'Replace Primary Image' : 'Primary Image'}
            </div>
            <div className="text-xs text-orika-smoke mb-2 truncate">
              High resolution JPEG or PNG.
            </div>
            {imageFile && (
              <Button variant="ghost" size="sm" onClick={clearImage} leftIcon={<X className="w-3 h-3" />}>
                Remove selection
              </Button>
            )}
          </div>
        </div>

        {/* --- Standard Form Fields --- */}
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