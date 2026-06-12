import React from "react";
import { cn } from "@lib/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  surface?: "dark" | "light";
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, className, surface = "light", id, ...rest }, ref) => {
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
        <textarea
          id={inputId}
          ref={ref}
          className={cn(
            "w-full rounded-xl py-3 px-4 text-sm font-medium transition-all resize-vertical min-h-[100px]",
            "focus:outline-none focus:ring-1",
            isDark
              ? "bg-brand-charcoal text-brand-cream border border-brand-graphite focus:border-brand-accent focus:ring-brand-accent placeholder-brand-smoke/60"
              : "bg-white text-brand-black border border-brand-cloud/40 focus:border-brand-black focus:ring-brand-black placeholder-brand-cloud/70 shadow-sm",
            error && "border-state-danger focus:border-state-danger",
            className,
          )}
          aria-invalid={!!error}
          {...rest}
        />
        {error ? (
          <p className="mt-1.5 text-xs font-medium text-state-danger ml-1">
            {error}
          </p>
        ) : hint ? (
          <p
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
Textarea.displayName = "Textarea";
