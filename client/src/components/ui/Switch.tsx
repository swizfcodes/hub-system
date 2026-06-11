import React from "react";
import { cn } from "@lib/cn";

export interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  surface?: "dark" | "light";
  id?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  surface = "dark",
  id,
}: SwitchProps) {
  const switchId = id || React.useId();
  const isDark = surface === "dark";
  return (
    <label
      htmlFor={switchId}
      className={cn(
        "flex items-start gap-3 cursor-pointer select-none group",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <button
        type="button"
        role="switch"
        id={switchId}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "mt-0.5 relative w-10 h-6 rounded-full transition-colors flex-shrink-0",
          checked
            ? "bg-brand-accent"
            : isDark
              ? "bg-brand-graphite"
              : "bg-brand-cloud",
          "focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-brand-cream shadow-card transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
      {(label || description) && (
        <div className="flex-1">
          {label && (
            <div
              className={cn(
                "text-sm font-medium",
                isDark ? "text-brand-cream" : "text-brand-black",
              )}
            >
              {label}
            </div>
          )}
          {description && (
            <div
              className={cn(
                "text-xs mt-0.5",
                isDark ? "text-brand-smoke" : "text-text-on-light-muted",
              )}
            >
              {description}
            </div>
          )}
        </div>
      )}
    </label>
  );
}
