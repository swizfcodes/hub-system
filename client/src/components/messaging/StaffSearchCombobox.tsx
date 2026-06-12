/**
 * StaffSearchCombobox
 *
 * Typeahead that searches staff by name and lets the user pick one or
 * more team members. Used by NewChannelModal so no one has to hunt
 * for a UUID on the staff profile page.
 *
 * Props:
 *   selected   — currently chosen staff (shown as chips)
 *   onChange   — called with the full updated array on every change
 *   max        — 1 for direct messages, undefined/large for groups
 */

import { useEffect, useRef, useState } from "react";
import { Search, X, UserCircle2, AlertTriangle } from "lucide-react";
import { api } from "@services/api";
import { cn } from "@lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StaffOption {
  profile_id: string;
  user_id: string | null; // null = no login provisioned yet
  display_name: string;
  job_title?: string;
  department?: string;
}

// ── Search helper ─────────────────────────────────────────────────────────────

async function searchStaff(query: string): Promise<StaffOption[]> {
  if (query.trim().length < 1) return [];
  try {
    const { data } = await api.get<{ data: StaffOption[] }>("/staff", {
      params: { search: query.trim(), is_active: true, limit: 8 },
    });
    return data.data ?? [];
  } catch {
    return [];
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  selected: StaffOption[];
  onChange: (staff: StaffOption[]) => void;
  /** 1 = direct message (only one allowed) */
  max?: number;
  placeholder?: string;
  surface?: "dark" | "light";
}

export function StaffSearchCombobox({
  selected,
  onChange,
  max,
  placeholder = "Search team members…",
  surface = "light",
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Debounced search ────────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const hits = await searchStaff(query);
      // Filter out already-selected profiles
      const selectedIds = new Set(selected.map((s) => s.profile_id));
      setResults(hits.filter((h) => !selectedIds.has(h.profile_id)));
      setOpen(true);
      setLoading(false);
    }, 200);
  }, [query, selected]);

  // ── Outside click ───────────────────────────────────────────────────────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(staff: StaffOption) {
    if (max === 1) {
      onChange([staff]);
    } else {
      onChange([...selected, staff]);
    }
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function remove(profileId: string) {
    onChange(selected.filter((s) => s.profile_id !== profileId));
  }

  const isDark = surface === "dark";
  const isAtMax = max !== undefined && selected.length >= max;

  return (
    <div ref={wrapperRef} className="relative">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((s) => (
            <span
              key={s.profile_id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                isDark
                  ? "bg-brand-graphite text-brand-cream"
                  : "bg-brand-accent/10 border border-brand-accent/30 text-brand-black/80",
              )}
            >
              <UserCircle2 className="h-3.5 w-3.5 shrink-0 text-brand-accent" />
              {s.display_name}
              {!s.user_id && (
                <span title="No login account — cannot receive messages">
                  <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(s.profile_id)}
                className="ml-0.5 rounded-full text-current opacity-50 hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      {!isAtMax && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-2.5",
            isDark
              ? "border-white/10 bg-brand-charcoal text-brand-cream"
              : "border-brand-graphite/60 bg-white/80 text-brand-black",
          )}
        >
          {loading ? (
            <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-brand-smoke/40 border-t-brand-accent" />
          ) : (
            <Search className="h-3.5 w-3.5 shrink-0 text-brand-smoke/60" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm placeholder-brand-smoke/40 focus:outline-none"
          />
        </div>
      )}

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-white/10 bg-brand-black shadow-2xl overflow-hidden">
          {results.map((s) => (
            <button
              key={s.profile_id}
              type="button"
              onClick={() => pick(s)}
              disabled={!s.user_id}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                s.user_id
                  ? "hover:bg-brand-graphite/40 text-brand-cream"
                  : "opacity-50 cursor-not-allowed text-brand-smoke",
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-graphite">
                <UserCircle2 className="h-4 w-4 text-brand-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.display_name}</p>
                <p className="text-[11px] text-brand-smoke/60 truncate">
                  {s.job_title || s.department || "Staff"}
                  {!s.user_id && " · No login account"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && query.trim() && results.length === 0 && !loading && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-white/10 bg-brand-black shadow-2xl px-4 py-4 text-center">
          <p className="text-sm text-brand-smoke">
            No staff found for "{query}"
          </p>
          <p className="text-xs text-brand-smoke/40 mt-0.5">
            Only active team members with a login appear here
          </p>
        </div>
      )}
    </div>
  );
}
