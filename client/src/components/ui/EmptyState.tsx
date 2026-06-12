import React from "react";
import { cn } from "@lib/cn";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  surface?: "dark" | "light";
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  surface = "dark",
  className,
}: EmptyStateProps) {
  const isDark = surface === "dark";
  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-dashed py-12 sm:py-16 px-6 flex flex-col items-center justify-center text-center",
        isDark
          ? "border-brand-graphite bg-brand-charcoal/40"
          : "border-brand-cloud/60 bg-surface-light-soft surface-light",
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center mb-4",
            isDark
              ? "bg-brand-graphite text-brand-accent"
              : "bg-white text-brand-accent border border-brand-cloud/40",
          )}
        >
          {icon}
        </div>
      )}
      <h3
        className={cn(
          "font-display font-light text-xl sm:text-2xl mb-1.5",
          isDark ? "text-brand-cream" : "text-brand-black",
        )}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            "text-xs sm:text-sm max-w-md mb-5",
            isDark ? "text-brand-smoke" : "text-text-on-light-muted",
          )}
        >
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
