import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Package,
  Search,
  LayoutGrid,
  Rows3,
  Tag,
  MapPin,
  Download,
  Upload,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { Tabs } from "@components/ui/Tabs";
import { Badge } from "@components/ui/Badge";
import { DropdownMenu } from "@components/ui/DropdownMenu";
import { ProductCard } from "@components/catalogue/shared/ProductCard";
import { ProductImage } from "@components/catalogue/shared/ProductImage";
import { ProductPrice } from "@components/catalogue/shared/ProductPrice";
import { ProductFormModal } from "@components/catalogue/modals/ProductFormModal";
import { CategoryFormModal } from "@components/catalogue/modals/CategoryFormModal";
import { ImportProductsModal } from "@components/catalogue/modals/ImportProductsModal";
import {
  listProducts,
  deleteProduct,
  restoreProduct,
  updateProduct,
} from "@services/catalogue/products";
import { downloadProductTemplate } from "@lib/downloadProductTemplate";
import { listCategories, deleteCategory } from "@services/catalogue/categories";
import { listLocations, createLocation } from "@services/catalogue/locations";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtRelative } from "@lib/format";
import type { ProductCategory, LocationType } from "@typedefs/catalogue";
import { cn } from "@lib/cn";

type View = "cards" | "table";
type ProductStatusFilter = "active" | "inactive" | "all";

const STATUS_FILTERS: { key: ProductStatusFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "all", label: "All" },
];

export default function CatalogueHome() {
  const [tab, setTab] = useState<"products" | "categories" | "locations">(
    "products",
  );
  const [view, setView] = useState<View>(
    () => (localStorage.getItem("orika_catalogue_view") as View) || "cards",
  );
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<ProductStatusFilter>("active");
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<ProductCategory | null>(null);
  const [creatingLocation, setCreatingLocation] = useState(false);

  const setViewPersist = (v: View) => {
    setView(v);
    localStorage.setItem("orika_catalogue_view", v);
  };

  return (
    <>
      <Topbar title="Catalogue" subtitle="Products · Categories · Locations" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
        <PageHeader
          title="Catalogue"
          subtitle="Every product, every category, every place stock can live. The single source of truth that feeds RFQ, PO, Stock, POS, and Invoicing."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Catalogue" }]}
          actions={
            tab === "products" ? (
              <Button
                variant="gold"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setCreatingProduct(true)}
              >
                New product
              </Button>
            ) : tab === "categories" ? (
              <Button
                variant="gold"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setCreatingCategory(true)}
              >
                New category
              </Button>
            ) : tab === "locations" ? (
              <Button
                variant="gold"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setCreatingLocation(true)}
              >
                New location
              </Button>
            ) : null
          }
        />

        <Tabs
          tabs={[
            { key: "products", label: "Products" },
            { key: "categories", label: "Categories" },
            { key: "locations", label: "Locations" },
          ]}
          active={tab}
          onChange={(k) => setTab(k as typeof tab)}
          className="mb-6"
        />

        {tab === "products" && (
          <ProductsTab
            view={view}
            onViewChange={setViewPersist}
            search={search}
            onSearchChange={setSearch}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onNewProduct={() => setCreatingProduct(true)}
          />
        )}

        {tab === "categories" && (
          <CategoriesTab
            onNew={() => setCreatingCategory(true)}
            onEdit={setEditingCategory}
          />
        )}
        {tab === "locations" && (
          <LocationsTab
            creating={creatingLocation}
            onOpen={() => setCreatingLocation(true)}
            onClose={() => setCreatingLocation(false)}
          />
        )}
      </div>

      <ProductFormModal
        open={creatingProduct}
        onClose={() => setCreatingProduct(false)}
      />
      <CategoryFormModal
        open={creatingCategory || !!editingCategory}
        onClose={() => {
          setCreatingCategory(false);
          setEditingCategory(null);
        }}
        editing={editingCategory}
      />
    </>
  );
}

// ─── PRODUCTS TAB ─────────────────────────────────────────────
function ProductsTab({
  view,
  onViewChange,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  statusFilter,
  onStatusFilterChange,
  onNewProduct,
}: {
  view: View;
  onViewChange: (v: View) => void;
  search: string;
  onSearchChange: (s: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (s: string) => void;
  statusFilter: ProductStatusFilter;
  onStatusFilterChange: (v: ProductStatusFilter) => void;
  onNewProduct: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [importing, setImporting] = useState(false);

  const { active: business } = useActiveBusiness();
  const { data: catsResp } = useQuery({
    queryKey: ["catalogue", "categories", business],
    queryFn: () => listCategories(false),
  });
  const cats = catsResp ?? [];

  const { data, isLoading } = useQuery({
    queryKey: [
      "catalogue",
      "products",
      business,
      { search, categoryFilter, statusFilter },
    ],
    queryFn: () =>
      listProducts({
        search: search || undefined,
        category_id: categoryFilter || undefined,
        // 'active' → backend returns active only; 'all'/'inactive' need every row,
        // then we narrow to inactive client-side (backend has no inactive-only mode).
        include_inactive: statusFilter !== "active",
        limit: 200,
      }),
  });

  const products = useMemo(() => {
    let list = data?.data ?? [];
    if (statusFilter === "inactive") list = list.filter((p) => !p.is_active);
    const byId: Record<string, string> = {};
    for (const c of cats) byId[c.category_id] = c.name;
    return list.map((p) => ({
      ...p,
      category_name: p.category_id ? byId[p.category_id] : undefined,
    }));
  }, [data, cats, statusFilter]);

  const archive = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogue", "products", business] });
      showToast.success("Product archived");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });
  const restore = useMutation({
    mutationFn: (id: string) => restoreProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogue", "products", business] });
      showToast.success("Product restored");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });
  const activate = useMutation({
    mutationFn: (id: string) => updateProduct(id, { is_active: true } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogue", "products", business] });
      showToast.success("Product activated — now visible in POS and Stock");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => updateProduct(id, { is_active: false } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogue", "products", business] });
      showToast.success("Product deactivated");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  return (
    <>
      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <Input
          surface="dark"
          placeholder="Search by name, SKU, description…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          leftIcon={<Search className="w-4 h-4" />}
        />
        <Select
          surface="dark"
          value={categoryFilter}
          onChange={(e) => onCategoryFilterChange(e.target.value)}
          options={[
            { value: "", label: "All categories" },
            ...cats.map((c) => ({ value: c.category_id, label: c.name })),
          ]}
        />
        <div className="inline-flex rounded-xl border border-brand-graphite overflow-hidden">
          <button
            onClick={() => downloadProductTemplate().catch(() => {})}
            title="Download the Excel import template"
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-all bg-brand-charcoal text-brand-smoke hover:text-brand-cream border-r border-brand-graphite"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Template</span>
          </button>
          <button
            onClick={() => setImporting(true)}
            title="Import products from a filled Excel template"
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-all bg-brand-charcoal text-brand-smoke hover:text-brand-cream"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import</span>
          </button>
        </div>
        <div className="inline-flex p-0.5 rounded-xl bg-brand-charcoal border border-brand-graphite">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.key}
              onClick={() => onStatusFilterChange(s.key)}
              className={cn(
                "inline-flex items-center px-3 py-1.5 rounded-lg text-[0.65rem] font-semibold uppercase tracking-wide transition-all",
                statusFilter === s.key
                  ? "bg-brand-graphite text-brand-cream"
                  : "text-brand-smoke hover:text-brand-cream",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="inline-flex p-0.5 rounded-xl bg-brand-charcoal border border-brand-graphite">
          {(["cards", "table"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.65rem] font-semibold uppercase tracking-wide transition-all",
                view === v
                  ? "bg-brand-graphite text-brand-cream"
                  : "text-brand-smoke hover:text-brand-cream",
              )}
            >
              {v === "cards" ? (
                <LayoutGrid className="w-3.5 h-3.5" />
              ) : (
                <Rows3 className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{v}</span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={<Package className="w-7 h-7" />}
          title={search ? "No matches" : "Your catalogue is empty"}
          description={
            search
              ? "Adjust your filters."
              : "Add your first product — it can be a physical jewellery piece, a fragrance, or a service."
          }
          action={
            !search && (
              <Button
                variant="gold"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={onNewProduct}
              >
                New product
              </Button>
            )
          }
        />
      ) : view === "cards" ? (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 stagger">
          {products.map((p, i) => (
            <ProductCard key={p.product_id} product={p} index={i} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-brand-graphite bg-brand-charcoal/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-charcoal border-b border-brand-graphite">
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th>Category</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Selling</Th>
                <Th className="text-right">Reorder</Th>
                <Th>Updated</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr
                  key={p.product_id}
                  onClick={() => navigate(`/catalogue/${p.product_id}`)}
                  className="border-b border-brand-graphite/40 hover:bg-brand-charcoal cursor-pointer"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <ProductImage product={p} size="sm" />
                      <div className="min-w-0">
                        <div className="text-brand-cream truncate flex items-center gap-1.5">
                          {p.name}
                          {!p.is_active && (
                            <Badge tone="warn" size="xs">
                              Inactive
                            </Badge>
                          )}
                          {p.is_deleted && (
                            <Badge tone="danger" size="xs">
                              Archived
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-brand-smoke text-xs">
                    {p.sku}
                  </td>
                  <td className="px-4 py-2.5 text-brand-cloud text-xs">
                    {p.category_name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    <ProductPrice
                      cost={null}
                      selling={p.cost_price}
                      currency={p.currency}
                      hideCost
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    <ProductPrice
                      cost={null}
                      selling={p.selling_price}
                      currency={p.currency}
                      hideCost
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-brand-cloud">
                    {p.reorder_level}
                  </td>
                  <td className="px-4 py-2.5 text-[0.65rem] text-brand-smoke">
                    {fmtRelative(p.updated_at)}
                  </td>
                  <td
                    className="px-2 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu
                      items={[
                        {
                          label: "Open",
                          onClick: () => navigate(`/catalogue/${p.product_id}`),
                        },
                        ...(!p.is_deleted && !p.is_active
                          ? [
                              {
                                label: "Activate",
                                onClick: () => activate.mutate(p.product_id),
                              },
                            ]
                          : []),
                        ...(!p.is_deleted && p.is_active
                          ? [
                              {
                                label: "Deactivate",
                                onClick: () => deactivate.mutate(p.product_id),
                              },
                            ]
                          : []),
                        ...(p.is_deleted
                          ? [
                              {
                                label: "Restore",
                                onClick: () => restore.mutate(p.product_id),
                              },
                            ]
                          : [
                              {
                                label: "Archive",
                                destructive: true,
                                onClick: () => archive.mutate(p.product_id),
                              },
                            ]),
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ImportProductsModal
        open={importing}
        onClose={() => setImporting(false)}
      />
    </>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-left text-[0.6rem] tracking-widest uppercase text-brand-smoke font-semibold",
        className,
      )}
    >
      {children}
    </th>
  );
}

// ─── CATEGORIES TAB ───────────────────────────────────────────
function CategoriesTab({
  onNew,
  onEdit,
}: {
  onNew: () => void;
  onEdit: (c: ProductCategory) => void;
}) {
  const qc = useQueryClient();
  const { active: business } = useActiveBusiness();
  const { data: cats, isLoading } = useQuery({
    queryKey: ["catalogue", "categories", "all", business],
    queryFn: () => listCategories(true),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogue", "categories"] });
      showToast.success("Category deleted");
    },
    onError: (e) => showToast.error("Could not delete", errMsg(e)),
  });

  if (isLoading)
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );

  if (!cats || cats.length === 0) {
    return (
      <EmptyState
        icon={<Tag className="w-6 h-6" />}
        title="No categories"
        description="Group products under categories like Rings, Necklaces, Reed Diffusers."
        action={
          <Button
            variant="gold"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={onNew}
          >
            New category
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      {cats.map((c) => (
        <div
          key={c.category_id}
          className="rounded-xl border border-brand-graphite bg-brand-charcoal/60 p-4 flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-lg bg-brand-accent/15 text-brand-accent flex items-center justify-center">
            <Tag className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-brand-cream">
                {c.name}
              </span>
              {!c.is_active && (
                <Badge tone="warn" size="xs">
                  Inactive
                </Badge>
              )}
            </div>
            {c.description && (
              <p className="text-xs text-brand-smoke truncate">
                {c.description}
              </p>
            )}
          </div>
          <DropdownMenu
            items={[
              { label: "Edit", onClick: () => onEdit(c) },
              {
                label: "Delete",
                destructive: true,
                onClick: () => remove.mutate(c.category_id),
              },
            ]}
          />
        </div>
      ))}
    </div>
  );
}

// ─── LOCATIONS TAB ────────────────────────────────────────────
const LOCATION_TYPES = [
  { value: "warehouse", label: "Warehouse" },
  { value: "showroom", label: "Showroom" },
  { value: "pos_terminal", label: "POS Terminal" },
  { value: "retail_partner", label: "Retail Partner" },
  { value: "transit", label: "Transit" },
] as const;

function LocationsTab({
  creating,
  onOpen,
  onClose,
}: {
  creating: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { active: business } = useActiveBusiness();
  const { data: locs, isLoading } = useQuery({
    queryKey: ["catalogue", "locations", business],
    queryFn: () => listLocations(true),
  });

  const [name, setName] = useState("");
  const [locationType, setLocationType] = useState<LocationType>("warehouse");
  const [address, setAddress] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      createLocation({
        name: name.trim(),
        location_type: locationType as LocationType,
        address: address.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalogue", "locations"] });
      qc.invalidateQueries({ queryKey: ["stock-locations-for-pos"] });
      showToast.success(`Location "${name.trim()}" created`);
      setName("");
      setLocationType("warehouse");
      setAddress("");
      onClose();
    },
    onError: (e) => showToast.error("Could not create location", errMsg(e)),
  });

  if (isLoading)
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );

  return (
    <>
      {(!locs || locs.length === 0) && !creating ? (
        <EmptyState
          icon={<MapPin className="w-6 h-6" />}
          title="No stock locations yet"
          description="Add warehouses, showrooms, POS counters, and transit locations here. Terminals, stock counts, and transfers all need at least one location."
          action={
            <Button
              variant="gold"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={onOpen}
            >
              New location
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(locs ?? []).map((l) => (
            <div
              key={l.location_id}
              className="rounded-xl border border-brand-graphite bg-brand-charcoal/60 p-4"
            >
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-3.5 h-3.5 text-brand-accent" />
                <span className="text-sm font-medium text-brand-cream">
                  {l.name}
                </span>
                {!l.is_active && (
                  <Badge tone="warn" size="xs">
                    Inactive
                  </Badge>
                )}
              </div>
              <div className="text-[0.65rem] text-brand-smoke uppercase tracking-widest">
                {l.location_type.replace(/_/g, " ")}
              </div>
              {l.address && (
                <div className="text-xs text-brand-cloud mt-2">{l.address}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create location modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-brand-black shadow-2xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-brand-cream">
                New Stock Location
              </h2>
              <p className="text-xs text-brand-smoke mt-0.5">
                Warehouses, showrooms, POS counters, and transit points all live
                here.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                  Name <span className="text-red-400">*</span>
                </label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Main Warehouse, Lagos Showroom"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                  Location Type <span className="text-red-400">*</span>
                </label>
                <Select
                  value={locationType}
                  onChange={(e) =>
                    setLocationType(e.target.value as LocationType)
                  }
                  options={LOCATION_TYPES.map((t) => ({
                    value: t.value,
                    label: t.label,
                  }))}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
                  Address{" "}
                  <span className="text-brand-smoke/40">(optional)</span>
                </label>
                <Input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 14 Akin Adesola St, Victoria Island"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button
                variant="ghost"
                onClick={() => {
                  onClose();
                  setName("");
                  setAddress("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="gold"
                onClick={() => createMut.mutate()}
                loading={createMut.isPending}
                disabled={!name.trim()}
              >
                Create Location
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
