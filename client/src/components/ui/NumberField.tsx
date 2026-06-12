import React, { useEffect, useRef, useState } from "react";
import { cn } from "@lib/cn";

export interface NumberFieldProps {
  /** Current numeric value, or undefined when the box is empty. */
  value: number | undefined;
  /** Fired with the parsed number, or undefined when the box is cleared. */
  onValueChange: (value: number | undefined) => void;
  label?: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  /** Allow a decimal point (prices). false = integers only (quantities). */
  decimal?: boolean;
  /** Allow a leading minus sign (e.g. stock/points adjustments). */
  allowNegative?: boolean;
  /** Pressed Enter while focused — handy for "add next line" flows. */
  onEnter?: () => void;
  surface?: "dark" | "light";
  className?: string;
  disabled?: boolean;
  name?: string;
  onBlur?: () => void;
  id?: string;
}

/**
 * NumberField — a numeric input that behaves the way people expect:
 *
 *   - NO spinner arrows and NO scroll-wheel stealing (the cause of values
 *     silently changing when you scroll the page over a focused box).
 *   - Starts empty and can be fully cleared — no sticky 0 / 1 seed, no
 *     "can't delete the leading digit".
 *   - Strips stray leading zeros (so "0500000" → "500000") while still
 *     allowing "0.5" and a trailing "." mid-typing.
 *   - Emits a real number (or undefined when empty), never NaN.
 *
 * It is a controlled component: pass `value` + `onValueChange`. With
 * react-hook-form, wrap it in a <Controller> and forward field.value /
 * field.onChange.
 */
export function NumberField({
  value,
  onValueChange,
  label,
  hint,
  error,
  placeholder,
  decimal = false,
  allowNegative = false,
  onEnter,
  surface = "dark",
  className,
  disabled,
  name,
  onBlur,
  id,
}: NumberFieldProps) {
  const isDark = surface === "dark";
  const reactId = React.useId();
  const inputId = id || name || reactId;

  // Local display string so intermediate states ("", "12.", "0.") survive —
  // binding straight to a number would coerce these away mid-typing.
  const [text, setText] = useState(() => toText(value));
  const focused = useRef(false);

  // Re-sync from the outside (form reset, product autofill) — but only when
  // not actively typing, and only when it represents a different number, so
  // we never yank the cursor while the user edits.
  useEffect(() => {
    if (focused.current) return;
    const current = text === "" ? undefined : Number(text);
    if (current !== value) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value;
    const negative = allowNegative && raw.trimStart().startsWith("-");
    if (decimal) {
      // digits + a single dot
      raw = raw.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    } else {
      raw = raw.replace(/\D/g, "");
    }
    // Drop leading zeros unless followed by "." (keeps "0.5", kills "0500").
    raw = raw.replace(/^0+(?=\d)/, "");
    if (negative) raw = `-${raw}`;
    setText(raw);
    onValueChange(
      raw === "" || raw === "." || raw === "-" ? undefined : Number(raw),
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    }
  }

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
      <input
        id={inputId}
        name={name}
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        autoComplete="off"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          // Tidy a dangling "." on blur ("12." → "12").
          if (text.endsWith(".")) setText(text.slice(0, -1));
          onBlur?.();
        }}
        className={cn(
          "w-full rounded-xl py-3.5 px-4 text-sm font-medium transition-all",
          "focus:outline-none focus:ring-1",
          isDark
            ? "bg-brand-charcoal text-brand-cream border border-brand-graphite focus:border-brand-accent focus:ring-brand-accent placeholder-brand-smoke/60"
            : "bg-white text-brand-black border border-brand-cloud/40 focus:border-brand-black focus:ring-brand-black placeholder-brand-cloud/70 shadow-sm",
          error &&
            "border-state-danger focus:border-state-danger focus:ring-state-danger",
          className,
        )}
        aria-invalid={!!error}
      />
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-state-danger ml-1">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-brand-smoke ml-1">{hint}</p>
      ) : null}
    </div>
  );
}

function toText(value: number | undefined): string {
  return value === undefined || value === null || Number.isNaN(value)
    ? ""
    : String(value);
}
