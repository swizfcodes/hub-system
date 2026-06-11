/**
 * SupplierSearchInput
 * Typeahead for selecting a supplier. Replaces the 200-item Select dropdown
 * in PONew and RFQNew — searches /api/purchasing/suppliers?search=q live.
 */
import { useEffect, useRef, useState } from "react";
import { Search, X, Building2 } from "lucide-react";
import { api } from "@services/api";
import { cn } from "@lib/cn";

export interface SupplierOption {
  supplier_id: string;
  display_name: string;
  supplier_code: string;
  preferred_currency?: string;
}

interface Props {
  value: SupplierOption | null;
  onChange: (s: SupplierOption | null) => void;
  label?: string;
  required?: boolean;
  error?: string;
  surface?: "dark" | "light";
}

export function SupplierSearchInput({
  value,
  onChange,
  label,
  required,
  error,
  surface = "dark",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SupplierOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    debRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get<{ data: SupplierOption[] }>(
          "/purchasing/suppliers",
          {
            params: { search: query.trim(), limit: 8 },
          },
        );
        setResults(data.data ?? []);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 220);
  }, [query]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isDark = surface === "dark";

  if (value) {
    return (
      <div ref={wrapRef}>
        {label && (
          <label
            className={`mb-1.5 block text-xs font-medium ${isDark ? "text-brand-smoke" : "text-text-on-light-muted"}`}
          >
            {label}
            {required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
        )}
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border px-3 py-2.5",
            isDark
              ? "border-brand-accent/40 bg-brand-accent/5"
              : "border-brand-accent/40 bg-brand-accent/5",
          )}
        >
          <Building2 className="h-4 w-4 shrink-0 text-brand-accent" />
          <div className="min-w-0 flex-1">
            <p
              className={`truncate text-sm font-medium ${isDark ? "text-brand-cream" : "text-brand-black"}`}
            >
              {value.display_name}
            </p>
            <p className="text-xs text-brand-smoke">{value.supplier_code}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
            className="text-brand-smoke hover:text-brand-cream"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      {label && (
        <label
          className={`mb-1.5 block text-xs font-medium ${isDark ? "text-brand-smoke" : "text-text-on-light-muted"}`}
        >
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {loading ? (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-brand-smoke/30 border-t-brand-accent" />
        ) : (
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-smoke" />
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search suppliers by name or code..."
          className={cn(
            "w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm focus:outline-none",
            isDark
              ? "border-white/10 bg-brand-graphite text-brand-cream placeholder-brand-smoke/50 focus:border-brand-accent/50"
              : "border-brand-cloud/40 bg-white text-brand-black shadow-sm focus:border-brand-black focus:ring-1 focus:ring-brand-black",
          )}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-brand-black shadow-xl overflow-hidden">
          {results.map((s) => (
            <button
              key={s.supplier_id}
              type="button"
              onClick={() => {
                onChange(s);
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-brand-graphite/40 transition-colors"
            >
              <Building2 className="h-4 w-4 shrink-0 text-brand-smoke" />
              <div>
                <p className="text-sm font-medium text-brand-cream">
                  {s.display_name}
                </p>
                <p className="text-xs text-brand-smoke">
                  {s.supplier_code}
                  {s.preferred_currency ? ` · ${s.preferred_currency}` : ""}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && results.length === 0 && !loading && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-brand-black shadow-xl px-4 py-3">
          <p className="text-sm text-brand-smoke">
            No suppliers found for &ldquo;{query}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}
