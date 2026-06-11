import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  X,
  Sparkles,
  Phone,
  StickyNote,
  CalendarPlus,
} from "lucide-react";
import { useIsDesktop } from "@hooks/useMediaQuery";
import { NewDealModal } from "../modals/NewDealModal";
import { LogActivityModal } from "../modals/LogActivityModal";
import { cn } from "@lib/cn";

/**
 * Mobile-first bottom-sheet quick-actions for CRM.
 * On desktop it renders as a side-pop fan FAB; on mobile it opens a
 * bottom-sheet with full-width buttons.
 *
 * Available actions:
 *   - New deal
 *   - Log call (uses last viewed deal if any; falls back to picker — placeholder)
 *   - Add note (same)
 *   - Schedule (placeholder — links to /calendar/new)
 *
 * "Log call" and "Add note" need a deal id; we surface the picker by
 * routing to /crm with a query param when no recent deal exists.
 */
export function CrmQuickActionsFab() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [newDeal, setNewDeal] = useState(false);
  const [logActivity, setLogActivity] = useState(false);
  const [lastDealId] = useState<string | null>(() =>
    localStorage.getItem("orika_last_deal_id"),
  );

  // Track last viewed deal so "log call" goes straight there
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/crm\/([a-f0-9-]{36})$/);
    if (match) localStorage.setItem("orika_last_deal_id", match[1]);
  }, []);

  const close = () => setOpen(false);
  const actions = [
    {
      key: "deal",
      label: "New deal",
      icon: Sparkles,
      onClick: () => {
        setNewDeal(true);
        close();
      },
    },
    {
      key: "call",
      label: "Log activity",
      icon: Phone,
      onClick: () => {
        if (lastDealId) {
          setLogActivity(true);
          close();
        } else {
          navigate("/crm");
          showToast();
        }
      },
    },
    {
      key: "note",
      label: "Add note",
      icon: StickyNote,
      onClick: () => {
        if (lastDealId) navigate(`/crm/${lastDealId}?tab=notes`);
        else navigate("/crm");
        close();
      },
    },
    {
      key: "schedule",
      label: "Schedule",
      icon: CalendarPlus,
      onClick: () => {
        navigate("/calendar?new=1");
        close();
      },
    },
  ];

  return (
    <>
      {/* Backdrop on mobile */}
      {!isDesktop && open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-brand-black/70 backdrop-blur-sm animate-fade-in"
          onClick={close}
        />
      )}

      {/* Mobile bottom-sheet */}
      {!isDesktop && open && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-brand-charcoal border-t border-brand-graphite rounded-t-3xl p-5 pb-safe animate-slide-up shadow-modal">
          <div className="w-12 h-1 rounded-full bg-brand-graphite mx-auto mb-4" />
          <h3 className="text-[0.7rem] tracking-widest uppercase text-brand-accent mb-3 text-center">
            Quick actions
          </h3>
          <div className="space-y-2">
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.key}
                  onClick={a.onClick}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-brand-graphite/60 hover:bg-brand-graphite text-brand-cream transition-colors"
                >
                  <span className="w-10 h-10 rounded-full bg-brand-accent/15 text-brand-accent flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="text-sm font-medium">{a.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Desktop fan-out */}
      {isDesktop && (
        <div
          className="hidden lg:flex fixed bottom-12 right-6 z-40 flex-col items-end gap-2"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <div
            className={cn(
              "flex flex-col-reverse items-end gap-2 transition-all",
              open
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-2 pointer-events-none",
            )}
          >
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.key}
                  onClick={a.onClick}
                  className="inline-flex items-center gap-2 pl-2 pr-4 py-2 rounded-full bg-brand-charcoal border border-brand-graphite shadow-card hover:border-brand-accent hover:shadow-glow-sm transition-all"
                >
                  <span className="w-7 h-7 rounded-full bg-brand-accent/15 text-brand-accent flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-xs font-semibold text-brand-cream whitespace-nowrap">
                    {a.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main FAB (mobile) */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "lg:hidden fixed bottom-20 right-5 z-50 w-14 h-14 rounded-full bg-brand-accent text-brand-black flex items-center justify-center shadow-glow-md transition-all",
          open && "rotate-45",
        )}
        aria-label={open ? "Close quick actions" : "Open quick actions"}
      >
        {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </button>

      <NewDealModal
        open={newDeal}
        onClose={() => setNewDeal(false)}
        onCreated={(id) => navigate(`/crm/${id}`)}
      />
      {lastDealId && (
        <LogActivityModal
          open={logActivity}
          onClose={() => setLogActivity(false)}
          dealId={lastDealId}
        />
      )}
    </>
  );
}

function showToast() {
  // Tiny inline helper so we don't pull sonner into a button click that's clearly informational.
  import("@hooks/useToast").then(({ showToast }) =>
    showToast.info(
      "Pick a deal first",
      "Open any deal to log a call against it.",
    ),
  );
}
