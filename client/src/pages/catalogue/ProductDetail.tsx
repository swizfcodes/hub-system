import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Pencil,
  Archive,
  RotateCw,
  Image as ImageIcon,
  Truck,
  Hash,
  BookOpen,
  Plus,
  Star,
  Trash2,
  Copy,
  Check,
  Printer,
  Settings,
  Package,
  MapPin,
  ShoppingCart,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { Button } from "@components/ui/Button";
import { Tabs } from "@components/ui/Tabs";
import { Badge } from "@components/ui/Badge";
import { Card } from "@components/ui/Card";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { NumberField } from "@components/ui/NumberField";
import { ConfirmationModal } from "@components/ui/ConfirmationModal";
import { ProductImage } from "@components/catalogue/shared/ProductImage";
import { ProductPrice } from "@components/catalogue/shared/ProductPrice";
import { ProductFormModal } from "@components/catalogue/modals/ProductFormModal";
import {
  getProduct,
  deleteProduct,
  restoreProduct,
  updateProduct,
  listImages,
  uploadImage,
  setPrimaryImage,
  deleteImage,
  listBarcodes,
  addBarcode,
  deleteBarcode,
  listProductSuppliers,
  unlinkSupplier,
} from "@services/catalogue/products";
import { listSuppliers } from "@services/purchasing/suppliers";
import { linkSupplier } from "@services/catalogue/products";
import { getOnHand } from "@services/stock/onHand";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtDateTime, fmtMoney } from "@lib/format";
import { code128SVG } from "@lib/barcode/code128";
import { printBarcodeLabels } from "@lib/print/printBarcode";
import {
  getPrintSettings,
  savePrintSettings,
  type BarcodePrintSettings,
} from "@lib/print/printSettings";
import { isQzAvailable } from "@lib/print/qzTray";
import { ShareProductModal } from "@components/catalogue/modals/ShareProductModal";
import { useRef } from "react";
type Product = Awaited<ReturnType<typeof getProduct>>;

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "images", label: "Images" },
  { key: "suppliers", label: "Suppliers" },
  { key: "barcodes", label: "Barcodes" },
  { key: "stock", label: "Stock" },
  { key: "accounting", label: "Accounting" },
];

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ["catalogue", "product", id],
    queryFn: () => getProduct(id!),
    enabled: !!id,
  });

  const archive = useMutation({
    mutationFn: () => deleteProduct(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      showToast.success("Product archived");
      setArchiveOpen(false);
      navigate("/catalogue");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });
  const restore = useMutation({
    mutationFn: () => restoreProduct(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      showToast.success("Restored");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });
  const activate = useMutation({
    mutationFn: () => updateProduct(id!, { is_active: true } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      showToast.success("Product activated — now visible in POS and Stock");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });
  const deactivate = useMutation({
    mutationFn: () => updateProduct(id!, { is_active: false } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      showToast.success("Product deactivated");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <>
      <Topbar title={product?.name || "Product"} subtitle={product?.sku} />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Catalogue", to: "/catalogue" },
              { label: product?.name ?? "…" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate("/catalogue")}
          >
            Back
          </Button>
        </div>

        {isLoading || !product ? (
          <div className="space-y-4">
            <Skeleton className="h-44" />
            <Skeleton className="h-12" />
            <Skeleton className="h-96" />
          </div>
        ) : (
          <>
            {/* Header */}
            <header className="mb-6 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-5 items-start">
              <ProductImage
                product={product}
                size="xl"
                className="w-full h-auto aspect-square"
              />
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <h1 className="font-display font-light text-3xl sm:text-4xl text-brand-cream">
                    {product.name}
                  </h1>
                  {!product.is_active && (
                    <Badge tone="warn" size="sm">
                      Inactive
                    </Badge>
                  )}
                  {product.is_deleted && (
                    <Badge tone="danger" size="sm">
                      Archived
                    </Badge>
                  )}
                </div>
                <div className="text-xs font-mono text-brand-smoke mb-3">
                  {product.sku}
                  {product.barcode && ` · ${product.barcode}`}
                </div>
                {product.description && (
                  <p className="text-sm text-brand-cloud max-w-2xl mb-4">
                    {product.description}
                  </p>
                )}
                <ProductPrice
                  cost={product.cost_price}
                  selling={product.selling_price}
                  currency={product.currency}
                  size="md"
                />
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Pencil className="w-3.5 h-3.5" />}
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </Button>
                  {!product.is_deleted && !product.is_active && (
                    <Button
                      variant="gold"
                      size="sm"
                      leftIcon={<RotateCw className="w-3.5 h-3.5" />}
                      onClick={() => activate.mutate()}
                      loading={activate.isPending}
                    >
                      Activate
                    </Button>
                  )}
                  {!product.is_deleted && product.is_active && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => deactivate.mutate()}
                      loading={deactivate.isPending}
                    >
                      Deactivate
                    </Button>
                  )}
                  {product.is_deleted ? (
                    <Button
                      variant="gold"
                      size="sm"
                      leftIcon={<RotateCw className="w-3.5 h-3.5" />}
                      onClick={() => restore.mutate()}
                      loading={restore.isPending}
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      size="sm"
                      leftIcon={<Archive className="w-3.5 h-3.5" />}
                      onClick={() => setArchiveOpen(true)}
                    >
                      Archive
                    </Button>
                  )}
                  <button
                    onClick={() => setSharing(true)}
                    className="inline-flex items-center gap-1.5 text-xs text-brand-smoke hover:text-brand-cream"
                  >
                    <Copy className="w-3 h-3" /> Share
                  </button>
                </div>
              </div>
            </header>

            <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-6" />

            <div className="animate-fade-in">
              {tab === "overview" && <OverviewTab product={product} />}
              {tab === "images" && <ImagesTab productId={product.product_id} />}
              {tab === "suppliers" && (
                <SuppliersTab productId={product.product_id} />
              )}
              {tab === "barcodes" && <BarcodesTab product={product} />}
              {tab === "stock" && <StockTab product={product} />}
              {tab === "accounting" && (
                <AccountingPlaceholderTab product={product} />
              )}
            </div>
          </>
        )}
      </div>

      <ProductFormModal
        open={editing}
        onClose={() => setEditing(false)}
        editing={product}
      />

      {product && (
        <ShareProductModal
          open={sharing}
          onClose={() => setSharing(false)}
          productId={product.product_id}
        />
      )}

      <ConfirmationModal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => {
          archive.mutateAsync();
        }}
        title={`Archive “${product?.name}”?`}
        message={
          <p>
            The product is hidden from new transactions. Historical stock and
            sales remain. You can restore at any time.
          </p>
        }
        confirmPhrase={product?.sku}
        confirmLabel="Archive"
        loading={archive.isPending}
      />
    </>
  );
}

// ─── OVERVIEW TAB ────────────────────────────────────────────
function OverviewTab({ product }: { product: Product }) {
  if (!product) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <InfoCard
        label="Cost price"
        value={fmtMoney(product.cost_price, product.currency)}
      />
      <InfoCard
        label="Selling price"
        value={fmtMoney(product.selling_price, product.currency)}
      />
      <InfoCard
        label="Min selling price"
        value={
          product.min_selling_price
            ? fmtMoney(product.min_selling_price, product.currency)
            : "—"
        }
        hint="POS discount floor"
      />
      <InfoCard
        label="Weight"
        value={product.weight_grams ? `${product.weight_grams} g` : "—"}
      />
      <InfoCard label="Reorder level" value={String(product.reorder_level)} />
      <InfoCard
        label="Reorder quantity"
        value={String(product.reorder_quantity)}
      />
      <InfoCard label="Currency" value={product.currency} />
      <InfoCard label="Created" value={fmtDateTime(product.created_at)} />
      <InfoCard label="Last updated" value={fmtDateTime(product.updated_at)} />
      {Object.keys(product.custom_fields ?? {}).length > 0 && (
        <Card className="p-4 sm:col-span-2 lg:col-span-3">
          <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke mb-2">
            Custom fields
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(product.custom_fields ?? {}).map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-2 text-xs">
                <dt className="text-brand-smoke capitalize">
                  {k.replace(/_/g, " ")}:
                </dt>
                <dd className="text-brand-cream truncate">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  );
}

function InfoCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="p-4 rounded-xl border border-brand-graphite bg-brand-charcoal/60">
      <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
        {label}
      </div>
      <div className="text-sm font-medium text-brand-cream mt-1">{value}</div>
      {hint && (
        <div className="text-[0.6rem] text-brand-smoke mt-1">{hint}</div>
      )}
    </div>
  );
}

// ─── IMAGES TAB ──────────────────────────────────────────────
function ImagesTab({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: images, isLoading } = useQuery({
    queryKey: ["catalogue", "product", productId, "images"],
    queryFn: () => listImages(productId),
  });

  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadImage(productId, file, { isPrimary: !(images && images.length) }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["catalogue", "product", productId, "images"],
      });
      qc.invalidateQueries({ queryKey: ["catalogue", "product", productId] });
      showToast.success("Image uploaded");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });
  const setPrimary = useMutation({
    mutationFn: (imageId: string) => setPrimaryImage(imageId),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["catalogue", "product", productId, "images"],
      }),
  });
  const remove = useMutation({
    mutationFn: (imageId: string) => deleteImage(imageId),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["catalogue", "product", productId, "images"],
      }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
          }}
        />
        <Button
          variant="gold"
          size="sm"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          loading={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          Upload image
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !images || images.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="w-6 h-6" />}
          title="No images yet"
          description="Upload product photos for the catalogue and customer-facing pages."
        />
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((img) => (
            <div
              key={img.image_id}
              className="relative rounded-xl overflow-hidden border border-brand-graphite group"
            >
              <img
                src={img.url}
                alt={img.alt_text ?? ""}
                className="w-full aspect-square object-cover"
              />
              {img.is_primary && (
                <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-black/70 text-brand-accent text-[0.55rem] uppercase tracking-widest">
                  <Star className="w-2.5 h-2.5 fill-brand-accent" /> Primary
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-brand-black to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                {!img.is_primary && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPrimary.mutate(img.image_id)}
                  >
                    Make primary
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  leftIcon={<Trash2 className="w-3 h-3" />}
                  onClick={() => remove.mutate(img.image_id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SUPPLIERS TAB ───────────────────────────────────────────
function SuppliersTab({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data: links, isLoading } = useQuery({
    queryKey: ["catalogue", "product", productId, "suppliers"],
    queryFn: () => listProductSuppliers(productId),
  });
  const remove = useMutation({
    mutationFn: (supplierId: string) => unlinkSupplier(productId, supplierId),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["catalogue", "product", productId, "suppliers"],
      });
      showToast.success("Removed");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="gold"
          size="sm"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setAdding(true)}
        >
          Link supplier
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-20" />
      ) : !links || links.length === 0 ? (
        <EmptyState
          icon={<Truck className="w-6 h-6" />}
          title="No suppliers linked"
          description="Link suppliers who can source this product. Multiple suppliers = better RFQ outcomes."
        />
      ) : (
        <div className="space-y-2">
          {links.map((l) => (
            <Card key={l.supplier_id} className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-accent2/15 text-accent2 flex items-center justify-center">
                <Truck className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/procurement/suppliers/${l.supplier_id}`}
                    className="text-sm font-medium text-brand-cream hover:text-brand-accent truncate"
                  >
                    {l.supplier_name}
                  </Link>
                  {l.is_preferred && (
                    <Badge tone="gold" size="xs">
                      <Star className="w-2.5 h-2.5 fill-brand-accent" /> Preferred
                    </Badge>
                  )}
                </div>
                <div className="text-[0.65rem] text-brand-smoke mt-0.5">
                  {l.supplier_sku && <>SKU {l.supplier_sku} · </>}
                  {l.unit_cost != null && (
                    <>Cost {fmtMoney(l.unit_cost, "NGN")} · </>
                  )}
                  {l.lead_time_days && <>Lead {l.lead_time_days} days</>}
                </div>
              </div>
              <button
                onClick={() => remove.mutate(l.supplier_id)}
                className="p-2 text-brand-smoke hover:text-state-danger"
                aria-label="Unlink"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </Card>
          ))}
        </div>
      )}
      <LinkSupplierModal
        open={adding}
        onClose={() => setAdding(false)}
        productId={productId}
      />
    </div>
  );
}

function LinkSupplierModal({
  open,
  onClose,
  productId,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
}) {
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [unitCost, setUnitCost] = useState<number | undefined>(undefined);
  const [leadTime, setLeadTime] = useState<number | undefined>(undefined);
  const [isPreferred, setIsPreferred] = useState(false);

  const { data: sups } = useQuery({
    queryKey: ["purchasing", "suppliers"],
    queryFn: () => listSuppliers({ limit: 200 }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      linkSupplier(productId, {
        supplier_id: supplierId,
        unit_cost: unitCost,
        lead_time_days: leadTime,
        is_preferred: isPreferred,
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["catalogue", "product", productId, "suppliers"],
      });
      showToast.success("Supplier linked");
      onClose();
      setSupplierId("");
      setUnitCost(undefined);
      setLeadTime(undefined);
      setIsPreferred(false);
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      surface="light"
      size="md"
      title="Link supplier"
      footer={
        <>
          <Button variant="outline-light" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!supplierId}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Link
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="w-full bg-white border border-brand-cloud/40 rounded-xl py-3 px-4 text-sm"
        >
          <option value="">Pick a supplier…</option>
          {(sups?.data ?? []).map((s) => (
            <option key={s.supplier_id} value={s.supplier_id}>
              {s.display_name} ({s.supplier_code})
            </option>
          ))}
        </select>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            surface="light"
            decimal
            value={unitCost}
            onValueChange={setUnitCost}
            label="Unit cost (optional)"
            placeholder="0.00"
          />
          <NumberField
            surface="light"
            value={leadTime}
            onValueChange={setLeadTime}
            label="Lead time (days)"
            placeholder="0"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isPreferred}
            onChange={(e) => setIsPreferred(e.target.checked)}
            className="w-4 h-4 accent-brand-accent"
          />
          <span>Mark as preferred supplier for this product</span>
        </label>
      </div>
    </Modal>
  );
}

// ─── BARCODES TAB ────────────────────────────────────────────
function BarcodePreview({ value, type }: { value: string; type: string }) {
  const isCode128 = !type || type.toUpperCase() === "CODE128";
  const svg = isCode128
    ? code128SVG(value, { height: 56, moduleWidth: 2 })
    : null;
  if (svg) {
    return (
      <div
        className="bg-white rounded-lg p-2 inline-block max-w-full overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  return (
    <div className="bg-white rounded-lg p-3 text-center">
      <div className="font-mono text-sm text-black tracking-wide">{value}</div>
      <div className="text-[0.6rem] text-gray-500 mt-1">
        {type} renders on the printed label
      </div>
    </div>
  );
}

function BarcodesTab({ product }: { product: Product }) {
  const productId = product.product_id;
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [copies, setCopies] = useState(1);
  const [val, setVal] = useState("");
  const [type, setType] = useState("EAN13");

  const { data: codes, isLoading } = useQuery({
    queryKey: ["catalogue", "product", productId, "barcodes"],
    queryFn: () => listBarcodes(productId),
  });
  const add = useMutation({
    mutationFn: () =>
      addBarcode(productId, { barcode_value: val, barcode_type: type }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["catalogue", "product", productId, "barcodes"],
      });
      showToast.success("Barcode added");
      setAdding(false);
      setVal("");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: (barcodeId: string) => deleteBarcode(barcodeId),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["catalogue", "product", productId, "barcodes"],
      }),
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  const priceLine =
    product.selling_price != null
      ? fmtMoney(product.selling_price, product.currency)
      : undefined;

  async function handlePrint(
    barcodeId: string,
    value: string,
    symbology: string,
  ) {
    setPrintingId(barcodeId);
    try {
      const outcome = await printBarcodeLabels([
        {
          value,
          name: product.name,
          sku: product.sku,
          priceLine,
          symbology,
          copies,
        },
      ]);
      if (outcome.method === "thermal")
        showToast.success(
          `Sent ${copies} label${copies > 1 ? "s" : ""} to the printer`,
        );
      else if (outcome.note)
        showToast.info("Opened print dialog", outcome.note);
    } catch (e) {
      showToast.error("Could not print", errMsg(e));
    } finally {
      setPrintingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1.5 mr-auto">
          <NumberField
            surface="dark"
            label="Copies"
            placeholder="1"
            className="w-16 py-1.5 px-2"
            value={copies}
            onValueChange={(v) =>
              setCopies(v === undefined ? 1 : Math.max(1, Math.min(99, v)))
            }
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Settings className="w-3.5 h-3.5" />}
          onClick={() => setShowSettings(true)}
        >
          Print settings
        </Button>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setAdding(true)}
        >
          Add barcode
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-28" />
      ) : !codes || codes.length === 0 ? (
        <EmptyState
          icon={<Hash className="w-6 h-6" />}
          title="No barcodes"
          description="A CODE128 barcode is auto-generated with each new product. Re-open this product if it was just created."
        />
      ) : (
        <div className="space-y-2">
          {codes.map((c) => (
            <Card
              key={c.barcode_id}
              className="p-3 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <BarcodePreview value={c.barcode_value} type={c.barcode_type} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-brand-cream truncate">
                    {c.barcode_value}
                  </span>
                  {c.is_primary && (
                    <Badge tone="gold" size="xs">
                      Primary
                    </Badge>
                  )}
                  <Badge tone="neutral" size="xs">
                    {c.barcode_type}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Printer className="w-3.5 h-3.5" />}
                  loading={printingId === c.barcode_id}
                  onClick={() =>
                    handlePrint(c.barcode_id, c.barcode_value, c.barcode_type)
                  }
                >
                  Print
                </Button>
                {!c.is_primary && (
                  <button
                    onClick={() => remove.mutate(c.barcode_id)}
                    className="p-2 text-brand-smoke hover:text-state-danger"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        surface="light"
        size="sm"
        title="Add barcode"
        footer={
          <>
            <Button variant="outline-light" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!val}
              loading={add.isPending}
              onClick={() => add.mutate()}
            >
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            label="Barcode value"
            placeholder="9781234567897"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full bg-white border border-brand-cloud/40 rounded-xl py-3 px-4 text-sm"
          >
            <option value="EAN13">EAN-13</option>
            <option value="UPC">UPC</option>
            <option value="CODE128">CODE128</option>
            <option value="QR">QR</option>
          </select>
        </div>
      </Modal>

      <BarcodePrintSettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}

function BarcodePrintSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [s, setS] = useState<BarcodePrintSettings>(getPrintSettings());
  const [testing, setTesting] = useState(false);

  function save() {
    savePrintSettings(s);
    showToast.success("Print settings saved");
    onClose();
  }

  async function testConnection() {
    setTesting(true);
    try {
      const ok = await isQzAvailable();
      if (ok)
        showToast.success("QZ Tray connected", "Silent printing is ready.");
      else
        showToast.warn(
          "QZ Tray not detected",
          "Install/run QZ Tray, or leave silent print off to use the browser dialog.",
        );
    } finally {
      setTesting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      surface="light"
      size="md"
      title="Barcode print settings"
      description="Defaults to your browser print dialog. Turn on silent printing to send labels straight to a thermal printer via QZ Tray."
      footer={
        <>
          <Button variant="outline-light" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={s.silentPrint}
            onChange={(e) => setS({ ...s, silentPrint: e.target.checked })}
            className="mt-1 w-4 h-4 accent-brand-accent"
          />
          <span>
            <span className="block text-sm font-medium text-brand-charcoal">
              Silent thermal printing (QZ Tray)
            </span>
            <span className="block text-xs text-brand-smoke">
              Sends raw ZPL to the Honeywell with no dialog. Requires the free
              QZ Tray app on this workstation. Falls back to the browser dialog
              if unavailable.
            </span>
          </span>
        </label>

        {s.silentPrint && (
          <div className="grid gap-3 sm:grid-cols-2 bg-gray-50 rounded-lg p-4">
            <Input
              value={s.printerName}
              onChange={(e) => setS({ ...s, printerName: e.target.value })}
              label="Printer name"
              placeholder="Default printer"
              hint="Exact OS name, or blank for default"
              className="sm:col-span-2"
            />
            <div>
              <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                Resolution
              </label>
              <select
                value={s.dpi}
                onChange={(e) =>
                  setS({ ...s, dpi: Number(e.target.value) as 203 | 300 })
                }
                className="w-full bg-white border border-brand-cloud/40 rounded-xl py-2.5 px-3 text-sm"
              >
                <option value={203}>203 dpi</option>
                <option value={300}>300 dpi</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                value={s.widthMm}
                onChange={(e) =>
                  setS({ ...s, widthMm: Number(e.target.value) || 50 })
                }
                label="Label W (mm)"
              />
              <Input
                type="number"
                value={s.heightMm}
                onChange={(e) =>
                  setS({ ...s, heightMm: Number(e.target.value) || 25 })
                }
                label="Label H (mm)"
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                variant="secondary"
                size="sm"
                loading={testing}
                onClick={testConnection}
              >
                Test QZ Tray connection
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── STOCK TAB ───────────────────────────────────────────────
function StockTab({ product }: { product: Product }) {
  const productId = product.product_id;
  const {
    data: stock,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["catalogue", "product", productId, "on-hand"],
    queryFn: () => getOnHand(productId),
  });

  if (isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-32" />
      </div>
    );

  if (isError) {
    return (
      <EmptyState
        icon={<BookOpen className="w-6 h-6" />}
        title="Couldn’t load stock"
        description="Stock levels are computed from the Stock module. You may not have permission to view stock, or the service is unavailable."
      />
    );
  }

  const onHand = stock?.on_hand ?? 0;
  const reserved = stock?.reserved ?? 0;
  const available = stock?.available ?? onHand - reserved;
  const reorder = product.reorder_level ?? 0;
  const low = reorder > 0 && onHand <= reorder;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StockStat
          icon={<Package className="w-4 h-4" />}
          label="On hand"
          value={onHand}
          tone={onHand <= 0 ? "danger" : low ? "warn" : "ok"}
        />
        <StockStat
          icon={<ShoppingCart className="w-4 h-4" />}
          label="Reserved"
          value={reserved}
          tone="neutral"
        />
        <StockStat
          icon={<Check className="w-4 h-4" />}
          label="Available to sell"
          value={available}
          tone={available <= 0 ? "danger" : "ok"}
        />
      </div>

      {low && (
        <div className="rounded-xl border border-state-warn/40 bg-state-warn/10 p-3 text-xs text-state-warn flex items-center gap-2">
          <RotateCw className="w-3.5 h-3.5" />
          On-hand ({onHand}) is at or below the reorder level ({reorder}).
          Suggested reorder quantity: {product.reorder_quantity || "—"}.
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-brand-cream flex items-center gap-2">
            <MapPin className="w-4 h-4 text-brand-accent" /> By location
          </h3>
          <Link
            to="/stock"
            className="text-xs text-brand-smoke hover:text-brand-accent"
          >
            Open Stock module →
          </Link>
        </div>
        {stock?.by_location && stock.by_location.length > 0 ? (
          <div className="space-y-1.5">
            {stock.by_location.map((l) => (
              <div
                key={l.location_id}
                className="flex items-center justify-between text-sm border-b border-brand-graphite/40 last:border-0 py-1.5"
              >
                <span className="text-brand-cloud">
                  {l.location_name}{" "}
                  <span className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
                    {l.location_type?.replace(/_/g, " ")}
                  </span>
                </span>
                <span className="text-brand-cream font-medium">
                  {l.on_hand}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-brand-smoke">
            No stock movements yet. Receive stock via a Purchase Order or a
            stock adjustment in the Stock module — on-hand updates here
            automatically.
          </p>
        )}
      </Card>

      <div className="rounded-2xl border border-brand-graphite bg-brand-charcoal/40 p-4 flex items-start gap-3">
        <BookOpen className="w-4 h-4 text-brand-smoke mt-0.5 shrink-0" />
        <div className="text-xs text-brand-cloud">
          On-hand is the live sum of every stock movement (receipts, transfers,
          sales, adjustments). To receive stock, create a Purchase Order and
          mark it received, or post a stock adjustment — both feed this number
          instantly.
        </div>
      </div>
    </div>
  );
}

function StockStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "ok" | "warn" | "danger" | "neutral";
}) {
  const tones = {
    ok: "text-emerald-400",
    warn: "text-state-warn",
    danger: "text-state-danger",
    neutral: "text-brand-cloud",
  }[tone];
  return (
    <div className="p-4 rounded-xl border border-brand-graphite bg-brand-charcoal/60">
      <div className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-widest text-brand-smoke">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-semibold mt-1 ${tones}`}>{value}</div>
    </div>
  );
}

// ─── ACCOUNTING PLACEHOLDER ─────────────────────────────────
function AccountingPlaceholderTab({ product }: { product: Product }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-display text-xl text-brand-cream mb-1">
          GL Account mapping
        </h3>
        <p className="text-sm text-brand-cloud mb-4">
          When this product is bought, stocked, or sold, postings go to:
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Map
            label="Inventory asset"
            value={
              product.inventory_account_id ??
              `Default from ${product.category_name ?? "category"}`
            }
          />
          <Map
            label="Cost of goods sold"
            value={
              product.cogs_account_id ??
              `Default from ${product.category_name ?? "category"}`
            }
          />
          <Map
            label="Sales revenue"
            value={
              product.income_account_id ??
              `Default from ${product.category_name ?? "category"}`
            }
          />
        </div>
      </Card>
      <div className="rounded-2xl border border-brand-graphite bg-brand-charcoal/40 p-4 flex items-start gap-3">
        <BookOpen className="w-4 h-4 text-brand-smoke mt-0.5 shrink-0" />
        <div className="text-xs text-brand-cloud">
          Per-product GL account overrides are not yet configurable. The
          category defaults apply. Contact your administrator to update account
          mappings.
        </div>
      </div>
    </div>
  );
}

function Map({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl border border-brand-graphite bg-brand-charcoal/60">
      <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
        {label}
      </div>
      <div className="text-xs text-brand-cream mt-1 truncate font-mono">
        {value}
      </div>
    </div>
  );
}
