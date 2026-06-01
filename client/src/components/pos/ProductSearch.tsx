// ── ProductSearch.tsx ──────────────────────────────────────────────────────────
import { useState, useEffect as useEffectPS } from 'react';
import { Search, Plus, AlertTriangle } from 'lucide-react';
import { usePOSStore } from '@stores/posStore';
import { getCachedProducts, getCachedCategories, getStockQty } from '@lib/posDb';
import { api } from '@services/api';
import { LOW_STOCK_THRESHOLD } from '@lib/constants/posConstants';
import { fmtMoney } from '@lib/format';
import { cn } from '@lib/cn';
import type { POSProduct, POSCategory } from '@typedefs/pos';

interface ProductSearchProps {
  currency?: string;
  /** Increment to force a re-read from IndexedDB (e.g. after seedProductCache completes). */
  cacheVersion?: number;
}

export function ProductSearch({ currency = 'NGN', cacheVersion = 0 }: ProductSearchProps) {
  const { addLine, isOnline } = usePOSStore((s) => ({
    addLine:  s.addLine,
    isOnline: s.isOnline,
  }));

  const [query,       setQuery]       = useState('');
  const [products,    setProducts]    = useState<POSProduct[]>([]);
  const [categories,  setCategories]  = useState<POSCategory[]>([]);
  const [categoryId,  setCategoryId]  = useState<string | null>(null);
  const [stockMap,    setStockMap]    = useState<Map<string, number>>(new Map());

  // Re-reads IndexedDB whenever cacheVersion changes (triggered by POSSession
  // after seedProductCache completes). Also runs on first mount to pick up any
  // products already in the cache from a previous session.
  useEffectPS(() => {
    async function load() {
      const cached = await getCachedProducts();
      if (cached.length) setProducts(cached);

      const cachedCats = await getCachedCategories();
      if (cachedCats.length) setCategories(cachedCats);

      // Populate stock map from cache
      const map = new Map<string, number>();
      for (const p of cached) {
        const qty = await getStockQty(p.product_id);
        map.set(p.product_id, qty);
      }
      setStockMap(map);
    }
    load();
  }, [cacheVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Barcode scan: if query looks like a barcode (all digits / starts with SKU prefix), lookup
  useEffectPS(() => {
    if (!isOnline || !query || query.length < 4) return;
    if (!/^[A-Z0-9\-]{4,}$/.test(query.toUpperCase())) return;

    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(`/catalogue/barcodes/lookup/${encodeURIComponent(query)}`);
        if (data?.product_id) {
          const product = products.find((p) => p.product_id === data.product_id);
          if (product) {
            const qty = stockMap.get(product.product_id) ?? 0;
            addLine({ ...product, available_qty: qty });
            setQuery('');
          }
        }
      } catch { /* not a barcode */ }
    }, 500);
    return () => clearTimeout(t);
  }, [query, isOnline]);

  const filtered = products.filter((p) => {
    if (!p.is_active) return false;
    if (categoryId && p.category_id !== categoryId) return false;
    if (!query) return true;
    return (
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase())
    );
  });

  function handleAdd(product: POSProduct) {
    const qty = stockMap.get(product.product_id) ?? 0;
    if (qty === 0) return;
    addLine({ ...product, available_qty: qty });
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-orika-smoke" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, SKU, or scan barcode..."
          className="w-full rounded-lg border border-white/10 bg-orika-graphite py-2 pl-8 pr-3 text-sm text-orika-cream placeholder-orika-smoke/50 focus:border-orika-gold/50 focus:outline-none"
        />
      </div>

      {/* Category tabs */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setCategoryId(null)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              !categoryId ? 'bg-orika-gold text-orika-black' : 'bg-orika-graphite text-orika-cloud',
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.category_id}
              onClick={() => setCategoryId(cat.category_id)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                categoryId === cat.category_id
                  ? 'bg-orika-gold text-orika-black'
                  : 'bg-orika-graphite text-orika-cloud',
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filtered.map((product) => {
            const qty     = stockMap.get(product.product_id) ?? 0;
            const isOut   = qty === 0;
            const isLow   = qty > 0 && qty <= LOW_STOCK_THRESHOLD;
            return (
              <button
                key={product.product_id}
                onClick={() => handleAdd(product)}
                disabled={isOut}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all',
                  isOut
                    ? 'cursor-not-allowed border-white/5 bg-orika-graphite/20 opacity-50'
                    : 'border-white/5 bg-orika-charcoal hover:border-orika-gold/30 hover:bg-orika-graphite/30',
                )}
              >
                <p className="line-clamp-2 text-xs font-medium text-orika-cream">
                  {product.name}
                </p>
                <p className="text-xs font-semibold text-orika-gold">
                  {fmtMoney(product.selling_price, currency)}
                </p>
                <div className="flex items-center gap-1">
                  {isOut ? (
                    <span className="text-[10px] text-red-400">Out of stock</span>
                  ) : isLow ? (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {qty} left
                    </span>
                  ) : (
                    <span className="text-[10px] text-orika-smoke">{qty} in stock</span>
                  )}
                </div>
                {!isOut && (
                  <Plus className="ml-auto h-3.5 w-3.5 text-orika-smoke" />
                )}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-orika-smoke">
            {query ? `No products found for "${query}"` : 'No products in this category'}
          </p>
        )}
      </div>
    </div>
  );
}
