// Live theme preview. The draft tokens are applied as CSS variables
// on the wrapper, so every tailwind brand-* class inside renders
// with the DRAFT theme while the rest of the app keeps the active
// one — no global side effects until Save.

import { Star, Search, Bell, TrendingUp } from "lucide-react";
import { themeStyle, type ThemeTokens } from "@lib/theme/derive";

export function ThemePreview({
  theme,
  productName,
  tagline,
  fontDisplay,
  fontBody,
}: {
  theme: ThemeTokens;
  productName: string;
  tagline?: string | null;
  fontDisplay: string;
  fontBody: string;
}) {
  const nameWords = (productName || "Hub").split(" ");
  const tail = nameWords.length > 1 ? nameWords.pop() : "";
  const head = nameWords.join(" ");

  return (
    <div
      style={{
        ...themeStyle(theme),
        ["--font-display" as string]: `"${fontDisplay}"`,
        ["--font-body" as string]: `"${fontBody}"`,
      }}
      className="rounded-2xl overflow-hidden border border-brand-graphite bg-brand-black font-body select-none"
      aria-label="Theme preview"
    >
      {/* Topbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-brand-charcoal border-b border-brand-graphite">
        <span className="font-display text-brand-cream text-base tracking-wide">
          {head}
          {tail && (
            <>
              {" "}
              <span className="text-brand-accent">{tail}</span>
            </>
          )}
        </span>
        <span className="flex items-center gap-2 text-brand-smoke">
          <Search className="w-3.5 h-3.5" />
          <Bell className="w-3.5 h-3.5" />
          <span className="w-6 h-6 rounded-full bg-brand-accent/15 text-brand-accent text-[0.6rem] flex items-center justify-center font-semibold">
            AO
          </span>
        </span>
      </div>

      <div className="p-4 space-y-3">
        {tagline && (
          <p className="font-display italic text-sm text-brand-cloud">
            {tagline}
          </p>
        )}

        {/* KPI card */}
        <div className="p-3.5 rounded-xl border border-brand-graphite bg-brand-charcoal/60">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-brand-accent/15 text-brand-accent">
            <TrendingUp className="w-3.5 h-3.5" />
          </span>
          <div className="text-[0.55rem] uppercase tracking-widest text-brand-smoke mt-2">
            Lifetime spend
          </div>
          <div className="text-lg font-display text-brand-cream tabular-nums">
            ₦1,250,000
          </div>
          <div className="text-[0.6rem] text-brand-smoke mt-0.5">
            5 purchases · avg ₦250,000
          </div>
        </div>

        {/* Chips + badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-2.5 py-1 rounded-full bg-brand-accent text-brand-black text-[0.6rem] font-semibold uppercase tracking-wide">
            Primary
          </span>
          <span className="px-2.5 py-1 rounded-full border border-brand-graphite text-brand-smoke text-[0.6rem] uppercase tracking-wide">
            Neutral
          </span>
          <span className="px-2 py-0.5 rounded-md border border-accent2/30 bg-accent2/15 text-accent2 text-[0.6rem]">
            Active
          </span>
          <span className="px-2 py-0.5 rounded-md border border-accent3/30 bg-accent3/15 text-accent3 text-[0.6rem]">
            Win back
          </span>
          <span className="px-2 py-0.5 rounded-md border border-state-warn/30 bg-state-warn/15 text-state-warn text-[0.6rem]">
            Overdue
          </span>
          <Star className="w-3.5 h-3.5 text-brand-accent fill-brand-accent" />
        </div>

        {/* Row sample */}
        <div className="flex items-center gap-2.5 p-2.5 rounded-xl border border-brand-graphite bg-brand-charcoal/60">
          <span className="w-8 h-8 rounded-full bg-brand-accent/15 text-brand-accent text-[0.6rem] font-semibold flex items-center justify-center shrink-0">
            CN
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs text-brand-cream truncate">
              Client Name
            </span>
            <span className="block text-[0.6rem] text-brand-smoke truncate">
              Last purchase 2 weeks ago · 1,200 pts
            </span>
          </span>
          <span className="text-xs font-mono text-brand-accent tabular-nums">
            ₦455,000
          </span>
        </div>

        {/* Light surface sample */}
        <div className="p-3 rounded-xl bg-surface-light">
          <div className="text-xs font-medium text-text-on-light">
            Light surface (modals & forms)
          </div>
          <div className="text-[0.6rem] text-text-on-light-muted mt-0.5">
            Secondary text on light surfaces
          </div>
        </div>
      </div>
    </div>
  );
}
