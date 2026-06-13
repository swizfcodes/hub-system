/**
 * PriorityAppGrid — the decongested Command Centre app menu.
 *
 * Top: the user's resolved top-10 (useNavPriority ladder), drag-to-reorder,
 * hover pin-off. Bottom: a "More" tile that inline-expands every other
 * permitted module, grouped by category, each with a "pin to top" action.
 * Pinning when the grid is full auto-drops the last tile (with a toast).
 */
import { useState } from "react";
import {
  LayoutGrid as MoreIcon,
  Pin,
  PinOff,
  RotateCcw,
  ChevronUp,
} from "lucide-react";
import { AppTile } from "./AppTile";
import { useNavPriority } from "@hooks/useNavPriority";
import { HUB_MODULES, type AppModule } from "@lib/constants/modules";
import type { UnreadTone } from "@lib/constants/unread";
import { showToast } from "@hooks/useToast";
import { cn } from "@lib/cn";

interface Props {
  badges?: Record<string, number | string | undefined>;
  /** Optional urgency colour per badgeKey (unread scale). */
  badgeTones?: Record<string, UnreadTone | undefined>;
}

const GROUP_LABELS: Record<AppModule["group"], string> = {
  main: "Core",
  ops: "Operations",
  finance: "Finance",
  people: "People",
  system: "System",
};
const GROUP_ORDER: AppModule["group"][] = [
  "main",
  "ops",
  "finance",
  "people",
  "system",
];

function labelFor(key: string): string {
  return HUB_MODULES.find((m) => m.key === key)?.label ?? key;
}

export function PriorityAppGrid({ badges = {}, badgeTones = {} }: Props) {
  const {
    topModules,
    moreModules,
    isCustomized,
    pin,
    unpin,
    reorder,
    resetToDefault,
  } = useNavPriority();

  const [moreOpen, setMoreOpen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  // Aggregate numeric badges of hidden modules onto the More tile.
  const moreBadge = moreModules.reduce((sum, m) => {
    const v = m.badgeKey ? badges[m.badgeKey] : undefined;
    return sum + (typeof v === "number" ? v : 0);
  }, 0);

  function handleDrop(targetKey: string) {
    if (!dragKey || dragKey === targetKey) return;
    const keys = topModules.map((m) => m.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    keys.splice(from, 1);
    keys.splice(to, 0, dragKey);
    reorder(keys);
  }

  function handlePin(key: string) {
    const dropped = pin(key);
    if (dropped) {
      showToast.info(
        `${labelFor(key)} pinned`,
        `${labelFor(dropped)} moved to More (top grid holds 10).`,
      );
    } else {
      showToast.success(`${labelFor(key)} pinned to your top grid`);
    }
  }

  return (
    <div>
      {/* ── Top 10 (drag to reorder, hover to unpin) ── */}
      <div className="grid gap-4 sm:gap-5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 stagger">
        {topModules.map((m, i) => (
          <div
            key={m.key}
            className={cn(
              "relative group/slot",
              overKey === m.key && dragKey !== m.key && "scale-[1.03]",
              dragKey === m.key && "opacity-40",
            )}
            draggable={m.key !== "dashboard"}
            onDragStart={() => setDragKey(m.key)}
            onDragEnd={() => {
              setDragKey(null);
              setOverKey(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverKey(m.key);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(m.key);
              setDragKey(null);
              setOverKey(null);
            }}
          >
            <AppTile
              module={m}
              index={i}
              badge={m.badgeKey ? badges[m.badgeKey] : undefined}
              tone={m.badgeKey ? badgeTones[m.badgeKey] : undefined}
            />
            {m.key !== "dashboard" && (
              <button
                onClick={() => unpin(m.key)}
                title="Move to More"
                aria-label={`Move ${m.label} to More`}
                className="absolute top-2 left-2 p-1.5 rounded-lg bg-brand-black/70 text-brand-smoke opacity-0 group-hover/slot:opacity-100 hover:text-brand-accent transition-all z-10"
              >
                <PinOff className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        {/* ── "More" tile ── */}
        {moreModules.length > 0 && (
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className={cn(
              "group relative flex flex-col items-center justify-center text-center gap-3 p-5 sm:p-6 rounded-2xl",
              "bg-brand-charcoal/30 border border-dashed border-brand-graphite transition-all duration-300",
              "hover:-translate-y-1 hover:border-brand-accent/40 animate-tile-in",
            )}
            aria-expanded={moreOpen}
          >
            {moreBadge > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[24px] h-6 px-2 rounded-full text-[0.65rem] font-bold flex items-center justify-center border-2 border-brand-charcoal bg-brand-cream text-brand-black">
                {moreBadge > 99 ? "99+" : moreBadge}
              </span>
            )}
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-brand-black/40 flex items-center justify-center text-brand-smoke group-hover:text-brand-accent transition-colors">
              {moreOpen ? (
                <ChevronUp className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={1.5} />
              ) : (
                <MoreIcon className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={1.5} />
              )}
            </div>
            <div className="space-y-0.5">
              <div className="font-semibold text-xs sm:text-sm text-brand-cream">
                {moreOpen ? "Less" : "More"}
              </div>
              <div className="text-[0.65rem] sm:text-xs text-brand-smoke">
                {moreModules.length} more app
                {moreModules.length > 1 ? "s" : ""}
              </div>
            </div>
          </button>
        )}
      </div>

      {/* ── Inline-expanded "More" section, grouped ── */}
      {moreOpen && moreModules.length > 0 && (
        <div className="mt-8 animate-fade-in">
          {GROUP_ORDER.map((g) => {
            const items = moreModules.filter((m) => m.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="text-[0.6rem] tracking-[0.18em] uppercase text-brand-smoke">
                    {GROUP_LABELS[g]}
                  </div>
                  <div className="flex-1 h-px bg-brand-graphite/60" />
                </div>
                <div className="grid gap-4 sm:gap-5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {items.map((m, i) => (
                    <div key={m.key} className="relative group/slot">
                      <AppTile
                        module={m}
                        index={i}
                        badge={m.badgeKey ? badges[m.badgeKey] : undefined}
                        tone={m.badgeKey ? badgeTones[m.badgeKey] : undefined}
                      />
                      <button
                        onClick={() => handlePin(m.key)}
                        title="Pin to top grid"
                        aria-label={`Pin ${m.label} to top grid`}
                        className="absolute top-2 left-2 p-1.5 rounded-lg bg-brand-black/70 text-brand-smoke opacity-0 group-hover/slot:opacity-100 hover:text-brand-accent transition-all z-10"
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {isCustomized && (
            <button
              onClick={() => {
                resetToDefault();
                showToast.info("Navigation reset to your role's default");
              }}
              className="flex items-center gap-1.5 text-[0.7rem] text-brand-smoke hover:text-brand-accent transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to default layout
            </button>
          )}
        </div>
      )}
    </div>
  );
}
