import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  BookOpen,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { listArticles, type HelpArticle } from "@services/help";
import { HUB_MODULES } from "@lib/constants/modules";
import { cn } from "@lib/cn";

// Map module keys to display labels
const MODULE_LABELS: Record<string, string> = Object.fromEntries([
  ["general", "Getting Started"],
  ...HUB_MODULES.map((m) => [m.key, m.label]),
]);

const MODULE_ICONS: Record<string, typeof BookOpen> = {};
HUB_MODULES.forEach((m) => {
  MODULE_ICONS[m.key] = m.icon;
});

export default function HelpCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeModule = searchParams.get("module") || null;
  const [search, setSearch] = useState("");
  const [expandedFaqs, setExpandedFaqs] = useState<Set<string>>(new Set());

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["help", "articles"],
    queryFn: () => listArticles(),
    staleTime: 5 * 60_000,
  });

  // Group by module
  const grouped = useMemo(() => {
    const map = new Map<string, HelpArticle[]>();
    for (const a of articles) {
      if (!map.has(a.module)) map.set(a.module, []);
      map.get(a.module)!.push(a);
    }
    return map;
  }, [articles]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return articles;
    const q = search.toLowerCase();
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q) ||
        (MODULE_LABELS[a.module] || a.module).toLowerCase().includes(q),
    );
  }, [articles, search]);

  const filteredGrouped = useMemo(() => {
    const map = new Map<string, HelpArticle[]>();
    for (const a of filtered) {
      if (!map.has(a.module)) map.set(a.module, []);
      map.get(a.module)!.push(a);
    }
    return map;
  }, [filtered]);

  const toggleFaq = (id: string) => {
    setExpandedFaqs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Module detail view
  const moduleArticles = activeModule ? grouped.get(activeModule) || [] : [];
  const moduleGuides = moduleArticles.filter((a) => a.article_type === "guide");
  const moduleFaqs = moduleArticles.filter((a) => a.article_type === "faq");

  return (
    <>
      <Topbar title="Help Center" subtitle="Guides, workflows & FAQs" />
      <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-5xl mx-auto">
        {/* Search bar */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-smoke/50" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (activeModule) setSearchParams({});
              }}
              placeholder="Search guides and FAQs…"
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-brand-graphite/60 bg-brand-charcoal text-brand-cream placeholder-brand-smoke/40 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/40 transition-all"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : activeModule && !search ? (
          /* ── Module detail view ──────────────────────────── */
          <div>
            <button
              onClick={() => setSearchParams({})}
              className="inline-flex items-center gap-2 text-sm text-brand-accent hover:text-brand-cream transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" /> Back to all modules
            </button>

            <h2 className="font-display text-3xl text-brand-cream mb-2">
              {MODULE_LABELS[activeModule] || activeModule}
            </h2>

            {/* Guides */}
            {moduleGuides.map((g) => (
              <article
                key={g.article_id}
                className="mt-6 p-6 sm:p-8 rounded-2xl bg-brand-charcoal border border-brand-graphite"
              >
                <h3 className="font-display text-xl text-brand-cream mb-4 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-brand-accent shrink-0" />
                  {g.title}
                </h3>
                <div
                  className="prose-help text-sm text-brand-cloud leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: g.content }}
                />
              </article>
            ))}

            {/* FAQs */}
            {moduleFaqs.length > 0 && (
              <div className="mt-8">
                <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-4">
                  Frequently asked questions
                </h3>
                <div className="space-y-2">
                  {moduleFaqs.map((f) => (
                    <FaqItem
                      key={f.article_id}
                      article={f}
                      expanded={expandedFaqs.has(f.article_id)}
                      onToggle={() => toggleFaq(f.article_id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {moduleGuides.length === 0 && moduleFaqs.length === 0 && (
              <EmptyState
                icon={<HelpCircle className="w-7 h-7" />}
                title="No guides yet"
                description="Guides for this module will appear here once added by an admin."
              />
            )}
          </div>
        ) : search ? (
          /* ── Search results ──────────────────────────────── */
          <div>
            <p className="text-sm text-brand-smoke mb-4">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""} for "
              {search}"
            </p>
            {filtered.length === 0 ? (
              <EmptyState
                icon={<Search className="w-7 h-7" />}
                title="No results"
                description="Try different keywords or browse modules below."
              />
            ) : (
              <div className="space-y-3">
                {filtered.map((a) => (
                  <button
                    key={a.article_id}
                    onClick={() => {
                      setSearch("");
                      setSearchParams({ module: a.module });
                    }}
                    className="w-full text-left p-4 rounded-xl bg-brand-charcoal border border-brand-graphite hover:border-brand-accent/40 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[0.6rem] tracking-widest uppercase text-brand-accent">
                        {MODULE_LABELS[a.module] || a.module}
                      </span>
                      <span className="text-[0.6rem] text-brand-smoke">
                        · {a.article_type}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-brand-cream">
                      {a.title}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Module grid ─────────────────────────────────── */
          <div>
            {/* Getting Started card at top */}
            {grouped.has("general") && (
              <button
                onClick={() => setSearchParams({ module: "general" })}
                className="w-full text-left mb-6 p-6 rounded-2xl bg-gradient-to-br from-brand-accent/15 to-brand-accent/5 border border-brand-accent/30 hover:border-brand-accent/60 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-brand-accent/20 flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-brand-accent" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl text-brand-cream">
                      Getting Started
                    </h3>
                    <p className="text-sm text-brand-smoke mt-0.5">
                      New to the Hub? Start here.
                    </p>
                  </div>
                </div>
              </button>
            )}

            {/* Module cards */}
            <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-4">
              Browse by module
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from(filteredGrouped.keys())
                .filter((k) => k !== "general")
                .sort((a, b) =>
                  (MODULE_LABELS[a] || a).localeCompare(
                    MODULE_LABELS[b] || b,
                  ),
                )
                .map((mod) => {
                  const Icon = MODULE_ICONS[mod] || HelpCircle;
                  const count = filteredGrouped.get(mod)!.length;
                  return (
                    <button
                      key={mod}
                      onClick={() => setSearchParams({ module: mod })}
                      className="flex items-center gap-3 p-4 rounded-xl bg-brand-charcoal border border-brand-graphite hover:border-brand-accent/40 transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-brand-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-brand-cream truncate">
                          {MODULE_LABELS[mod] || mod}
                        </p>
                        <p className="text-xs text-brand-smoke">
                          {count} article{count !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-brand-smoke/40 shrink-0" />
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function FaqItem({
  article,
  expanded,
  onToggle,
}: {
  article: HelpArticle;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        expanded
          ? "border-brand-accent/30 bg-brand-charcoal"
          : "border-brand-graphite bg-brand-charcoal/50",
      )}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <HelpCircle className="w-4 h-4 text-brand-accent shrink-0" />
        <span className="flex-1 text-sm font-medium text-brand-cream">
          {article.title}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-brand-smoke/40 transition-transform shrink-0",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-4 pl-11">
          <div
            className="prose-help text-sm text-brand-cloud leading-relaxed"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        </div>
      )}
    </div>
  );
}
