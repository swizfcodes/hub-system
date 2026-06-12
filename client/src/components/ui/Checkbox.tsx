import React from "react";
import { Check } from "lucide-react";
import { cn } from "@lib/cn";

export interface CheckboxProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  surface?: "dark" | "light";
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  surface = "light",
}: CheckboxProps) {
  const isDark = surface === "dark";
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2.5 cursor-pointer select-none group",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "relative w-4 h-4 rounded flex items-center justify-center transition-colors flex-shrink-0",
          isDark
            ? "border border-brand-graphite bg-brand-charcoal group-hover:border-brand-accent/50"
            : "border border-brand-cloud bg-white group-hover:border-brand-black",
          checked &&
            (isDark
              ? "border-brand-accent bg-brand-accent/15"
              : "border-brand-black bg-brand-cream"),
        )}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        {checked && (
          <Check
            className={cn(
              "w-3 h-3",
              isDark ? "text-brand-accent" : "text-brand-black",
            )}
          />
        )}
      </span>
      {label && (
        <span
          className={cn(
            "text-xs font-medium",
            isDark ? "text-brand-cream" : "text-brand-black",
          )}
        >
          {label}
        </span>
      )}
    </label>
  );
}
