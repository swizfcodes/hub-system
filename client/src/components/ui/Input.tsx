import React from "react";
import { cn } from "@lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  surface?: "dark" | "light";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hint,
      error,
      leftIcon,
      rightSlot,
      className,
      surface = "light",
      id,
      ...rest
    },
    ref,
  ) => {
    const inputId = id || rest.name || React.useId();
    const isDark = surface === "dark";
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              "block font-medium text-[0.7rem] tracking-widest uppercase mb-2 ml-1",
              isDark ? "text-brand-smoke" : "text-text-on-light-muted",
            )}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-smoke/70 pointer-events-none">
              {leftIcon}
            </span>
          )}
          <input
            id={inputId}
            ref={ref}
            className={cn(
              "w-full rounded-xl py-3.5 px-4 text-sm font-medium transition-all",
              "focus:outline-none focus:ring-1",
              leftIcon && "pl-11",
              rightSlot && "pr-12",
              isDark
                ? "bg-brand-charcoal text-brand-cream border border-brand-graphite focus:border-brand-accent focus:ring-brand-accent placeholder-brand-smoke/60"
                : "bg-white text-brand-black border border-brand-cloud/40 focus:border-brand-black focus:ring-brand-black placeholder-brand-cloud/70 shadow-sm",
              error &&
                "border-state-danger focus:border-state-danger focus:ring-state-danger",
              className,
            )}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined
            }
            {...rest}
          />
          {rightSlot && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {rightSlot}
            </span>
          )}
        </div>
        {error ? (
          <p
            id={`${inputId}-err`}
            className="mt-1.5 text-xs font-medium text-state-danger ml-1"
          >
            {error}
          </p>
        ) : hint ? (
          <p
            id={`${inputId}-hint`}
            className={cn(
              "mt-1.5 text-[0.7rem] ml-1",
              isDark ? "text-brand-smoke" : "text-text-on-light-muted",
            )}
          >
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";
