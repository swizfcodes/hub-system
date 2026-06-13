import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Search,
  BookOpen,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Rocket,
  Compass,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  LifeBuoy,
  MessageCircle,
  X,
  Hash,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { listArticles, type HelpArticle } from "@services/help";
import { HUB_MODULES } from "@lib/constants/modules";
import {
  HELP_AREAS,
  AREA_MODULE_KEYS,
  COMMON_TASKS,
  MODULE_KEYWORDS,
  GLOSSARY,
} from "@lib/constants/help";
import { cn } from "@lib/cn";

// ── Module label / icon lookups ──────────────────────────────
const MODULE_LABELS: Record<string, string> = Object.fromEntries([
  ["general", "Getting Started"],
  ...HUB_MODULES.map((m) => [m.key, m.label]),
]);

const MODULE_ICONS: Record<string, typeof BookOpen> = { general: Rocket };
HUB_MODULES.forEach((m) => {
  MODULE_ICONS[m.key] = m.icon;
});

const labelFor = (mod: string) => MODULE_LABELS[mod] || mod;

// ── Plain-text helpers (search + snippets) ───────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface IndexedArticle {
  article: HelpArticle;
  plain: string; // lowercased plain-text content
  haystack: string; // title + module label + keywords + content
}

interface ScoredResult extends IndexedArticle {
  score: number;
  snippet: { text: string; matchStart: number; matchLen: number } | null;
}

function buildSnippet(
  plain: string,
  rawPlain: string,
  term: string,
): ScoredResult["snippet"] {
  const idx = plain.indexOf(term);
  if (idx === -1) return null;
  const radius = 90;
  const start = Math.max(0, idx - radius);
  const end = Math.min(rawPlain.length, idx + term.length + radius);
  let text = rawPlain.slice(start, end);
  let matchStart = idx - start;
  if (start > 0) {
    text = "…" + text;
    matchStart += 1;
  }
  if (end < rawPlain.length) text = text + "…";
  return { text, matchStart, matchLen: term.length };
}

// Split a string at a match and wrap the match in <mark>-style emphasis.
function Highlight({
  text,
  matchStart,
  matchLen,
}: {
  text: string;
  matchStart: number;
  matchLen: number;
}) {
  if (matchStart < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, matchStart)}
      <mark className="bg-brand-accent/25 text-brand-cream rounded px-0.5">
        {text.slice(matchStart, matchStart + matchLen)}
      </mark>
      {text.slice(matchStart + matchLen)}
    </>
  );
}

// ── "Was this helpful?" persistence ──────────────────────────
const FEEDBACK_KEY = "help.feedback";
function readFeedback(): Record<string, "up" | "down"> {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function HelpCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const activeModule = searchParams.get("module");
  const activeArticle = searchParams.get("article");
  const showGlossary = searchParams.get("view") === "glossary";
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["help", "articles"],
    queryFn: () => listArticles(),
    staleTime: 5 * 60_000,
  });

  // Build a search index once per article set.
  const index = useMemo<IndexedArticle[]>(
    () =>
      articles.map((article) => {
        const plainRaw = stripHtml(article.content);
        const kw = (MODULE_KEYWORDS[article.module] || []).join(" ");
        return {
          article,
          plain: plainRaw.toLowerCase(),
          haystack: `${article.title} ${labelFor(article.module)} ${kw} ${plainRaw}`.toLowerCase(),
        };
      }),
    [articles],
  );

  const byId = useMemo(
    () => new Map(articles.map((a) => [a.article_id, a])),
    [articles],
  );

  // module → articles
  const grouped = useMemo(() => {
    const map = new Map<string, HelpArticle[]>();
    for (const a of articles) {
      if (!map.has(a.module)) map.set(a.module, []);
      map.get(a.module)!.push(a);
    }
    return map;
  }, [articles]);

  // Scroll to top whenever the view changes.
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeModule, activeArticle, showGlossary]);

  // ── Search results (ranked) ────────────────────────────────
  const results = useMemo<ScoredResult[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    const scored: ScoredResult[] = [];
    for (const item of index) {
      const title = item.article.title.toLowerCase();
      let score = 0;
      let allTermsHit = true;
      for (const t of terms) {
        const inTitle = title.includes(t);
        const inHay = item.haystack.includes(t);
        if (!inHay) {
          allTermsHit = false;
          break;
        }
        score += inTitle ? 10 : 0;
        score += item.plain.includes(t) ? 3 : 0;
        score += 2; // keyword / label match
      }
      if (!allTermsHit) continue;
      if (title.includes(q)) score += 25; // exact phrase in title
      if (item.article.article_type === "faq") score += 1;
      const snippet =
        buildSnippet(item.plain, stripHtml(item.article.content), terms[0]) ||
        null;
      scored.push({ ...item, score, snippet });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [index, search]);

  function openArticle(a: HelpArticle) {
    setSearch("");
    setSearchParams({ module: a.module, article: a.article_id });
  }
  function openModule(mod: string) {
    setSearch("");
    setSearchParams({ module: mod });
  }
  function goHome() {
    setSearch("");
    setSearchParams({});
  }

  const subtitle = showGlossary
    ? "Words explained"
    : activeArticle
      ? labelFor(byId.get(activeArticle)?.module || "")
      : activeModule
        ? labelFor(activeModule)
        : "Find answers fast";

  return (
    <>
      <Topbar title="Help Center" subtitle={subtitle} />
      <div
        ref={scrollRef}
        className="px-4 sm:px-8 py-6 sm:py-10 max-w-5xl mx-auto"
      >
        {/* Search bar — always visible */}
        <SearchBar
          value={search}
          onChange={setSearch}
          onClear={() => setSearch("")}
        />

        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : search.trim() ? (
          <SearchResults
            query={search}
            results={results}
            onOpen={openArticle}
          />
        ) : showGlossary ? (
          <GlossaryView onBack={goHome} onJump={setSearch} />
        ) : activeArticle && byId.has(activeArticle) ? (
          <ArticleView
            article={byId.get(activeArticle)!}
            siblings={grouped.get(byId.get(activeArticle)!.module) || []}
            onBack={() => openModule(byId.get(activeArticle)!.module)}
            onOpen={openArticle}
            onHome={goHome}
          />
        ) : activeModule ? (
          <ModuleView
            module={activeModule}
            articles={grouped.get(activeModule) || []}
            onBack={goHome}
            onOpen={openArticle}
          />
        ) : (
          <HomeView
            grouped={grouped}
            onOpenModule={openModule}
            onOpenArticle={openArticle}
            onOpenGlossary={() => setSearchParams({ view: "glossary" })}
            navigate={navigate}
          />
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Search bar
// ─────────────────────────────────────────────────────────────
function SearchBar({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="mb-8">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-smoke/50" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          placeholder="Describe what you need — e.g. “refund a customer”, “add staff”…"
          className="w-full pl-11 pr-11 py-3.5 rounded-2xl border border-brand-graphite/60 bg-brand-charcoal text-brand-cream placeholder-brand-smoke/40 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/40 transition-all"
        />
        {value && (
          <button
            onClick={onClear}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-brand-smoke hover:text-brand-cream hover:bg-brand-graphite/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Home view
// ─────────────────────────────────────────────────────────────
function HomeView({
  grouped,
  onOpenModule,
  onOpenArticle,
  onOpenGlossary,
  navigate,
}: {
  grouped: Map<string, HelpArticle[]>;
  onOpenModule: (mod: string) => void;
  onOpenArticle: (a: HelpArticle) => void;
  onOpenGlossary: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  // Popular questions: a spread of FAQs across modules.
  const popular = useMemo(() => {
    const faqs: HelpArticle[] = [];
    for (const list of grouped.values()) {
      const faq = list.find((a) => a.article_type === "faq");
      if (faq) faqs.push(faq);
    }
    return faqs.slice(0, 6);
  }, [grouped]);

  const tasks = COMMON_TASKS.filter((t) => grouped.has(t.module));

  // "More topics" — any module with content that isn't placed in an area.
  const extraModules = Array.from(grouped.keys()).filter(
    (k) => k !== "general" && !AREA_MODULE_KEYS.has(k),
  );

  return (
    <div className="space-y-10">
      {/* Quick-start banner */}
      {grouped.has("general") && (
        <button
          onClick={() => onOpenModule("general")}
          className="group w-full text-left p-6 sm:p-7 rounded-2xl bg-gradient-to-br from-brand-accent/15 to-brand-accent/[0.03] border border-brand-accent/30 hover:border-brand-accent/60 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-brand-accent/20 flex items-center justify-center shrink-0">
              <Rocket className="w-6 h-6 text-brand-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-xl text-brand-cream">
                New here? Start with the basics
              </h3>
              <p className="text-sm text-brand-smoke mt-0.5">
                A 2-minute tour of how to find your way around.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-brand-accent/70 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </div>
        </button>
      )}

      {/* Common tasks */}
      {tasks.length > 0 && (
        <section>
          <SectionHeading icon={Sparkles} label="What do you want to do?" />
          <div className="grid gap-2.5 sm:grid-cols-2">
            {tasks.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.label}
                  onClick={() => onOpenModule(t.module)}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-brand-charcoal border border-brand-graphite hover:border-brand-accent/40 transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-brand-accent/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-brand-accent" />
                  </div>
                  <span className="flex-1 text-sm text-brand-cream">
                    {t.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-brand-smoke/40 shrink-0" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Browse by area */}
      <section>
        <SectionHeading icon={Compass} label="Browse help by area" />
        <div className="space-y-6">
          {HELP_AREAS.map((area) => {
            const mods = area.modules.filter((m) => grouped.has(m));
            if (mods.length === 0) return null;
            const AreaIcon = area.icon;
            return (
              <div key={area.id}>
                <div className="flex items-center gap-2.5 mb-3">
                  <AreaIcon className="w-4 h-4 text-brand-accent shrink-0" />
                  <h4 className="text-sm font-medium text-brand-cream">
                    {area.label}
                  </h4>
                  <span className="hidden sm:block text-xs text-brand-smoke/70 truncate">
                    — {area.blurb}
                  </span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {mods.map((mod) => (
                    <ModuleCard
                      key={mod}
                      module={mod}
                      count={grouped.get(mod)!.length}
                      onClick={() => onOpenModule(mod)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {extraModules.length > 0 && (
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <Hash className="w-4 h-4 text-brand-accent shrink-0" />
                <h4 className="text-sm font-medium text-brand-cream">
                  More topics
                </h4>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {extraModules.map((mod) => (
                  <ModuleCard
                    key={mod}
                    module={mod}
                    count={grouped.get(mod)!.length}
                    onClick={() => onOpenModule(mod)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Popular questions */}
      {popular.length > 0 && (
        <section>
          <SectionHeading icon={HelpCircle} label="Popular questions" />
          <div className="space-y-2">
            {popular.map((a) => (
              <button
                key={a.article_id}
                onClick={() => onOpenArticle(a)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-brand-charcoal/60 border border-brand-graphite hover:border-brand-accent/40 transition-colors text-left"
              >
                <HelpCircle className="w-4 h-4 text-brand-accent shrink-0" />
                <span className="flex-1 text-sm text-brand-cream">
                  {a.title}
                </span>
                <span className="hidden sm:block text-[0.6rem] tracking-widest uppercase text-brand-smoke/60 shrink-0">
                  {labelFor(a.module)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Glossary + support */}
      <section className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={onOpenGlossary}
          className="flex items-center gap-3 p-4 rounded-xl bg-brand-charcoal border border-brand-graphite hover:border-brand-accent/40 transition-all text-left"
        >
          <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4 text-brand-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-brand-cream">
              Words explained
            </p>
            <p className="text-xs text-brand-smoke">
              Plain-English guide to business terms.
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-brand-smoke/40 shrink-0" />
        </button>
        <SupportCard navigate={navigate} compact />
      </section>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  label,
}: {
  icon: typeof Sparkles;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-3.5 h-3.5 text-brand-accent" />
      <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent">
        {label}
      </h3>
    </div>
  );
}

function ModuleCard({
  module,
  count,
  onClick,
}: {
  module: string;
  count: number;
  onClick: () => void;
}) {
  const Icon = MODULE_ICONS[module] || HelpCircle;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3.5 rounded-xl bg-brand-charcoal border border-brand-graphite hover:border-brand-accent/40 transition-all text-left"
    >
      <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-brand-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-brand-cream truncate">
          {labelFor(module)}
        </p>
        <p className="text-xs text-brand-smoke">
          {count} article{count !== 1 ? "s" : ""}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-brand-smoke/40 shrink-0" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Search results
// ─────────────────────────────────────────────────────────────
function SearchResults({
  query,
  results,
  onOpen,
}: {
  query: string;
  results: ScoredResult[];
  onOpen: (a: HelpArticle) => void;
}) {
  return (
    <div>
      <p className="text-sm text-brand-smoke mb-4">
        {results.length} result{results.length !== 1 ? "s" : ""} for “
        <span className="text-brand-cream">{query.trim()}</span>”
      </p>
      {results.length === 0 ? (
        <EmptyState
          icon={<Search className="w-7 h-7" />}
          title="No matches yet"
          description="Try fewer or simpler words — for example a single keyword like “invoice”, “stock”, or “password”. You can also browse by area below by clearing the search."
        />
      ) : (
        <div className="space-y-2.5">
          {results.map((r) => {
            const a = r.article;
            const Icon =
              a.article_type === "faq" ? HelpCircle : MODULE_ICONS[a.module] || BookOpen;
            return (
              <button
                key={a.article_id}
                onClick={() => onOpen(a)}
                className="w-full text-left p-4 rounded-xl bg-brand-charcoal border border-brand-graphite hover:border-brand-accent/40 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="w-3.5 h-3.5 text-brand-accent shrink-0" />
                  <span className="text-[0.6rem] tracking-widest uppercase text-brand-accent">
                    {labelFor(a.module)}
                  </span>
                  <span className="text-[0.6rem] text-brand-smoke">
                    · {a.article_type}
                  </span>
                </div>
                <p className="text-sm font-medium text-brand-cream">
                  {a.title}
                </p>
                {r.snippet && (
                  <p className="text-xs text-brand-cloud/80 mt-1 leading-relaxed">
                    <Highlight
                      text={r.snippet.text}
                      matchStart={r.snippet.matchStart}
                      matchLen={r.snippet.matchLen}
                    />
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Module view — guides + FAQs for one module
// ─────────────────────────────────────────────────────────────
function ModuleView({
  module,
  articles,
  onBack,
  onOpen,
}: {
  module: string;
  articles: HelpArticle[];
  onBack: () => void;
  onOpen: (a: HelpArticle) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const guides = articles.filter((a) => a.article_type !== "faq");
  const faqs = articles.filter((a) => a.article_type === "faq");
  const Icon = MODULE_ICONS[module] || HelpCircle;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div>
      <BackLink label="All help topics" onClick={onBack} />

      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-brand-accent/15 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-brand-accent" />
        </div>
        <h2 className="font-display text-3xl text-brand-cream">
          {labelFor(module)}
        </h2>
      </div>

      {/* Guides — list, click to read full */}
      {guides.length > 0 && (
        <div className="space-y-2.5 mb-8">
          {guides.map((g) => (
            <button
              key={g.article_id}
              onClick={() => onOpen(g)}
              className="w-full flex items-center gap-3 p-4 rounded-xl bg-brand-charcoal border border-brand-graphite hover:border-brand-accent/40 transition-colors text-left"
            >
              <BookOpen className="w-4 h-4 text-brand-accent shrink-0" />
              <span className="flex-1 text-sm font-medium text-brand-cream">
                {g.title}
              </span>
              <ChevronRight className="w-4 h-4 text-brand-smoke/40 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* FAQs — inline accordion */}
      {faqs.length > 0 && (
        <div>
          <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-4">
            Frequently asked questions
          </h3>
          <div className="space-y-2">
            {faqs.map((f) => (
              <FaqItem
                key={f.article_id}
                article={f}
                expanded={expanded.has(f.article_id)}
                onToggle={() => toggle(f.article_id)}
              />
            ))}
          </div>
        </div>
      )}

      {guides.length === 0 && faqs.length === 0 && (
        <EmptyState
          icon={<HelpCircle className="w-7 h-7" />}
          title="No guides yet"
          description="Guides for this topic will appear here once added by an admin."
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Article view — full read + related + feedback
// ─────────────────────────────────────────────────────────────
function ArticleView({
  article,
  siblings,
  onBack,
  onOpen,
  onHome,
}: {
  article: HelpArticle;
  siblings: HelpArticle[];
  onBack: () => void;
  onOpen: (a: HelpArticle) => void;
  onHome: () => void;
}) {
  const related = siblings
    .filter((a) => a.article_id !== article.article_id)
    .slice(0, 4);

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-brand-smoke mb-5 flex-wrap">
        <button onClick={onHome} className="hover:text-brand-accent transition-colors">
          Help Center
        </button>
        <ChevronRight className="w-3 h-3 text-brand-smoke/40" />
        <button onClick={onBack} className="hover:text-brand-accent transition-colors">
          {labelFor(article.module)}
        </button>
        <ChevronRight className="w-3 h-3 text-brand-smoke/40" />
        <span className="text-brand-cloud truncate max-w-[12rem]">
          {article.title}
        </span>
      </nav>

      <article className="p-6 sm:p-8 rounded-2xl bg-brand-charcoal border border-brand-graphite">
        <div className="flex items-center gap-2 mb-4">
          {article.article_type === "faq" ? (
            <HelpCircle className="w-5 h-5 text-brand-accent shrink-0" />
          ) : (
            <BookOpen className="w-5 h-5 text-brand-accent shrink-0" />
          )}
          <span className="text-[0.6rem] tracking-widest uppercase text-brand-accent">
            {labelFor(article.module)}
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl text-brand-cream mb-5">
          {article.title}
        </h1>
        <div
          className="prose-help text-sm text-brand-cloud leading-relaxed"
          dangerouslySetInnerHTML={{ __html: article.content }}
        />

        <Feedback articleId={article.article_id} />
      </article>

      {/* Related */}
      {related.length > 0 && (
        <div className="mt-8">
          <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-4">
            More in {labelFor(article.module)}
          </h3>
          <div className="space-y-2">
            {related.map((a) => (
              <button
                key={a.article_id}
                onClick={() => onOpen(a)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-brand-charcoal/60 border border-brand-graphite hover:border-brand-accent/40 transition-colors text-left"
              >
                {a.article_type === "faq" ? (
                  <HelpCircle className="w-4 h-4 text-brand-accent shrink-0" />
                ) : (
                  <BookOpen className="w-4 h-4 text-brand-accent shrink-0" />
                )}
                <span className="flex-1 text-sm text-brand-cream">
                  {a.title}
                </span>
                <ChevronRight className="w-4 h-4 text-brand-smoke/40 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <BackLink label={`Back to ${labelFor(article.module)}`} onClick={onBack} />
      </div>
    </div>
  );
}

function Feedback({ articleId }: { articleId: string }) {
  const [vote, setVote] = useState<"up" | "down" | null>(
    () => readFeedback()[articleId] || null,
  );

  function cast(v: "up" | "down") {
    setVote(v);
    try {
      const all = readFeedback();
      all[articleId] = v;
      localStorage.setItem(FEEDBACK_KEY, JSON.stringify(all));
    } catch {
      /* ignore storage failures */
    }
  }

  return (
    <div className="mt-8 pt-6 border-t border-brand-graphite/60">
      {vote ? (
        <p className="text-sm text-brand-smoke">
          {vote === "up"
            ? "Thanks — glad this helped! 🎉"
            : "Thanks for the feedback. Try the search above, or reach out using the support options on the Help Center home."}
        </p>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-brand-smoke">Was this helpful?</span>
          <button
            onClick={() => cast("up")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-graphite text-brand-cream text-xs hover:border-brand-accent/40 hover:text-brand-accent transition-colors"
          >
            <ThumbsUp className="w-3.5 h-3.5" /> Yes
          </button>
          <button
            onClick={() => cast("down")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-graphite text-brand-cream text-xs hover:border-brand-accent/40 hover:text-brand-accent transition-colors"
          >
            <ThumbsDown className="w-3.5 h-3.5" /> No
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Glossary view
// ─────────────────────────────────────────────────────────────
function GlossaryView({
  onBack,
  onJump,
}: {
  onBack: () => void;
  onJump: (q: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const terms = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? GLOSSARY.filter(
          (t) =>
            t.term.toLowerCase().includes(q) ||
            t.definition.toLowerCase().includes(q),
        )
      : GLOSSARY;
    return [...list].sort((a, b) => a.term.localeCompare(b.term));
  }, [filter]);

  return (
    <div>
      <BackLink label="All help topics" onClick={onBack} />
      <h2 className="font-display text-3xl text-brand-cream mb-1">
        Words explained
      </h2>
      <p className="text-sm text-brand-smoke mb-6">
        No jargon — just plain-English definitions of the business terms you'll
        see around the Hub.
      </p>

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-smoke/50" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter terms…"
          className="w-full pl-11 pr-4 py-3 rounded-xl border border-brand-graphite/60 bg-brand-charcoal text-brand-cream placeholder-brand-smoke/40 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/40"
        />
      </div>

      {terms.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-7 h-7" />}
          title="No matching terms"
          description="Try searching the full Help Center instead."
          action={
            <button
              onClick={() => onJump(filter)}
              className="text-sm text-brand-accent hover:text-brand-cream transition-colors"
            >
              Search the Help Center for “{filter.trim()}”
            </button>
          }
        />
      ) : (
        <dl className="space-y-2.5">
          {terms.map((t) => (
            <div
              key={t.term}
              className="p-4 rounded-xl bg-brand-charcoal border border-brand-graphite"
            >
              <dt className="text-sm font-semibold text-brand-cream mb-1">
                {t.term}
              </dt>
              <dd className="text-sm text-brand-cloud/85 leading-relaxed">
                {t.definition}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────
function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 text-sm text-brand-accent hover:text-brand-cream transition-colors mb-6"
    >
      <ArrowLeft className="w-4 h-4" /> {label}
    </button>
  );
}

function SupportCard({
  navigate,
  compact,
}: {
  navigate: ReturnType<typeof useNavigate>;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-brand-charcoal border border-brand-graphite",
        compact ? "p-4 flex items-center gap-3" : "p-6",
      )}
    >
      <div className="w-10 h-10 rounded-lg bg-brand-accent/10 flex items-center justify-center shrink-0">
        <LifeBuoy className="w-4 h-4 text-brand-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-brand-cream">
          Still stuck?
        </p>
        <p className="text-xs text-brand-smoke">
          Message your administrator for a hand.
        </p>
      </div>
      <button
        onClick={() => navigate("/messaging")}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-accent/15 text-brand-accent text-xs hover:bg-brand-accent/25 transition-colors shrink-0"
      >
        <MessageCircle className="w-3.5 h-3.5" /> Messages
      </button>
    </div>
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
