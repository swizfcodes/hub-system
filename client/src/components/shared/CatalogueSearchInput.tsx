/**
 * CatalogueSearchInput — reusable product picker used across all forms.
 *
 * Behaviour:
 *   - Shows up to 8 products immediately on focus (browse mode, no min chars).
 *   - Filters live as you type.
 *   - Portals the dropdown to document.body via position:fixed, so it never
 *     gets clipped by a parent Modal's overflow-y-auto container.
 *   - Supports dark (default) and light surface themes.
 *
 * Usage:
 *   <CatalogueSearchInput
 *     currency="NGN"
 *     onSelect={(p) => form.setValue('product_id', p.product_id)}
 *   />
 */
import { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Plus } from "lucide-react";
import { api } from "@services/api";
import { fmtMoney } from "@lib/format";
import { cn } from "@lib/cn";

export interface CatalogueProduct {
  product_id: string;
  name: string;
  sku?: string;
  selling_price: number;
}

interface CatalogueSearchInputProps {
  currency: string;
  onSelect: (p: CatalogueProduct) => void;
  label?: string;
  placeholder?: string;
  /** 'dark' = charcoal/gold (POS, PO forms). 'light' = white/black (invoice, consignment modals). */
  surface?: "dark" | "light";
  /** Unique key per instance — prevents cross-instance query cache collisions. */
  instanceKey?: string | number;
  className?: string;
  /** Focus the input on mount — used to jump to a freshly added line. */
  autoFocus?: boolean;
  /** Show an "Add new product" row so a missing product can be created inline. */
  allowQuickAdd?: boolean;
  /** Called with the current search text when the quick-add row is clicked. */
  onQuickAdd?: (query: string) => void;
}

export function CatalogueSearchInput({
  currency,
  onSelect,
  label,
  placeholder = "Click to browse or type to filter…",
  surface = "dark",
  instanceKey = 0,
  className = "",
  autoFocus = false,
  allowQuickAdd = false,
  onQuickAdd,
}: CatalogueSearchInputProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);

  // Fetch on open — empty query = browse all (limit 8), typed query = filter.
  const { data: results = [], isFetching } = useQuery({
    queryKey: ["catalogue-search", instanceKey, query],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: 8 };
      if (query.trim()) params.search = query.trim();
      const { data } = await api.get("/catalogue/products", { params });
      return (data.data ?? []) as CatalogueProduct[];
    },
    enabled: isOpen,
    staleTime: 30_000,
  });

  // Recompute dropdown anchor on scroll/resize so it tracks the input.
  useEffect(() => {
    if (!isOpen) return;
    function updateRect() {
      if (wrapRef.current) setDropRect(wrapRef.current.getBoundingClientRect());
    }
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [isOpen]);

  // Close on outside click.
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setIsOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSelect(p: CatalogueProduct) {
    onSelect(p);
    setQuery("");
    setIsOpen(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setIsOpen(true);
    if (wrapRef.current) setDropRect(wrapRef.current.getBoundingClientRect());
  }

  function handleFocus() {
    setIsOpen(true);
    if (wrapRef.current) setDropRect(wrapRef.current.getBoundingClientRect());
  }

  const isDark = surface === "dark";

  // ── Theme tokens ────────────────────────────────────────────────────────────
  const inputCls = isDark
    ? "w-full rounded-lg border border-white/10 bg-brand-graphite py-2 pl-8 pr-3 text-sm text-brand-cream placeholder-brand-smoke/50 focus:border-brand-accent/50 focus:outline-none"
    : "w-full rounded-xl border border-brand-cloud/40 bg-white py-3 pl-10 pr-4 text-sm text-brand-black shadow-sm focus:border-brand-black focus:outline-none focus:ring-1 focus:ring-brand-black";

  const iconCls = isDark
    ? "absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-smoke pointer-events-none"
    : "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-smoke pointer-events-none";

  const dropCls = isDark
    ? "rounded-lg border border-white/10 bg-brand-charcoal shadow-xl max-h-56 overflow-y-auto"
    : "rounded-xl border border-brand-cloud/30 bg-white shadow-lg max-h-56 overflow-y-auto";

  const rowCls = isDark
    ? "flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-brand-graphite/40 transition-colors"
    : "flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-brand-cloud/20 transition-colors";

  const nameCls = isDark
    ? "text-xs font-medium text-brand-cream"
    : "text-sm font-medium text-brand-black";
  const skuCls = isDark
    ? "text-[10px] text-brand-smoke"
    : "text-xs text-text-on-light-muted";
  const priceCls = isDark
    ? "text-xs font-semibold text-brand-accent tabular-nums ml-3 shrink-0"
    : "text-sm font-semibold text-brand-black tabular-nums ml-4 shrink-0";
  const msgCls = isDark
    ? "px-3 py-3 text-xs text-brand-smoke"
    : "px-3 py-3 text-sm text-text-on-light-muted";

  const labelCls = isDark
    ? "mb-1 block text-xs text-brand-smoke"
    : "mb-1 block text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted";

  // ── Portaled dropdown ───────────────────────────────────────────────────────
  const dropdown =
    isOpen && dropRect
      ? ReactDOM.createPortal(
          <div
            style={{
              position: "fixed",
              top: dropRect.bottom + 4,
              left: dropRect.left,
              width: dropRect.width,
              zIndex: 9999,
            }}
            className={dropCls}
          >
            {isFetching && results.length === 0 ? (
              <p className={msgCls}>Loading…</p>
            ) : results.length > 0 ? (
              results.map((p) => (
                <button
                  key={p.product_id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(p);
                  }}
                  className={rowCls}
                >
                  <div className="min-w-0">
                    <p className={nameCls}>{p.name}</p>
                    {p.sku && <p className={skuCls}>{p.sku}</p>}
                  </div>
                  <span className={priceCls}>
                    {fmtMoney(p.selling_price, currency)}
                  </span>
                </button>
              ))
            ) : (
              !allowQuickAdd && (
                <p className={msgCls}>
                  {query
                    ? `No products found for "${query}"`
                    : "No active products found"}
                </p>
              )
            )}
            {allowQuickAdd && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onQuickAdd?.(query.trim());
                  setIsOpen(false);
                }}
                className={`${rowCls} border-t ${isDark ? "border-white/10 text-brand-accent" : "border-brand-cloud/30 text-brand-black"}`}
              >
                <span className="flex items-center gap-2 text-xs font-medium">
                  <Plus className="h-3.5 w-3.5" />
                  {query ? `Add new product "${query}"` : "Add a new product"}
                </span>
              </button>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {label && <label className={labelCls}>{label}</label>}
      <div className="relative">
        <Search className={iconCls} />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          className={inputCls}
          autoFocus={autoFocus}
        />
      </div>
      {dropdown}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProductSelectField
//
// Wraps CatalogueSearchInput for react-hook-form Controller usage.
// Shows a removable chip once a product is selected; search input otherwise.
// Handles pre-filled product_id by fetching the product name automatically.
// ─────────────────────────────────────────────────────────────────────────────

interface ProductSelectFieldProps {
  value: string; // current product_id from form
  onChange: (id: string) => void;
  currency: string;
  label?: string;
  instanceKey?: string | number;
  surface?: "dark" | "light";
  error?: string;
}

export function ProductSelectField({
  value,
  onChange,
  currency,
  label,
  instanceKey = 0,
  surface = "dark",
  error,
}: ProductSelectFieldProps) {
  const [selectedName, setSelectedName] = useState("");
  const isDark = surface === "dark";

  // When a product_id is pre-filled (e.g. from props), fetch its name once.
  const { data: preloaded } = useQuery({
    queryKey: ["catalogue-product-name", value],
    queryFn: async () => {
      const { data } = await api.get<CatalogueProduct>(
        `/catalogue/products/${value}`,
      );
      return data;
    },
    enabled: !!value && !selectedName,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (preloaded && !selectedName) setSelectedName(preloaded.name);
  }, [preloaded, selectedName]);

  function clear() {
    onChange("");
    setSelectedName("");
  }

  const labelCls = isDark
    ? "mb-1 block text-xs text-brand-smoke"
    : "mb-1 block text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted";

  if (value) {
    // Selected state — show chip
    const chipCls = isDark
      ? "flex items-center gap-2 rounded-lg border border-brand-accent/40 bg-brand-accent/10 px-3 py-2"
      : "flex items-center gap-2 rounded-xl border border-brand-black/20 bg-brand-cloud/20 px-3 py-2.5";
    const nameCls2 = isDark
      ? "text-xs font-medium text-brand-cream flex-1 truncate"
      : "text-sm font-medium text-brand-black flex-1 truncate";

    return (
      <div>
        {label && <label className={labelCls}>{label}</label>}
        <div className={chipCls}>
          <span className={nameCls2}>{selectedName || "Product selected"}</span>
          <button
            type="button"
            onClick={clear}
            className={cn(
              "transition-colors",
              isDark
                ? "text-brand-smoke hover:text-red-400"
                : "text-text-on-light-muted hover:text-state-danger",
            )}
            aria-label="Remove product"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-state-danger">{error}</p>}
      </div>
    );
  }

  return (
    <>
      <CatalogueSearchInput
        surface={surface}
        currency={currency}
        label={label}
        instanceKey={instanceKey}
        onSelect={(p) => {
          onChange(p.product_id);
          setSelectedName(p.name);
        }}
      />
      {error && <p className="mt-1 text-xs text-state-danger">{error}</p>}
    </>
  );
}
