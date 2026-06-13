/**
 * CommandPalette — ⌘K global search
 *
 * Opens via:
 *   - Clicking the search bar in the Topbar
 *   - Pressing ⌘K (Mac) or Ctrl+K (Windows/Linux) anywhere in the app
 *
 * Searches across three tiers:
 *   1. Pages & actions — jump to any module/page the user can see
 *      (client-side, instant, permission-aware via useVisibleModules).
 *   2. Records — Contacts, Products, Invoices and Sales orders
 *      (parallel API calls; each is permission-gated server-side, so a
 *      403 simply yields no results for that category).
 *   3. Help — guides & FAQs from the Help Center (client-side over the
 *      cached article list), deep-linking into /help.
 *
 * Keyboard navigation:
 *   - ArrowUp / ArrowDown  — move between results
 *   - Enter                — open the highlighted result
 *   - Escape               — close
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  User,
  Package,
  FileText,
  ShoppingBag,
  Compass,
  HelpCircle,
  X,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { api } from "@services/api";
import { listArticles, type HelpArticle } from "@services/help";
import { useVisibleModules } from "@hooks/useVisibleModules";
import { HUB_MODULES } from "@lib/constants/modules";
import { MODULE_KEYWORDS } from "@lib/constants/help";
import { cn } from "@lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = "command" | "contact" | "product" | "invoice" | "order" | "help";

interface SearchResult {
  id: string;
  label: string;
  sublabel?: string;
  category: Category;
  href: string;
  /** Per-result icon (overrides the category icon — used for nav items). */
  Icon?: typeof User;
}

// ── Module label / icon / keyword lookups ─────────────────────────────────────

const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  HUB_MODULES.map((m) => [m.key, m.label]),
);
const labelFor = (mod: string) => MODULE_LABELS[mod] || mod;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Tier 2: record searches (server-side, permission-gated) ───────────────────

async function searchContacts(q: string): Promise<SearchResult[]> {
  try {
    const { data } = await api.get<{
      data: Array<{
        contact_id: string;
        display_name: string;
        primary_phone?: string;
        company_name?: string;
      }>;
    }>("/contacts", { params: { search: q, limit: 5 } });
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
      data: Array<{ product_id: string; name: string; sku?: string }>;
    }>("/catalogue/products", { params: { search: q, limit: 5 } });
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

async function searchInvoices(q: string): Promise<SearchResult[]> {
  try {
    const { data } = await api.get<{
      data: Array<{
        invoice_id: string;
        invoice_number: string;
        contact_name?: string;
        status?: string;
      }>;
    }>("/invoicing", { params: { search: q, limit: 5 } });
    return (data.data ?? []).map((i) => ({
      id: i.invoice_id,
      label: i.invoice_number,
      sublabel: [i.contact_name, i.status].filter(Boolean).join(" · "),
      category: "invoice" as const,
      href: `/invoicing/${i.invoice_id}`,
    }));
  } catch {
    return [];
  }
}

async function searchOrders(q: string): Promise<SearchResult[]> {
  try {
    const { data } = await api.get<{
      data: Array<{
        order_id: string;
        order_number: string;
        contact_name?: string;
        status?: string;
      }>;
    }>("/sales/orders", { params: { search: q, limit: 5 } });
    return (data.data ?? []).map((o) => ({
      id: o.order_id,
      label: o.order_number,
      sublabel: [o.contact_name, o.status].filter(Boolean).join(" · "),
      category: "order" as const,
      href: `/sales/orders/${o.order_id}`,
    }));
  } catch {
    return [];
  }
}

// ── Category metadata (header label + fallback icon + display order) ───────────

const CATEGORY_META: Record<
  Category,
  { label: string; Icon: typeof User; order: number }
> = {
  command: { label: "Go to", Icon: Compass, order: 0 },
  contact: { label: "Contacts", Icon: User, order: 1 },
  product: { label: "Products", Icon: Package, order: 2 },
  invoice: { label: "Invoices", Icon: FileText, order: 3 },
  order: { label: "Sales orders", Icon: ShoppingBag, order: 4 },
  help: { label: "Help & guides", Icon: HelpCircle, order: 5 },
};

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { visibleModules, visibleSettingsSubmodules } = useVisibleModules();

  // Help articles — fetched lazily (only once the palette is opened) and
  // shared with the Help Center's cache.
  const { data: articles = [] } = useQuery({
    queryKey: ["help", "articles"],
    queryFn: () => listArticles(),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  // ── Tier 1: navigable pages/actions (client-side, permission-aware) ───────
  const navItems = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{
      label: string;
      description: string;
      key: string;
      route: string;
      Icon: typeof User;
    }> = [];
    for (const m of [...visibleModules, ...visibleSettingsSubmodules]) {
      if (seen.has(m.route)) continue;
      seen.add(m.route);
      items.push({
        label: m.label,
        description: m.description,
        key: m.key,
        route: m.route,
        Icon: m.icon,
      });
    }
    return items;
  }, [visibleModules, visibleSettingsSubmodules]);

  // ── Tier 3: help article search index ─────────────────────────────────────
  const helpIndex = useMemo(
    () =>
      articles.map((a: HelpArticle) => {
        const kw = (MODULE_KEYWORDS[a.module] || []).join(" ");
        return {
          article: a,
          haystack:
            `${a.title} ${labelFor(a.module)} ${kw} ${stripHtml(a.content)}`.toLowerCase(),
        };
      }),
    [articles],
  );

  // ── Client-side matches (instant) ─────────────────────────────────────────
  const clientResults = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);

    // Pages / actions
    const commands = navItems
      .flatMap((n) => {
        const label = n.label.toLowerCase();
        const hay = `${label} ${n.description} ${n.key} ${(MODULE_KEYWORDS[n.key] || []).join(" ")}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return [];
        let score = 0;
        if (label.startsWith(q)) score += 20;
        else if (label.includes(q)) score += 12;
        terms.forEach((t) => {
          if (label.includes(t)) score += 4;
        });
        const result: SearchResult = {
          id: `cmd-${n.route}`,
          label: n.label,
          sublabel: n.description,
          category: "command",
          href: n.route,
          Icon: n.Icon,
        };
        return [{ score, result }];
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.result);

    // Help articles
    const help = helpIndex
      .flatMap((h) => {
        const title = h.article.title.toLowerCase();
        if (!terms.every((t) => h.haystack.includes(t))) return [];
        let score = 0;
        if (title.includes(q)) score += 15;
        terms.forEach((t) => {
          if (title.includes(t)) score += 5;
        });
        const result: SearchResult = {
          id: `help-${h.article.article_id}`,
          label: h.article.title,
          sublabel: `${labelFor(h.article.module)} · ${h.article.article_type}`,
          category: "help",
          href: `/help?module=${h.article.module}&article=${h.article.article_id}`,
        };
        return [{ score, result }];
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.result);

    return [...commands, ...help];
  }, [query, navItems, helpIndex]);

  // ── Combined, section-ordered result list ─────────────────────────────────
  const results = useMemo<SearchResult[]>(() => {
    const all = [...clientResults, ...records];
    return all.sort(
      (a, b) => CATEGORY_META[a.category].order - CATEGORY_META[b.category].order,
    );
  }, [clientResults, records]);

  // ── Global ⌘K / Ctrl+K shortcut ───────────────────────────────────────────
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
  }, [open, onClose]);

  // Reset + focus when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setRecords([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keep the active row in range as results change.
  useEffect(() => {
    setActiveIdx((i) => Math.min(i, Math.max(0, results.length - 1)));
  }, [results.length]);

  // ── Debounced record search (tier 2) ──────────────────────────────────────
  const runRecordSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const groups = await Promise.all([
        searchContacts(trimmed),
        searchProducts(trimmed),
        searchInvoices(trimmed),
        searchOrders(trimmed),
      ]);
      setRecords(groups.flat());
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setActiveIdx(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runRecordSearch(val), 250);
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
      handleSelect(results[activeIdx]);
    }
  }

  function handleSelect(result: SearchResult) {
    navigate(result.href);
    onClose();
  }

  // Group results by category, preserving section order.
  const grouped = useMemo(() => {
    const map = new Map<Category, SearchResult[]>();
    for (const r of results) {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    }
    return Array.from(map.entries());
  }, [results]);

  if (!open) return null;

  const hasQuery = query.trim().length > 0;
  const showNoResults =
    hasQuery && results.length === 0 && !loading && query.trim().length >= 2;

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
            placeholder="Search pages, contacts, products, invoices, help…"
            className="flex-1 bg-transparent text-sm text-brand-cream placeholder-brand-smoke/40 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setRecords([]);
                inputRef.current?.focus();
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
          {!hasQuery ? (
            /* Empty state — what you can search */
            <div className="px-4 py-8 text-center space-y-4">
              <Search className="h-8 w-8 text-brand-smoke/20 mx-auto" />
              <p className="text-sm text-brand-smoke/50">
                Search across pages, contacts, products, invoices, orders and
                help guides
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
                  open
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-brand-graphite rounded border border-white/10 font-mono">
                    Esc
                  </kbd>
                  close
                </span>
              </div>
            </div>
          ) : showNoResults ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-brand-smoke/50">
                No results for{" "}
                <span className="text-brand-cream">"{query.trim()}"</span>
              </p>
              <p className="text-[11px] text-brand-smoke/35 mt-1">
                Try a page name, a customer, an invoice number, or a keyword.
              </p>
            </div>
          ) : results.length === 0 && loading ? (
            <div className="px-4 py-8 text-center">
              <Loader2 className="h-5 w-5 text-brand-smoke/40 mx-auto animate-spin" />
            </div>
          ) : (
            /* Grouped results */
            grouped.map(([category, items]) => {
              const { label, Icon: CatIcon } = CATEGORY_META[category];
              return (
                <div key={category}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-brand-charcoal/40">
                    <CatIcon className="h-3.5 w-3.5 text-brand-smoke/50" />
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
                    const RowIcon = result.Icon || CatIcon;
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
                          <RowIcon
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
