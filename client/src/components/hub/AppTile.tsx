import { useNavigate } from "react-router-dom";
import type { AppModule } from "@lib/constants/modules";
import { UNREAD_TONE_CLASS, type UnreadTone } from "@lib/constants/unread";
import { cn } from "@lib/cn";

interface Props {
  module: AppModule;
  badge?: number | string;
  /** Urgency colour override (unread scale) — defaults to the accent pill. */
  tone?: UnreadTone;
  index?: number;
}

const accentBg: Record<AppModule["accent"], string> = {
  gold: "group-hover:bg-brand-accent/[0.06]",
  rose: "group-hover:bg-accent3/[0.06]",
  sage: "group-hover:bg-accent2/[0.06]",
  mixed: "group-hover:bg-brand-accent/[0.06]",
};

const accentBorder: Record<AppModule["accent"], string> = {
  gold: "group-hover:border-brand-accent/40",
  rose: "group-hover:border-accent3/40",
  sage: "group-hover:border-accent2/40",
  mixed: "group-hover:border-brand-accent/40",
};

const accentIcon: Record<AppModule["accent"], string> = {
  gold: "text-brand-accent",
  rose: "text-accent3",
  sage: "text-accent2",
  mixed: "text-brand-accent",
};

const badgeTone: Record<AppModule["accent"], string> = {
  gold: "bg-brand-accent text-brand-black",
  rose: "bg-accent3 text-brand-cream",
  sage: "bg-accent2 text-brand-black",
  mixed: "bg-brand-cream text-brand-black",
};

export function AppTile({ module, badge, tone, index = 0 }: Props) {
  const navigate = useNavigate();
  const Icon = module.icon;

  return (
    <button
      onClick={() => navigate(module.route)}
      style={{ animationDelay: `${index * 30}ms` }}
      className={cn(
        "group relative flex flex-col items-center justify-center text-center gap-3 p-5 sm:p-6 rounded-2xl",
        "bg-brand-charcoal/60 border border-brand-graphite transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-card-lg animate-tile-in",
        accentBg[module.accent],
        accentBorder[module.accent],
      )}
    >
      {badge !== undefined && badge !== 0 && (
        <span
          className={cn(
            "absolute -top-2 -right-2 min-w-[24px] h-6 px-2 rounded-full text-[0.65rem] font-bold flex items-center justify-center border-2 border-brand-charcoal",
            tone ? UNREAD_TONE_CLASS[tone] : badgeTone[module.accent],
          )}
        >
          {badge}
        </span>
      )}
      <div
        className={cn(
          "w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-brand-black/40 flex items-center justify-center transition-transform group-hover:scale-110",
          accentIcon[module.accent],
        )}
      >
        <Icon className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={1.5} />
      </div>
      <div className="space-y-0.5">
        <div className="font-semibold text-xs sm:text-sm text-brand-cream">
          {module.label}
        </div>
        <div className="text-[0.65rem] sm:text-xs text-brand-smoke line-clamp-2 leading-snug max-w-[140px]">
          {module.description}
        </div>
      </div>
    </button>
  );
}
