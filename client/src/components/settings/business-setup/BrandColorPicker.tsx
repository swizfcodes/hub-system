import { useState } from "react";
import { Check } from "lucide-react";
import { BRAND_SWATCHES } from "@lib/constants/palettes";
import {
  contrastRatio,
  isValidHex,
  normaliseHex,
  verdict,
  type ContrastVerdict,
} from "@lib/contrast";
import { Input } from "@components/ui/Input";
import { cn } from "@lib/cn";

interface Props {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
  surface?: "dark" | "light";
}

const verdictTone: Record<ContrastVerdict, string> = {
  AAA: "text-accent2",
  AA: "text-accent2",
  "AA-large": "text-state-warn",
  fail: "text-state-danger",
};

const verdictLabel: Record<ContrastVerdict, string> = {
  AAA: "AAA",
  AA: "AA",
  "AA-large": "AA (large only)",
  fail: "Insufficient",
};

export function BrandColorPicker({
  value,
  onChange,
  label = "Accent colour",
  surface = "light",
}: Props) {
  const [raw, setRaw] = useState(value || "#C9A86C");
  const isDark = surface === "dark";

  const handleHexChange = (input: string) => {
    setRaw(input);
    if (isValidHex(input)) onChange(normaliseHex(input));
  };

  // Contrast vs cream (#F0EAE0) and black (#0A0908) — both surfaces in the app
  const contrastCream = contrastRatio(value, "#F0EAE0");
  const contrastBlack = contrastRatio(value, "#0A0908");
  const vCream = verdict(contrastCream);
  const vBlack = verdict(contrastBlack);

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "text-[0.7rem] tracking-widest uppercase font-medium",
          isDark ? "text-brand-smoke" : "text-text-on-light-muted",
        )}
      >
        {label}
      </div>

      {/* Swatches */}
      <div className="grid grid-cols-6 sm:grid-cols-6 md:grid-cols-12 gap-2.5">
        {BRAND_SWATCHES.map((sw) => {
          const active = value.toUpperCase() === sw.hex.toUpperCase();
          return (
            <button
              key={sw.hex}
              type="button"
              onClick={() => {
                setRaw(sw.hex);
                onChange(sw.hex);
              }}
              className={cn(
                "aspect-square rounded-xl relative transition-all hover:scale-110 hover:shadow-card",
                active && "ring-2 ring-offset-2 ring-brand-accent",
                isDark
                  ? "ring-offset-brand-charcoal"
                  : "ring-offset-surface-light",
              )}
              style={{ background: sw.hex }}
              title={`${sw.name} · ${sw.hex}`}
              aria-label={sw.name}
            >
              {active && (
                <Check className="w-4 h-4 text-brand-cream absolute inset-0 m-auto drop-shadow-lg" />
              )}
            </button>
          );
        })}
      </div>

      {/* Custom hex */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
        <div className="flex-1">
          <Input
            label="Custom hex"
            value={raw}
            onChange={(e) => handleHexChange(e.target.value)}
            placeholder="#C9A86C"
            surface={surface}
          />
        </div>
        <div
          className="w-16 h-12 rounded-xl border shrink-0"
          style={{ background: value, borderColor: "rgba(0,0,0,0.1)" }}
          aria-label="Preview"
        />
      </div>

      {/* WCAG contrast verdicts */}
      <div
        className={cn(
          "text-xs grid grid-cols-2 gap-3 p-3 rounded-xl border",
          isDark
            ? "border-brand-graphite bg-brand-black/30"
            : "border-brand-cloud/40 bg-white/50",
        )}
      >
        <div>
          <div
            className={cn(
              "text-[0.6rem] uppercase tracking-widest font-semibold",
              isDark ? "text-brand-smoke" : "text-text-on-light-muted",
            )}
          >
            on cream
          </div>
          <div className={cn("text-sm font-mono mt-0.5", verdictTone[vCream])}>
            {contrastCream.toFixed(2)}:1 · {verdictLabel[vCream]}
          </div>
        </div>
        <div>
          <div
            className={cn(
              "text-[0.6rem] uppercase tracking-widest font-semibold",
              isDark ? "text-brand-smoke" : "text-text-on-light-muted",
            )}
          >
            on black
          </div>
          <div className={cn("text-sm font-mono mt-0.5", verdictTone[vBlack])}>
            {contrastBlack.toFixed(2)}:1 · {verdictLabel[vBlack]}
          </div>
        </div>
      </div>
    </div>
  );
}
