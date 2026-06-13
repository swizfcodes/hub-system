/**
 * PriorityAppGrid — the decongested Command Centre app menu.
 *
 * Top: the user's resolved top-10 (useNavPriority ladder), reorderable.
 * Bottom: a "More" tile that inline-expands every other permitted module,
 * grouped by category, each with a "pin to top" action. Pinning when the
 * grid is full auto-drops the last tile (with a toast).
 *
 * Reordering works two ways, picked by pointer type:
 *   • Desktop (fine pointer)  → native HTML5 drag-and-drop, hover pin-off.
 *   • Mobile (coarse pointer) → iPhone-style "jiggle" edit mode: long-press
 *     any tile to enter edit mode (all tiles wobble), then drag with your
 *     finger to reorder. The pin-off button is always visible while editing.
 *     Tap anywhere outside the grid — or the "Done" button — to finish.
 *
 * The two paths never collide: native `draggable` is disabled on coarse
 * pointers (it was the cause of the "hold = freeze" bug), and the long-press
 * logic only runs for `pointerType === "touch"`.
 */
import { useEffect, useRef, useState } from "react";
import {
  LayoutGrid as MoreIcon,
  Pin,
  PinOff,
  RotateCcw,
  ChevronUp,
  Check,
  GripVertical,
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

const LONG_PRESS_MS = 420;
const MOVE_CANCEL_PX = 10;

function labelFor(key: string): string {
  return HUB_MODULES.find((m) => m.key === key)?.label ?? key;
}

/** Move `key` so it sits where `targetKey` currently is. */
function moveKeyTo(order: string[], key: string, targetKey: string): string[] {
  const from = order.indexOf(key);
  const to = order.indexOf(targetKey);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
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

  // ── Desktop native drag-and-drop ──
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  // ── Mobile jiggle / touch reorder ──
  // Coarse pointer == touch-first device. Computed once; the interaction model
  // never needs to flip mid-session.
  const [isCoarse] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches,
  );
  const [editMode, setEditMode] = useState(false);
  // While dragging by touch we keep a local working order so the grid can
  // shuffle live without spamming the save mutation (committed on release).
  const [liveOrder, setLiveOrder] = useState<string[] | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ dx: number; dy: number } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const drag = useRef<{
    key: string;
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);

  // Aggregate numeric badges of hidden modules onto the More tile.
  const moreBadge = moreModules.reduce((sum, m) => {
    const v = m.badgeKey ? badges[m.badgeKey] : undefined;
    return sum + (typeof v === "number" ? v : 0);
  }, 0);

  // The order we actually render: the live working copy while touch-dragging,
  // otherwise whatever the priority hook resolved.
  const baseKeys = topModules.map((m) => m.key);
  const orderKeys = liveOrder ?? baseKeys;
  const moduleByKey = new Map(topModules.map((m) => [m.key, m]));
  const orderedTop = orderKeys
    .map((k) => moduleByKey.get(k))
    .filter((m): m is AppModule => !!m);

  // Once the persisted order catches up to our live copy, drop the override
  // so we don't render a stale snapshot.
  useEffect(() => {
    if (!liveOrder || activeKey) return;
    if (sameOrder(baseKeys, liveOrder)) setLiveOrder(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topModules, liveOrder, activeKey]);

  // Leave edit mode on a tap outside the grid (or Escape).
  useEffect(() => {
    if (!editMode) return;
    function onDocPointerDown(e: PointerEvent) {
      if (drag.current) return; // mid-drag — ignore
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setEditMode(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEditMode(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [editMode]);

  function clearLongPress() {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  // Topmost top-grid slot under the point, ignoring the lifted tile itself
  // (which floats above everything while being dragged).
  function keyAtPoint(x: number, y: number, exclude: string): string | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const slot = (el as Element).closest?.("[data-slot-key]");
      const k = slot?.getAttribute("data-slot-key");
      if (k && k !== exclude) return k;
    }
    return null;
  }

  function updateGhost(x: number, y: number, key: string) {
    const el = gridRef.current?.querySelector<HTMLElement>(
      `[data-slot-key="${CSS.escape(key)}"]`,
    );
    if (!el) return;
    const r = el.getBoundingClientRect();
    setGhost({ dx: x - (r.left + r.width / 2), dy: y - (r.top + r.height / 2) });
  }

  // `el` and coords are passed explicitly — a long press fires from a timer,
  // by which point React has already nulled the synthetic event's currentTarget.
  function beginTouchDrag(
    el: HTMLElement,
    pointerId: number,
    x: number,
    y: number,
    key: string,
  ) {
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* capture unsupported — the lifted tile tracks the finger regardless */
    }
    drag.current = { key, pointerId, startX: x, startY: y, dragging: true };
    setActiveKey(key);
    setLiveOrder(baseKeys);
    updateGhost(x, y, key);
  }

  function onTilePointerDown(e: React.PointerEvent, key: string) {
    if (e.pointerType !== "touch") return; // desktop → native DnD
    const el = e.currentTarget as HTMLElement;
    const { pointerId, clientX, clientY } = e;
    drag.current = {
      key,
      pointerId,
      startX: clientX,
      startY: clientY,
      dragging: false,
    };
    // Already jiggling? Grabbing a (movable) tile starts a drag immediately.
    if (editMode) {
      if (key !== "dashboard") beginTouchDrag(el, pointerId, clientX, clientY, key);
      return;
    }
    // Otherwise a long press arms edit mode (and a drag for movable tiles).
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      navigator.vibrate?.(12);
      setEditMode(true);
      if (key !== "dashboard")
        beginTouchDrag(el, pointerId, clientX, clientY, key);
    }, LONG_PRESS_MS);
  }

  function onTilePointerMove(e: React.PointerEvent) {
    const info = drag.current;
    if (!info || info.pointerId !== e.pointerId) return;
    if (!info.dragging) {
      // Still waiting on the long press — a real move means "scroll", so bail.
      if (
        Math.abs(e.clientX - info.startX) > MOVE_CANCEL_PX ||
        Math.abs(e.clientY - info.startY) > MOVE_CANCEL_PX
      ) {
        clearLongPress();
        drag.current = null;
      }
      return;
    }
    e.preventDefault();
    updateGhost(e.clientX, e.clientY, info.key);
    const over = keyAtPoint(e.clientX, e.clientY, info.key);
    if (over && over !== "dashboard") {
      setLiveOrder((prev) => moveKeyTo(prev ?? baseKeys, info.key, over));
    }
  }

  function endTouchDrag(commit: boolean) {
    const info = drag.current;
    drag.current = null;
    clearLongPress();
    if (!info?.dragging) return;
    if (commit && liveOrder && !sameOrder(liveOrder, baseKeys)) {
      reorder(liveOrder);
    } else if (!commit) {
      setLiveOrder(null);
    }
    setActiveKey(null);
    setGhost(null);
  }

  function onTilePointerUp(e: React.PointerEvent) {
    const info = drag.current;
    if (info?.dragging) e.preventDefault();
    endTouchDrag(true);
  }

  function onTilePointerCancel() {
    endTouchDrag(false);
  }

  function handleDrop(targetKey: string) {
    if (!dragKey || dragKey === targetKey) return;
    const keys = baseKeys.slice();
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
    <div ref={rootRef}>
      {/* ── Edit-mode banner (mobile jiggle) ── */}
      {editMode && (
        <div className="flex items-center justify-between gap-3 mb-4 px-4 py-2.5 rounded-xl bg-brand-accent/10 border border-brand-accent/30 animate-fade-in">
          <span className="flex items-center gap-2 text-xs text-brand-cream">
            <GripVertical className="w-3.5 h-3.5 text-brand-accent shrink-0" />
            Drag to rearrange — tap the pin to move an app to More.
          </span>
          <button
            onClick={() => setEditMode(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-accent text-brand-black text-xs font-semibold hover:brightness-110 transition-all shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
            Done
          </button>
        </div>
      )}

      {/* ── Top 10 (drag to reorder, hover/edit to unpin) ── */}
      <div
        ref={gridRef}
        className="grid gap-4 sm:gap-5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 stagger"
      >
        {orderedTop.map((m, i) => {
          const isActive = activeKey === m.key;
          const jiggling = editMode && !isActive && m.key !== "dashboard";
          return (
            <div
              key={m.key}
              data-slot-key={m.key}
              className={cn(
                "relative group/slot select-none",
                overKey === m.key && dragKey !== m.key && "scale-[1.03]",
                dragKey === m.key && "opacity-40",
                jiggling && "animate-jiggle",
                isActive && "z-30",
              )}
              style={
                isActive && ghost
                  ? {
                      transform: `translate(${ghost.dx}px, ${ghost.dy}px) scale(1.06)`,
                      transition: "none",
                      touchAction: "none",
                      filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.55))",
                    }
                  : editMode
                    ? {
                        animationDelay: `${(i % 4) * 55}ms`,
                        touchAction: "none",
                      }
                    : undefined
              }
              draggable={!isCoarse && m.key !== "dashboard"}
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
              onPointerDown={(e) => onTilePointerDown(e, m.key)}
              onPointerMove={onTilePointerMove}
              onPointerUp={onTilePointerUp}
              onPointerCancel={onTilePointerCancel}
              onContextMenu={(e) => {
                if (isCoarse) e.preventDefault();
              }}
            >
              <AppTile
                module={m}
                index={i}
                badge={m.badgeKey ? badges[m.badgeKey] : undefined}
                tone={m.badgeKey ? badgeTones[m.badgeKey] : undefined}
                navDisabled={editMode}
              />
              {m.key !== "dashboard" && (
                <button
                  onClick={() => unpin(m.key)}
                  title="Move to More"
                  aria-label={`Move ${m.label} to More`}
                  className={cn(
                    "absolute top-2 left-2 p-1.5 rounded-lg bg-brand-black/70 text-brand-smoke hover:text-brand-accent transition-all z-10",
                    editMode
                      ? "opacity-100"
                      : "opacity-0 group-hover/slot:opacity-100",
                  )}
                >
                  <PinOff className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}

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

      {/* Discoverability hint for touch users. */}
      {isCoarse && !editMode && topModules.length > 1 && (
        <p className="mt-3 text-center text-[0.65rem] text-brand-smoke/70">
          Press and hold an app to rearrange your grid.
        </p>
      )}

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
