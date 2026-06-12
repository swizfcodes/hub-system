import React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@lib/cn";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "children"
> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  surface?: "dark" | "light";
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      hint,
      error,
      options,
      className,
      surface = "light",
      placeholder,
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
          <select
            id={inputId}
            ref={ref}
            className={cn(
              "w-full appearance-none rounded-xl py-3.5 pl-4 pr-10 text-sm font-medium transition-all",
              "focus:outline-none focus:ring-1",
              isDark
                ? "bg-brand-charcoal text-brand-cream border border-brand-graphite focus:border-brand-accent focus:ring-brand-accent"
                : "bg-white text-brand-black border border-brand-cloud/40 focus:border-brand-black focus:ring-brand-black shadow-sm",
              error && "border-state-danger focus:border-state-danger",
              className,
            )}
            {...rest}
          >
            {placeholder && <option value="">{placeholder}</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-smoke pointer-events-none" />
        </div>
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
Select.displayName = "Select";
