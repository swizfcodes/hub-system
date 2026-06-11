import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { LogActivityModal } from "../modals/LogActivityModal";
import {
  CRM_ACTIVITY_TYPES,
  QUICK_TEMPLATE_ORDER,
} from "@lib/constants/crmActivityTypes";
import type { ActivityType } from "@typedefs/crm";
import { cn } from "@lib/cn";

interface Props {
  dealId: string;
}

/**
 * Floating "Log activity" button.
 *
 * Desktop: hovering the button reveals 5 quick-template chips fanning out.
 * Mobile: tapping opens the modal. The modal honours the chip that was clicked.
 * Keyboard shortcuts (desktop): C / T / E / V / N open the matching modal.
 */
export function LogActivityFab({ dealId }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [type, setType] = useState<ActivityType>("call");
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Ignore when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      const key = e.key.toUpperCase();
      const match = QUICK_TEMPLATE_ORDER.find(
        (k) => CRM_ACTIVITY_TYPES[k].shortcut === key,
      );
      if (match) {
        setType(match);
        setModalOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const open = (t: ActivityType) => {
    setType(t);
    setModalOpen(true);
    setHovered(false);
  };

  return (
    <>
      <div
        className="fixed bottom-24 lg:bottom-12 right-6 z-40"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Quick template chips */}
        <div
          className={cn(
            "flex flex-col-reverse items-end gap-2 mb-3 transition-all",
            hovered
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2 pointer-events-none",
          )}
        >
          {QUICK_TEMPLATE_ORDER.map((t) => {
            const m = CRM_ACTIVITY_TYPES[t];
            const Icon = m.icon;
            return (
              <button
                key={t}
                onClick={() => open(t)}
                className="inline-flex items-center gap-2 pl-2 pr-3 py-2 rounded-full bg-brand-charcoal border border-brand-graphite shadow-card hover:border-brand-accent hover:shadow-glow-sm transition-all"
              >
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: `${m.color}1F`, color: m.color }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs font-semibold text-brand-cream whitespace-nowrap">
                  {m.label}
                </span>
                {m.shortcut && (
                  <kbd className="hidden lg:inline text-[0.55rem] px-1 py-0.5 rounded bg-brand-black/40 text-brand-smoke">
                    {m.shortcut}
                  </kbd>
                )}
              </button>
            );
          })}
        </div>

        {/* Main FAB */}
        <button
          onClick={() => open("call")}
          className="w-14 h-14 rounded-full bg-brand-accent text-brand-black flex items-center justify-center shadow-glow-md hover:scale-105 hover:shadow-glow-lg transition-all"
          aria-label="Log activity"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      <LogActivityModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        dealId={dealId}
        defaultType={type}
      />
    </>
  );
}
