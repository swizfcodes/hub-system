import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@lib/cn";

type Variant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "gold"
  | "outline-light";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const base =
  "relative inline-flex items-center justify-center gap-2 font-semibold tracking-wide rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-brand-accent whitespace-nowrap";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-cream text-brand-black hover:bg-brand-cloud shadow-card hover:shadow-glow-md shimmer-trigger overflow-hidden",
  secondary:
    "bg-brand-charcoal text-brand-cream border border-brand-graphite hover:border-brand-accent/40 hover:bg-brand-graphite",
  ghost:
    "bg-transparent text-brand-cloud hover:text-brand-cream hover:bg-white/5",
  danger:
    "bg-state-danger/15 text-state-danger border border-state-danger/30 hover:bg-state-danger/25",
  gold: "bg-brand-accent text-brand-black hover:bg-brand-accent-glow shadow-glow-sm hover:shadow-glow-md",
  "outline-light":
    "bg-transparent text-brand-black border border-brand-cloud/40 hover:border-brand-black hover:bg-white/40",
};

const sizes: Record<Size, string> = {
  sm: "h-9  px-3   text-xs",
  md: "h-11 px-5   text-sm",
  lg: "h-13 px-7   text-sm uppercase",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading,
      leftIcon,
      rightIcon,
      className,
      children,
      fullWidth,
      disabled,
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        base,
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      <span
        className={cn("inline-flex items-center gap-2", loading && "opacity-0")}
      >
        {leftIcon}
        {children}
        {rightIcon}
      </span>
      {variant === "primary" && <span className="btn-shimmer" />}
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
        </span>
      )}
    </button>
  ),
);
Button.displayName = "Button";
