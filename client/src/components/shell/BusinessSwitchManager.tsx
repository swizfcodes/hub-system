import { useBranding } from "@/providers/ThemeProvider";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useBusinessSwitchStore } from "@stores/useBusinessSwitchStore";
import { useBusinessStore } from "@stores/useBusinessStore";

/** How long the guarded switch takes — gives every screen time to refetch
 *  in the new context behind the blur. */
const SWITCH_MS = 5000;

/**
 * Mounted once in AppShell. Renders the "are you sure?" confirmation and the
 * full-screen blur + loading overlay, and performs the actual context flip and
 * cache wipe when the user confirms.
 */
export function BusinessSwitchManager() {
  const { platform } = useBranding();
  const qc = useQueryClient();
  const setActive = useBusinessStore((s) => s.setActive);
  const { phase, fromName, toName, toKey, accent, cancel, begin, finish } =
    useBusinessSwitchStore();
  const [progress, setProgress] = useState(0);

  // When the user confirms (phase → 'switching'): flip the active business so
  // every subsequent request carries the new X-Business-Line header, wipe the
  // React Query cache so all mounted screens refetch fresh data for the new
  // context, then run the timed progress and lift the overlay.
  useEffect(() => {
    if (phase !== "switching" || !toKey) return;

    setActive(toKey);
    qc.clear();

    setProgress(0);
    const startedAt = Date.now();
    const tick = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - startedAt) / SWITCH_MS) * 100);
      setProgress(pct);
      if (pct >= 100) clearInterval(tick);
    }, 60);
    const done = setTimeout(() => finish(), SWITCH_MS);

    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, toKey]);

  if (phase === "idle") return null;

  if (phase === "confirm") {
    return createPortal(
      <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-brand-black/70 backdrop-blur-md"
          onClick={cancel}
        />
        <div className="relative w-full max-w-md rounded-3xl border border-brand-graphite bg-brand-charcoal shadow-modal p-7 animate-scale-in">
          <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-4">
            <RefreshCw className="w-3.5 h-3.5" /> Switch business context
          </div>
          <h2 className="font-display font-light text-2xl text-brand-cream mb-3">
            Switch to {toName}?
          </h2>
          <div className="flex items-center gap-2 text-sm text-brand-cloud mb-2">
            <span className="px-2.5 py-1 rounded-lg bg-brand-graphite text-brand-cream">
              {fromName}
            </span>
            <ArrowRight className="w-4 h-4 text-brand-smoke" />
            <span
              className="px-2.5 py-1 rounded-lg text-brand-black font-semibold"
              style={{ background: accent }}
            >
              {toName}
            </span>
          </div>
          <p className="text-sm text-brand-smoke leading-relaxed mb-6">
            The whole app will reload its data for{" "}
            <strong className="text-brand-cloud">{toName}</strong>. Anything
            unsaved in {fromName} should be saved first. This takes a few
            seconds.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={cancel}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-brand-cloud hover:text-brand-cream hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={begin}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-brand-black transition-all hover:-translate-y-0.5"
              style={{ background: accent }}
            >
              Yes, switch
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // phase === 'switching' — full-screen blur + branded loader
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-brand-black/80 backdrop-blur-xl animate-fade-in">
      <div
        className="w-[120px] h-[120px] rounded-full bg-brand-black border flex items-center justify-center animate-splash-pulse shadow-glow-md p-4 overflow-hidden"
        style={{ borderColor: `${accent}80` }}
      >
        {platform.logo_light_url ? (
          <img
            src={platform.logo_light_url}
            alt={platform.product_name}
            className="w-full h-full object-contain"
          />
        ) : (
          <span className="font-display text-brand-accent text-5xl">
            {(platform.product_name || "H").charAt(0)}
          </span>
        )}
      </div>

      <div className="mt-9 flex items-center gap-3 text-lg font-display font-light">
        <span className="text-brand-cloud">{fromName}</span>
        <ArrowRight className="w-5 h-5 text-brand-smoke" />
        <span style={{ color: accent }}>{toName}</span>
      </div>
      <p className="mt-2 text-xs tracking-widest uppercase text-brand-smoke">
        Switching business context
      </p>

      <div className="w-[220px] h-[3px] bg-brand-graphite rounded-sm mt-8 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#8A6A30] via-brand-accent to-[#D9BC87] rounded-sm transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="font-display italic font-light text-sm text-brand-smoke mt-6 tracking-wide">
        Loading {toName} data…
      </p>
    </div>,
    document.body,
  );
}
