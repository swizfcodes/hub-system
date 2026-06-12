/**
 * FloatingLauncher — the single floating action button (bottom-right) that
 * fans out into Messages + Help. Replaces the lone help button.
 *
 *   mobile   tap to expand, tap-outside / Esc to collapse; Messages goes
 *            to the full messaging page; sits above the bottom nav
 *   desktop  expands on hover (click toggles too); Messages opens the
 *            slide-in chat dock instead of leaving the page
 *
 * The collapsed button carries the live unread count on the shared
 * urgency scale (green 1-10 / amber 11-30 / red 31+), so the pressure is
 * visible without expanding. Context-aware: the Help item is hidden on
 * /help, the Messages item on /messaging.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { HelpCircle, MessageCircle, MessageSquare, X } from "lucide-react";
import { HUB_MODULES } from "@lib/constants/modules";
import { useIsDesktop } from "@hooks/useMediaQuery";
import { useUnreadTotal } from "@hooks/useUnreadTotal";
import { useChatDockStore } from "@stores/useChatDockStore";
import {
  unreadTone,
  formatUnread,
  UNREAD_TONE_CLASS,
} from "@lib/constants/unread";
import { cn } from "@lib/cn";

export function FloatingLauncher() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isDesktop = useIsDesktop();
  const unreadTotal = useUnreadTotal();
  const tone = unreadTone(unreadTotal);
  const toggleDock = useChatDockStore((s) => s.toggleDock);
  const dockOpen = useChatDockStore((s) => s.open);
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const showHelp = !pathname.startsWith("/help");
  const showMessages = !pathname.startsWith("/messaging");

  // Collapse when navigating away.
  useEffect(() => setExpanded(false), [pathname]);

  // Tap-outside / Escape collapses (the mobile interaction).
  useEffect(() => {
    if (!expanded) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setExpanded(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  // The open dock has its own close affordances — keep the corner clear.
  if (dockOpen) return null;
  if (!showHelp && !showMessages) return null;

  const moduleKey = resolveModule(pathname);
  const helpLabel = moduleKey
    ? `Help: ${HUB_MODULES.find((m) => m.key === moduleKey)?.label || moduleKey}`
    : "Help Center";

  function openHelp() {
    setExpanded(false);
    navigate(moduleKey ? `/help?module=${moduleKey}` : "/help");
  }

  function openMessages() {
    setExpanded(false);
    if (isDesktop) toggleDock();
    else navigate("/messaging");
  }

  return (
    <div
      ref={rootRef}
      data-chat-dock-keep
      className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 flex flex-col items-center gap-2"
      onMouseEnter={isDesktop ? () => setExpanded(true) : undefined}
      onMouseLeave={isDesktop ? () => setExpanded(false) : undefined}
    >
      {expanded && (
        <div className="flex flex-col items-center gap-2 animate-fade-in">
          {showMessages && (
            <button
              onClick={openMessages}
              aria-label="Messages"
              title={
                unreadTotal > 0
                  ? `Messages — ${unreadTotal} unread`
                  : "Messages"
              }
              className="relative flex h-12 w-12 items-center justify-center rounded-full border border-brand-graphite bg-brand-charcoal text-brand-cream shadow-lg transition-all hover:scale-105 hover:border-brand-accent/40 hover:text-brand-accent"
            >
              <MessageCircle className="h-5 w-5" />
              {tone && (
                <span
                  className={cn(
                    "absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-brand-black px-1 text-[10px] font-bold leading-none",
                    UNREAD_TONE_CLASS[tone],
                  )}
                >
                  {formatUnread(unreadTotal)}
                </span>
              )}
            </button>
          )}
          {showHelp && (
            <button
              onClick={openHelp}
              aria-label="Help"
              title={helpLabel}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-brand-graphite bg-brand-charcoal text-brand-cream shadow-lg transition-all hover:scale-105 hover:border-brand-accent/40 hover:text-brand-accent"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Close quick actions" : "Open quick actions"}
        aria-expanded={expanded}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-brand-accent text-brand-black shadow-lg transition-all hover:scale-105 hover:shadow-xl"
      >
        {expanded ? (
          <X className="h-5 w-5" />
        ) : (
          <MessageSquare className="h-5 w-5" />
        )}
        {!expanded && tone && (
          <span
            className={cn(
              "absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-brand-black px-1 text-[10px] font-bold leading-none",
              UNREAD_TONE_CLASS[tone],
            )}
          >
            {formatUnread(unreadTotal)}
          </span>
        )}
      </button>
    </div>
  );
}

/** Maps the current URL path to a module key for context-aware help. */
function resolveModule(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;

  const directMatch = HUB_MODULES.find((m) => m.route === `/${segment}`);
  if (directMatch) return directMatch.key;

  const aliases: Record<string, string> = {
    procurement: "purchasing",
    "sales-campaigns": "sales-campaigns",
    "retail-partners": "retail-partners",
  };
  if (aliases[segment]) return aliases[segment];

  return null;
}
