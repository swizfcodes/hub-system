/**
 * CommandPalette — ⌘K global search
 *
 * Opens via:
 *   - Clicking the search bar in the Topbar
 *   - Pressing ⌘K (Mac) or Ctrl+K (Windows/Linux) anywhere in the app
 *
 * Searches in parallel across:
 *   - Contacts  (GET /api/contacts?search=q&limit=6)
 *   - Products   (GET /api/catalogue/products?search=q&limit=6)
 *
 * Keyboard navigation:
 *   - ArrowUp / ArrowDown  — move between results
 *   - Enter                — navigate to highlighted result
 *   - Escape               — close
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, User, Package, X, ArrowRight, Loader2 } from "lucide-react";
import { api } from "@services/api";
import { cn } from "@lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  label: string;
  sublabel?: string;
  category: "contact" | "product";
  href: string;
}

// ── Search helpers ────────────────────────────────────────────────────────────

async function searchContacts(q: string): Promise<SearchResult[]> {
  try {
    const { data } = await api.get<{
      data: Array<{
        contact_id: string;
        display_name: string;
        primary_phone?: string;
        company_name?: string;
      }>;
    }>("/contacts", { params: { search: q, limit: 6 } });
    return (data.data ?? []).map((c) => ({
      id: c.contact_id,
      label: c.display_name,
      sublabel: c.company_name || c.primary_phone || "",
      category: "contact" as const,
      href: `/contacts/${c.contact_id}`,
    }));
  } catch {
    return [];
  }
}

async function searchProducts(q: string): Promise<SearchResult[]> {
  try {
    const { data } = await api.get<{
      data: Array<{
        product_id: string;
        name: string;
        sku?: string;
        selling_price?: number;
      }>;
    }>("/catalogue/products", { params: { search: q, limit: 6 } });
    return (data.data ?? []).map((p) => ({
      id: p.product_id,
      label: p.name,
      sublabel: p.sku ? `SKU: ${p.sku}` : "",
      category: "product" as const,
      href: `/catalogue/${p.product_id}`,
    }));
  } catch {
    return [];
  }
}

// ── Category label + icon ─────────────────────────────────────────────────────

const CATEGORY_META = {
  contact: { label: "Contacts", Icon: User },
  product: { label: "Products", Icon: Package },
} as const;

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Global ⌘K / Ctrl+K shortcut ──────────────────────────────────────────
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
        else {
          /* parent opens it */
        }
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [open, onClose]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // ── Debounced search ──────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [contacts, products] = await Promise.all([
        searchContacts(trimmed),
        searchProducts(trimmed),
      ]);
      setResults([...contacts, ...products]);
      setActiveIdx(0);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 250);
  }

  // ── Keyboard navigation ───────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && results[activeIdx]) {
      navigate(results[activeIdx].href);
      onClose();
    }
  }

  function handleSelect(result: SearchResult) {
    navigate(result.href);
    onClose();
  }

  // Group results by category
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Panel */}
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-brand-black shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
          {loading ? (
            <Loader2 className="h-4 w-4 text-brand-smoke shrink-0 animate-spin" />
          ) : (
            <Search className="h-4 w-4 text-brand-smoke shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search contacts, products…"
            className="flex-1 bg-transparent text-sm text-brand-cream placeholder-brand-smoke/40 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setResults([]);
              }}
              className="text-brand-smoke hover:text-brand-cream transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="text-[10px] px-1.5 py-0.5 bg-brand-graphite border border-white/10 rounded text-brand-smoke font-mono hidden sm:block">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[55vh] overflow-y-auto">
          {query.trim().length === 0 ? (
            /* Empty state — shortcuts hint */
            <div className="px-4 py-8 text-center space-y-4">
              <Search className="h-8 w-8 text-brand-smoke/20 mx-auto" />
              <p className="text-sm text-brand-smoke/50">
                Type to search across contacts and products
              </p>
              <div className="flex items-center justify-center gap-4 text-xs text-brand-smoke/30">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-brand-graphite rounded border border-white/10 font-mono">
                    ↑↓
                  </kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-brand-graphite rounded border border-white/10 font-mono">
                    ↵
                  </kbd>
                  select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-brand-graphite rounded border border-white/10 font-mono">
                    Esc
                  </kbd>
                  close
                </span>
              </div>
            </div>
          ) : query.trim().length < 2 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-brand-smoke/40">
                Keep typing to search…
              </p>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-brand-smoke/50">
                No results for{" "}
                <span className="text-brand-cream">"{query}"</span>
              </p>
            </div>
          ) : (
            /* Grouped results */
            Object.entries(grouped).map(([category, items]) => {
              const { label, Icon } =
                CATEGORY_META[category as keyof typeof CATEGORY_META];
              return (
                <div key={category}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-brand-charcoal/40">
                    <Icon className="h-3.5 w-3.5 text-brand-smoke/50" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-smoke/50">
                      {label}
                    </span>
                    <span className="ml-auto text-[10px] text-brand-smoke/30">
                      {items.length}
                    </span>
                  </div>

                  {/* Items */}
                  {items.map((result) => {
                    const globalIdx = results.indexOf(result);
                    const isActive = globalIdx === activeIdx;
                    return (
                      <button
                        key={result.id}
                        onMouseEnter={() => setActiveIdx(globalIdx)}
                        onClick={() => handleSelect(result)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                          isActive
                            ? "bg-brand-accent/10 text-brand-cream"
                            : "hover:bg-brand-graphite/30 text-brand-smoke",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                            isActive ? "bg-brand-accent/20" : "bg-brand-graphite",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-3.5 w-3.5",
                              isActive ? "text-brand-accent" : "text-brand-smoke",
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-sm truncate",
                              isActive
                                ? "text-brand-cream font-medium"
                                : "text-brand-smoke",
                            )}
                          >
                            {result.label}
                          </p>
                          {result.sublabel && (
                            <p className="text-[11px] text-brand-smoke/40 truncate">
                              {result.sublabel}
                            </p>
                          )}
                        </div>
                        {isActive && (
                          <ArrowRight className="h-3.5 w-3.5 text-brand-accent shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="border-t border-white/5 px-4 py-2 flex items-center justify-between">
            <p className="text-[10px] text-brand-smoke/35">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </p>
            <p className="text-[10px] text-brand-smoke/35 hidden sm:block">
              Use arrow keys to navigate
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
