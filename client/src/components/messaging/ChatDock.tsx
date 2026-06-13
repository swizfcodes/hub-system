/**
 * ChatDock — Gmail-style slide-in chat panel, desktop only. Opened from
 * the floating launcher so a reply never costs the page you're on: the
 * dock overlays the right edge, reusing the real ChannelList and
 * MessageThread, and closes on Esc / click-outside leaving the page
 * untouched. The expand button jumps to the full Messaging page.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, Maximize2, X } from "lucide-react";
import { ChannelList } from "./ChannelList";
import { MessageThread } from "./MessageThread";
import { useChatDockStore } from "@stores/useChatDockStore";
import { useAuthStore } from "@stores/useAuthStore";
import { useIsDesktop } from "@hooks/useMediaQuery";
import type { InboxTabKey } from "@lib/constants/messagingConstants";
import type { Channel } from "@typedefs/messaging";

export function ChatDock() {
  const isDesktop = useIsDesktop();
  const open = useChatDockStore((s) => s.open);
  const channel = useChatDockStore((s) => s.channel);
  const closeDock = useChatDockStore((s) => s.closeDock);
  const setChannel = useChatDockStore((s) => s.setChannel);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [activeTab, setActiveTab] = useState<InboxTabKey>("all");
  const rootRef = useRef<HTMLDivElement>(null);

  // Redundant on the full messaging page.
  useEffect(() => {
    if (open && pathname.startsWith("/messaging")) closeDock();
  }, [open, pathname, closeDock]);

  // Esc closes (unless typing in the composer); click-outside closes but
  // ignores the launcher so its toggle doesn't fight the dock.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) return;
      closeDock();
    }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (rootRef.current?.contains(t)) return;
      if (t.closest("[data-chat-dock-keep]")) return;
      closeDock();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, closeDock]);

  if (!isDesktop || !open) return null;

  function expandToFullPage() {
    const target = channel
      ? `/messaging?channel=${channel.channel_id}`
      : "/messaging";
    closeDock();
    navigate(target);
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-y-0 right-0 z-40 flex w-[400px] flex-col border-l border-brand-graphite bg-brand-black shadow-2xl animate-fade-in"
      role="complementary"
      aria-label="Chat dock"
    >
      {/* Dock header */}
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-3">
        {channel && (
          <button
            onClick={() => setChannel(null)}
            title="All conversations"
            className="rounded-lg p-1 text-brand-smoke transition-colors hover:text-brand-cream"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <p className="flex-1 truncate text-sm font-semibold text-brand-cream">
          Messages
        </p>
        <button
          onClick={expandToFullPage}
          title="Open full Messaging"
          className="rounded-lg p-1 text-brand-smoke transition-colors hover:text-brand-cream"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          onClick={closeDock}
          title="Close"
          className="rounded-lg p-1 text-brand-smoke transition-colors hover:text-brand-cream"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body — real chat components in a narrow shell */}
      <div className="min-h-0 flex-1">
        {channel ? (
          <MessageThread
            channel={channel}
            userId={user?.user_id}
            onResolve={(ch) => setChannel(ch as Channel)}
          />
        ) : (
          <ChannelList
            activeChannelId={null}
            activeTab={activeTab}
            onTabChange={(tab) => {
              // The email log needs the wide panel — hand over to the page.
              if (tab === "emails") expandToFullPage();
              else setActiveTab(tab);
            }}
            onSelect={(ch) => setChannel(ch)}
            onNewChannel={expandToFullPage}
            userId={user?.user_id}
          />
        )}
      </div>
    </div>
  );
}
