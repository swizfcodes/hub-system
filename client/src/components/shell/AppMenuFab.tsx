import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { useIsDesktop } from "@hooks/useMediaQuery";
import { useUiStore } from "@stores/useUiStore";
import { cn } from "@lib/cn";

/**
 * Floating "← App Menu" button (desktop only). Inspired by the demo's
 * #back-to-apps pattern, but elevated with our gold accent + cream pill.
 * On mobile, the App Menu lives in the bottom nav (no FAB needed).
 *
 * Draggable: the button defaults to bottom-centre, but Smart Comm / the chat
 * dock can sit over that spot and cover the message input. Grab the 3-dot
 * grip (or anywhere on the pill) and drag to reposition — the offset is
 * persisted, so it stays put across reloads. A plain click still navigates
 * back to the App Menu; only a real drag suppresses navigation.
 */

// Movement (px) past which a pointer interaction counts as a drag, not a click.
const DRAG_THRESHOLD = 4;

export function AppMenuFab() {
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const offset = useUiStore((s) => s.appMenuFabOffset);
  const setOffset = useUiStore((s) => s.setAppMenuFabOffset);

  const [dragging, setDragging] = useState(false);
  // Mutable drag bookkeeping that must not trigger re-renders mid-drag.
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    moved: boolean;
  } | null>(null);

  // Don't show on Hub home or login.
  if (!isDesktop) return null;
  if (pathname === "/" || pathname === "/hub" || pathname === "/login")
    return null;

  // Keep the button on-screen even if a previous offset would push it out of
  // view (e.g. after resizing the window).
  function clamp(x: number, y: number, el: HTMLElement | null) {
    if (typeof window === "undefined" || !el) return { x, y };
    const rect = el.getBoundingClientRect();
    // The element's untransformed centre sits at bottom-8, horizontally centred.
    const baseLeft = window.innerWidth / 2 - rect.width / 2;
    const baseTop = window.innerHeight - 32 - rect.height; // bottom-8 = 2rem
    const margin = 8;
    const minX = margin - baseLeft;
    const maxX = window.innerWidth - margin - rect.width - baseLeft;
    const minY = margin - baseTop;
    const maxY = window.innerHeight - margin - rect.height - baseTop;
    return {
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, minY), maxY),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Only left button / primary pointer.
    if (e.button !== 0) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
      moved: false,
    };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    const next = clamp(d.baseX + dx, d.baseY + dy, e.currentTarget);
    setOffset(next);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
    setDragging(false);
  }

  function onClick() {
    // Suppress navigation if this pointer sequence was a drag.
    if (drag.current?.moved) return;
    navigate("/");
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Return to App Menu (drag to reposition)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate("/");
        }
      }}
      style={{
        transform: `translate3d(calc(-50% + ${offset.x}px), ${offset.y}px, 0)`,
      }}
      className={cn(
        "hidden lg:inline-flex fixed bottom-8 left-1/2 z-40 select-none touch-none items-center gap-2 pl-3 pr-5 py-3 rounded-full bg-brand-cream text-brand-black font-semibold text-xs uppercase tracking-widest shadow-lift transition-shadow group",
        dragging
          ? "cursor-grabbing shadow-glow-md"
          : "cursor-grab hover:shadow-glow-md",
      )}
    >
      {/* Drag grip — three dots signalling the pill can be displaced. */}
      <span
        aria-hidden="true"
        className="flex flex-col items-center justify-center gap-[3px] -ml-1 mr-0.5 opacity-50 group-hover:opacity-80 transition-opacity"
      >
        <span className="block h-1 w-1 rounded-full bg-brand-black" />
        <span className="block h-1 w-1 rounded-full bg-brand-black" />
        <span className="block h-1 w-1 rounded-full bg-brand-black" />
      </span>
      <LayoutGrid className="w-4 h-4 text-brand-accent-dim group-hover:text-brand-accent transition-colors" />
      <span>App Menu</span>
    </div>
  );
}
