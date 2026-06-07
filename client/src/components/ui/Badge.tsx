import React from "react";
import { cn } from "@lib/cn";

type Tone =
  | "gold"
  | "rose"
  | "sage"
  | "neutral"
  | "danger"
  | "warn"
  | "info"
  | "plum";

export interface BadgeProps {
  tone?: Tone;
  size?: "xs" | "sm";
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}

const tones: Record<Tone, string> = {
  gold: "bg-orika-gold/15 text-orika-gold border-orika-gold/30",
  rose: "bg-bejewelled-rose/15 text-bejewelled-rose border-bejewelled-rose/30",
  sage: "bg-living-sage/15 text-living-sage border-living-sage/30",
  neutral: "bg-orika-graphite/40 text-orika-cloud border-orika-graphite",
  danger: "bg-state-danger/15 text-state-danger border-state-danger/30",
  warn: "bg-state-warn/15 text-state-warn border-state-warn/30",
  info: "bg-state-info/15 text-state-info border-state-info/30",
  plum: "bg-purple-500/15 text-purple-300 border-purple-500/20",
};

const dotColors: Record<Tone, string> = {
  gold: "bg-orika-gold",
  rose: "bg-bejewelled-rose",
  sage: "bg-living-sage",
  neutral: "bg-orika-cloud",
  danger: "bg-state-danger",
  warn: "bg-state-warn",
  info: "bg-state-info",
  plum: "bg-purple-400",
};

export function Badge({
  tone = "neutral",
  size = "sm",
  dot,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium tracking-wide uppercase",
        size === "xs"
          ? "px-2 py-0.5 text-[0.6rem]"
          : "px-2.5 py-1 text-[0.65rem]",
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span className={cn("w-1.5 h-1.5 rounded-full", dotColors[tone])} />
      )}
      {children}
    </span>
  );
}
