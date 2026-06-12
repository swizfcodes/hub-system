// ── lib/theme/derive.ts ──────────────────────────────────────
// Palette derivation for the Appearance page. A client gives us
// 3 accents + a mode (dark/light) and we generate the full token
// scale — neutral ladder, accent variants, light surfaces — as
// "R G B" triplets matching shared.platform_settings.theme.
// Deterministic and dependency-free, plus WCAG contrast checks so
// an owner can't accidentally publish an unreadable theme.

export type ThemeTokens = Record<string, string>;

// ── colour conversions ──

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export function hexToTriplet(hex: string): string | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgb.join(" ") : null;
}

export function tripletToHex(triplet?: string): string {
  if (!triplet) return "#000000";
  const parts = triplet.split(" ").map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return "#000000";
  return rgbToHex(parts as [number, number, number]);
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}

/** New colour from a reference hue/sat with explicit lightness/sat. */
function shade(hex: string, lightness: number, saturation?: number): string {
  const rgb = hexToRgb(hex) ?? [128, 128, 128];
  const [h, s] = rgbToHsl(rgb as [number, number, number]);
  return hslToRgb([h, saturation ?? s, lightness]).join(" ").replace(
    /[\d.]+/g,
    (v) => String(Math.round(parseFloat(v))),
  );
}

// ── contrast (WCAG 2.x) ──

function channelLum(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function contrastRatio(aTriplet: string, bTriplet: string): number {
  const lum = (t: string) => {
    const [r, g, b] = t.split(" ").map((p) => parseInt(p, 10));
    return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
  };
  const la = lum(aTriplet);
  const lb = lum(bTriplet);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface ContrastCheck {
  label: string;
  ratio: number;
  minimum: number;
  ok: boolean;
}

/** The readability pairs that matter most across the app. */
export function checkTheme(theme: ThemeTokens): ContrastCheck[] {
  const pair = (
    label: string,
    a?: string,
    b?: string,
    minimum = 4.5,
  ): ContrastCheck | null => {
    if (!a || !b) return null;
    const ratio = contrastRatio(a, b);
    return { label, ratio: Math.round(ratio * 10) / 10, minimum, ok: ratio >= minimum };
  };
  return [
    pair("Primary text on page", theme["brand-cream"], theme["brand-black"], 7),
    pair("Primary text on cards", theme["brand-cream"], theme["brand-charcoal"], 4.5),
    pair("Muted text on cards", theme["brand-smoke"], theme["brand-charcoal"], 3),
    pair("Accent on page", theme["brand-accent"], theme["brand-black"], 3),
    pair("Text on light surfaces", theme["brand-black"], theme["surface-light"], 7),
  ].filter((c): c is ContrastCheck => c !== null);
}

// ── derivation ──

export interface DeriveInput {
  /** Main brand accent (what gold is for Orika). */
  accent: string;
  /** Supporting accents (decorative; default to sage/rose-ish derivations). */
  accent2?: string;
  accent3?: string;
  /** Dark app (default) or light app. */
  mode: "dark" | "light";
  /**
   * Optional base colour whose hue tints the neutral ladder —
   * defaults to the accent, heavily desaturated, which is what
   * gives the generated theme its "custom built" warmth.
   */
  base?: string;
}

export function derivePalette(input: DeriveInput): ThemeTokens {
  const accent = input.accent;
  const accRgb = hexToRgb(accent) ?? [201, 168, 108];
  const [accH, accS, accL] = rgbToHsl(accRgb as [number, number, number]);

  // Neutral ladder takes its hue from base/accent at very low
  // saturation so surfaces feel related to the brand, never grey-dead.
  const base = input.base || accent;
  const neutralSat = 0.08;

  const dark = input.mode === "dark";

  // Lightness ladders (fractions). Dark mode mirrors the original
  // Orika scale; light mode flips the roles (black token = page bg).
  const L = dark
    ? {
        black: 0.035, charcoal: 0.085, graphite: 0.145, ink: 0.205,
        cream: 0.91, cloud: 0.78, stone: 0.62, smoke: 0.41,
      }
    : {
        black: 0.965, charcoal: 0.925, graphite: 0.86, ink: 0.8,
        cream: 0.13, cloud: 0.3, stone: 0.56, smoke: 0.44,
      };

  const accent2 = input.accent2 || rgbToHex(
    hslToRgb([accH + 105, Math.min(accS, 0.35), dark ? 0.55 : 0.42]),
  );
  const accent3 = input.accent3 || rgbToHex(
    hslToRgb([accH - 60, Math.min(accS, 0.4), dark ? 0.58 : 0.45]),
  );

  const accentDim = hslToRgb([accH, accS, Math.max(0.15, accL * 0.62)])
    .map(Math.round).join(" ");
  const accentGlow = hslToRgb([accH, accS, Math.min(0.92, accL + 0.13)])
    .map(Math.round).join(" ");

  const acc2T = hexToTriplet(accent2)!;
  const acc3T = hexToTriplet(accent3)!;
  const dimGlow = (t: string): [string, string] => {
    const [h, s, l] = rgbToHsl(t.split(" ").map(Number) as [number, number, number]);
    return [
      hslToRgb([h, s, Math.max(0.15, l * 0.78)]).map(Math.round).join(" "),
      hslToRgb([h, s, Math.min(0.92, l + 0.12)]).map(Math.round).join(" "),
    ];
  };
  const [a2dim, a2glow] = dimGlow(acc2T);
  const [a3dim, a3glow] = dimGlow(acc3T);

  return {
    "brand-black": shade(base, L.black, neutralSat),
    "brand-charcoal": shade(base, L.charcoal, neutralSat),
    "brand-graphite": shade(base, L.graphite, neutralSat),
    "brand-ink": shade(base, L.ink, neutralSat),
    "brand-cream": shade(base, L.cream, dark ? 0.18 : 0.12),
    "brand-cloud": shade(base, L.cloud, 0.1),
    "brand-stone": shade(base, L.stone, 0.05),
    "brand-smoke": shade(base, L.smoke, 0.05),
    "brand-accent": accRgb.join(" "),
    "brand-accent-dim": accentDim,
    "brand-accent-glow": accentGlow,
    accent2: acc2T,
    "accent2-dim": a2dim,
    "accent2-glow": a2glow,
    accent3: acc3T,
    "accent3-dim": a3dim,
    "accent3-glow": a3glow,
    // Light surfaces (modals/forms) stay light in both modes.
    "surface-light": shade(base, 0.93, 0.18),
    "surface-light-soft": shade(base, 0.89, 0.16),
    "surface-light-deep": shade(base, 0.84, 0.14),
    // States stay conventional — recognisability beats branding here.
    "state-success": "139 157 119",
    "state-warn": "217 167 65",
    "state-danger": "199 91 91",
    "state-info": "122 143 168",
  };
}

/** Build a React style object that scopes a theme to one element. */
export function themeStyle(theme: ThemeTokens): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const [token, triplet] of Object.entries(theme)) {
    style[`--${token}`] = triplet;
  }
  return style as React.CSSProperties;
}
