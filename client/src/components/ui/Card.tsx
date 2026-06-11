import React from "react";
import { cn } from "@lib/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  surface?: "dark" | "light";
  interactive?: boolean;
  accent?: string; // hex — renders a top accent stripe
}

export function Card({
  surface = "dark",
  interactive,
  accent,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border overflow-hidden transition-all",
        surface === "dark"
          ? "bg-brand-charcoal border-brand-graphite shadow-card"
          : "bg-surface-light border-brand-cloud/40 shadow-sm surface-light",
        interactive &&
          "cursor-pointer hover:-translate-y-1 hover:shadow-card-lg hover:border-brand-accent/40",
        className,
      )}
      {...rest}
    >
      {accent && (
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: accent }}
        />
      )}
      {children}
    </div>
  );
}
