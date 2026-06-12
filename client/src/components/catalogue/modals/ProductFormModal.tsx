import { useState, useRef, useEffect } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Textarea } from "@components/ui/Textarea";
import { NumberField } from "@components/ui/NumberField";
import {
  productCreateSchema,
  type ProductCreateValues,
} from "@lib/schemas/catalogue";
import {
  createProduct,
  updateProduct,
  listImages,
  uploadImage,
} from "@services/catalogue/products";
import { listCategories } from "@services/catalogue/categories";
import { CURRENCIES } from "@lib/constants/currencies";
import { SCENT_FAMILIES } from "@lib/constants/scent-families";
import { showToast } from "@hooks/useToast";
import { toast } from "sonner";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { api, errMsg } from "@services/api";
import type { FieldErrors } from "react-hook-form";

/** Split a comma-separated notes string into a clean array. */
function splitNotes(s?: string): string[] {
  return s
    ? s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
}

/** Convert a product name to a URL-safe slug. */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-");
}

/** Walk a nested FieldErrors tree and return the first error message found. */
function firstErrorMessage(errs: Record<string, unknown>): string {
  for (const val of Object.values(errs)) {
    if (!val) continue;
    if (typeof (val as { message?: string }).message === "string") {
      return (val as { message: string }).message;
    }
    if (typeof val === "object") {
      const nested = firstErrorMessage(val as Record<string, unknown>);
      if (nested) return nested;
    }
  }
  return "";
}
import type { Product } from "@typedefs/catalogue";

const PRODUCT_FORMATS = [
  "Grand Edition",
  "Signature Edition",
  "Curated Gift Set",
  "Car Diffuser",
] as const;

const API_BASE = (api.defaults.baseURL ?? "").replace(/\/api$/, "");

interface Props {
  open: boolean;
  onClose: () => void;
  business?: string; // pass the current business context
  editing?: Product | null;
  onSaved?: (p: Product) => void;
}

export function ProductFormModal({
  open,
  onClose,
  business,
  editing,
  onSaved,
}: Props) {
  const qc = useQueryClient();
  // Use the *actual* active business, not a hardcoded default. Previously this
  // defaulted to 'diffusers' for every caller (none pass the prop), so editing
  // a jewelry product wrongly showed the storefront block and could 400 on save.
  const { active } = useActiveBusiness();
  const effectiveBusiness = business ?? active ?? "diffusers";
  const isDiffusers = effectiveBusiness === "diffusers";

  const { data: categories = [] } = useQuery({
    queryKey: ["catalogue", "categories"],
    queryFn: () => listCategories(false),
  });

  // --- Image Upload State ---
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Tracks whether the one-time "publish to website?" nudge has shown this session.
  const publishPromptShownRef = useRef(false);

  // Cleanup object URLs to prevent memory leaks when preview changes or modal closes
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        showToast.error("Invalid file type", "Please select an image file.");
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    clearImage();
    onClose();
  };

  // Load existing images when editing, so we can auto-populate web.images
  const { data: existingImages = [] } = useQuery({
    queryKey: ["catalogue", "images", editing?.product_id],
    queryFn: () => listImages(editing!.product_id),
    enabled: !!editing?.product_id,
  });

  const existingWeb = (editing as any)?.store_product;

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ProductCreateValues>({
    resolver: zodResolver(productCreateSchema),
    defaultValues: editing
      ? {
          sku: editing.sku,
          name: editing.name,
          description: editing.description ?? "",
          category_id: editing.category_id ?? "",
          cost_price: Number(editing.cost_price) || 0,
          selling_price: Number(editing.selling_price) || 0,
          min_selling_price:
            editing.min_selling_price != null
              ? Number(editing.min_selling_price)
              : undefined,
          currency: editing.currency,
          weight_grams:
            editing.weight_grams != null
              ? Number(editing.weight_grams)
              : undefined,
          custom_fields: editing.custom_fields ?? {},
          reorder_level: Number(editing.reorder_level) || 0,
          reorder_quantity: Number(editing.reorder_quantity) || 0,
          // pre-fill web block if already published
          web: existingWeb
            ? {
                slug: existingWeb.slug,
                scent_family: existingWeb.scent_family,
                format: existingWeb.format,
                size_ml: existingWeb.size_ml,
                top_notes: existingWeb.top_notes?.join(", ") ?? "",
                heart_notes: existingWeb.heart_notes?.join(", ") ?? "",
                base_notes: existingWeb.base_notes?.join(", ") ?? "",
                web_description: existingWeb.web_description ?? "",
                is_published: existingWeb.is_published,
              }
            : undefined,
        }
      : {
          sku: "",
          name: "",
          description: "",
          category_id: "",
          cost_price: 0,
          selling_price: 0,
          currency: "NGN",
          custom_fields: {},
          reorder_level: 0,
          reorder_quantity: 0,
        },
  });

  // Re-sync form when editing prop changes
  useEffect(() => {
    if (open) {
      publishPromptShownRef.current = false;
      if (editing) {
        const web = (editing as any)?.store_product;
        reset({
          sku: editing.sku,
          name: editing.name,
          description: editing.description ?? "",
          category_id: editing.category_id ?? "",
          cost_price: Number(editing.cost_price) || 0,
          selling_price: Number(editing.selling_price) || 0,
          min_selling_price:
            editing.min_selling_price != null
              ? Number(editing.min_selling_price)
              : undefined,
          currency: editing.currency,
          weight_grams:
            editing.weight_grams != null
              ? Number(editing.weight_grams)
              : undefined,
          custom_fields: editing.custom_fields ?? {},
          reorder_level: Number(editing.reorder_level) || 0,
          reorder_quantity: Number(editing.reorder_quantity) || 0,
          web: web
            ? {
                slug: web.slug,
                scent_family: web.scent_family,
                format: web.format,
                size_ml: web.size_ml,
                top_notes: web.top_notes?.join(", ") ?? "",
                heart_notes: web.heart_notes?.join(", ") ?? "",
                base_notes: web.base_notes?.join(", ") ?? "",
                web_description: web.web_description ?? "",
                is_published: web.is_published,
              }
            : undefined,
        });
      } else {
        reset({
          sku: "",
          name: "",
          description: "",
          category_id: "",
          cost_price: 0,
          selling_price: 0,
          currency: "NGN",
          custom_fields: {},
          reorder_level: 0,
          reorder_quantity: 0,
        });
      }
      clearImage();
    }
  }, [open, editing, reset]);

  // --- Mutation Sequence ---

  // Watch is_published to show/hide required web fields
  const isPublished = useWatch({ control, name: "web.is_published" });
  const productName = useWatch({ control, name: "name" });
  const currentSlug = useWatch({ control, name: "web.slug" });

  // Auto-generate slug from product name when Published is first ticked
  // and the slug field is still empty. User can override it at any time.
  useEffect(() => {
    if (isPublished && !currentSlug && productName) {
      setValue("web.slug", toSlug(productName), { shouldValidate: false });
    }
    // only run when the Published toggle changes, not on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublished]);

  // One-time "publish to website?" nudge on first creation (diffusers only).
  // Fires when the user reaches Reorder qty / Min selling — the moment they're
  // thinking about how the product sells. Saying yes auto-fills the slug, ticks
  // Published, and jumps to Size (ml). The manual checkbox below still works.
  function maybePromptPublish() {
    if (!isDiffusers || editing) return; // only brand-new diffusers products
    if (publishPromptShownRef.current) return; // once per modal session
    if (isPublished) return; // already opted in
    publishPromptShownRef.current = true;
    toast("Publish this product to the online store?", {
      description:
        "We’ll generate the URL slug, tick Published, and take you to Size (ml).",
      duration: 12000,
      action: {
        label: "Yes, publish",
        onClick: () => {
          setValue("web.is_published", true, { shouldValidate: false });
          if (productName)
            setValue("web.slug", toSlug(productName), {
              shouldValidate: false,
            });
          // The Size (ml) field only mounts once Published flips on.
          setTimeout(() => {
            try {
              setFocus("web.size_ml");
            } catch {
              /* not mounted yet */
            }
          }, 80);
        },
      },
      cancel: { label: "Not now", onClick: () => {} },
    });
  }

  const mutation = useMutation({
    mutationFn: async (v: ProductCreateValues) => {
      // Build image URLs from uploaded product images
      const imageUrls = existingImages
        .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
        .map((img) => `${API_BASE}/documents/${img.document_id}/image`);

      // Storefront (web) block — explicit so the three real cases behave and we
      // never send a half-built block the API rejects (the old silent-fail):
      //   • publish now      → full validated block (zod guarantees the fields)
      //   • was published,
      //     now unchecked     → { is_published:false } to truly unpublish
      //   • never published   → omit web entirely
      const wasPublished = !!existingWeb;
      const publishNow = !!v.web?.is_published;
      let web: Record<string, unknown> | undefined;
      if (isDiffusers) {
        if (publishNow) {
          web = {
            slug: v.web!.slug,
            scent_family: v.web!.scent_family,
            format: v.web!.format,
            size_ml: v.web!.size_ml,
            top_notes: splitNotes(v.web!.top_notes),
            heart_notes: splitNotes(v.web!.heart_notes),
            base_notes: splitNotes(v.web!.base_notes),
            web_description: v.web!.web_description || undefined,
            images: imageUrls,
            is_published: true,
          };
        } else if (wasPublished) {
          web = { is_published: false };
        }
      }

      const payload = {
        ...v,
        category_id: v.category_id || undefined,
        description: v.description || undefined,
        min_selling_price: v.min_selling_price || undefined,
        weight_grams: v.weight_grams || undefined,
        web,
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
          throw { type: "IMAGE_ERROR", product, originalError: imgError };
        }
      }

      return product;
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      showToast.success(editing ? "Product saved" : `${p.name} added`);
      handleClose();
      onSaved?.(p);
    },
    onError: (e: any) => {
      if (e?.type === "IMAGE_ERROR") {
        // Product was created/updated successfully, but the multipart upload failed.
        qc.invalidateQueries({ queryKey: ["catalogue"] });
        showToast.error(
          "Partial Success",
          "Product saved, but the image failed to upload. You can try adding it from the product page.",
        );
        handleClose();
        onSaved?.(e.product);
      } else {
        showToast.error("Could not save", errMsg(e));
      }
    },
  });

  return (
    <Modal
      open={open}
      onClose={handleClose}
      surface="light"
      size="lg"
      title={editing ? "Edit product" : "New product"}
      description={
        editing
          ? undefined
          : "A primary barcode is generated automatically. Edit any time."
      }
      footer={
        <>
          <Button variant="outline-light" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={isSubmitting || mutation.isPending}
            onClick={handleSubmit(
              (v) => mutation.mutate(v),
              (errs: FieldErrors<ProductCreateValues>) => {
                const msg =
                  firstErrorMessage(errs as Record<string, unknown>) ||
                  "Please check the form for errors";
                showToast.error("Validation error", msg);
              },
            )}
          >
            {editing ? "Save changes" : "Create product"}
          </Button>
        </>
      }
    >
      <form className="space-y-5">
        {/* --- Image Upload Block --- */}
        <div className="flex items-center gap-4 p-4 border border-brand-cloud/40 rounded-xl bg-white/50">
          <input
            type="file"
            accept="image/*"
            hidden
            ref={fileInputRef}
            onChange={handleImageChange}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-20 h-20 shrink-0 rounded-lg border border-dashed border-brand-graphite/40 flex items-center justify-center bg-white hover:bg-brand-cloud/10 cursor-pointer overflow-hidden relative group transition-colors"
          >
            {imagePreview ? (
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <ImagePlus className="w-6 h-6 text-brand-smoke group-hover:text-brand-accent transition-colors" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-brand-charcoal">
              {editing ? "Replace Primary Image" : "Primary Image"}
            </div>
            <div className="text-xs text-brand-smoke mb-2 truncate">
              High resolution JPEG or PNG.
            </div>
            {imageFile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearImage}
                leftIcon={<X className="w-3 h-3" />}
              >
                Remove selection
              </Button>
            )}
          </div>
        </div>

        {/* --- Standard Form Fields --- */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            {...register("sku")}
            label="SKU"
            placeholder="JWL-R-001"
            hint="Letters/digits/dashes"
            error={errors.sku?.message}
            disabled={!!editing}
          />
          <Input
            {...register("name")}
            label="Name"
            error={errors.name?.message}
          />
          <Textarea
            {...register("description")}
            label="Description"
            rows={3}
            className="sm:col-span-2"
          />
          <Select
            {...register("category_id")}
            label="Category"
            options={[
              { value: "", label: "—" },
              ...categories.map((c) => ({
                value: c.category_id,
                label: c.name,
              })),
            ]}
          />
          <Select
            {...register("currency")}
            label="Currency"
            options={CURRENCIES.map((c) => ({
              value: c.code,
              label: `${c.symbol} ${c.code}`,
            }))}
          />
          <Controller
            control={control}
            name="cost_price"
            render={({ field, fieldState }) => (
              <NumberField
                surface="light"
                decimal
                label="Cost price"
                placeholder="0.00"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="selling_price"
            render={({ field, fieldState }) => (
              <NumberField
                surface="light"
                decimal
                label="Selling price"
                placeholder="0.00"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="min_selling_price"
            render={({ field, fieldState }) => (
              <NumberField
                surface="light"
                decimal
                label="Min selling (POS floor)"
                placeholder="0.00"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={() => {
                  maybePromptPublish();
                  field.onBlur();
                }}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="weight_grams"
            render={({ field, fieldState }) => (
              <NumberField
                surface="light"
                decimal
                label="Weight (g)"
                placeholder="0.00"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="reorder_level"
            render={({ field, fieldState }) => (
              <NumberField
                surface="light"
                label="Reorder at quantity"
                hint="Low-stock alert"
                placeholder="0"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="reorder_quantity"
            render={({ field, fieldState }) => (
              <NumberField
                surface="light"
                label="Reorder qty"
                hint="How many to order when triggered"
                placeholder="0"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={() => {
                  maybePromptPublish();
                  field.onBlur();
                }}
                error={fieldState.error?.message}
              />
            )}
          />
        </div>

        {/* ── Storefront / web block (diffusers only) ── */}
        {isDiffusers && (
          <div className="border-t border-gray-200 pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Storefront listing
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Publish this product to the online store
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register("web.is_published")}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Published</span>
              </label>
            </div>

            {isPublished && (
              <div className="grid gap-4 sm:grid-cols-2 bg-gray-50 rounded-lg p-4">
                <Input
                  {...register("web.slug")}
                  label="URL slug"
                  placeholder="amber-noir-200ml"
                  hint="Lowercase, hyphens only"
                  error={(errors as any).web?.slug?.message}
                />
                <Controller
                  control={control}
                  name="web.size_ml"
                  render={({ field, fieldState }) => (
                    <NumberField
                      surface="light"
                      label="Size (ml)"
                      placeholder="0"
                      value={field.value}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                    />
                  )}
                />
                <Select
                  {...register("web.scent_family")}
                  label="Scent family"
                  options={[
                    { value: "", label: "—" },
                    ...SCENT_FAMILIES.map((s) => ({ value: s, label: s })),
                  ]}
                  error={(errors as any).web?.scent_family?.message}
                />
                <Select
                  {...register("web.format")}
                  label="Format"
                  options={[
                    { value: "", label: "—" },
                    ...PRODUCT_FORMATS.map((f) => ({ value: f, label: f })),
                  ]}
                  error={(errors as any).web?.format?.message}
                />
                <Input
                  {...register("web.top_notes")}
                  label="Top notes"
                  placeholder="Bergamot, Cardamom"
                  hint="Comma-separated"
                  className="sm:col-span-2"
                />
                <Input
                  {...register("web.heart_notes")}
                  label="Heart notes"
                  placeholder="Rose, Jasmine"
                  hint="Comma-separated"
                  className="sm:col-span-2"
                />
                <Input
                  {...register("web.base_notes")}
                  label="Base notes"
                  placeholder="Sandalwood, Musk"
                  hint="Comma-separated"
                  className="sm:col-span-2"
                />
                <Textarea
                  {...register("web.web_description")}
                  label="Web description"
                  rows={3}
                  hint="Leave blank to use the ERP description"
                  className="sm:col-span-2"
                />
                {existingImages.length > 0 && (
                  <p className="sm:col-span-2 text-xs text-gray-500">
                    {existingImages.length} image
                    {existingImages.length > 1 ? "s" : ""} will be included on
                    the storefront. Manage images from the product detail page.
                  </p>
                )}
                {existingImages.length === 0 && (
                  <p className="sm:col-span-2 text-xs text-amber-600">
                    No images uploaded yet. Add images from the product detail
                    page before publishing.
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
