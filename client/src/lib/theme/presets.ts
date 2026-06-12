// ── lib/theme/presets.ts ─────────────────────────────────────
// Shipped theme presets for the Appearance page. Picking one fills
// the whole draft (palette + fonts); the owner then tweaks accents
// and uploads logos. This is what makes a fresh deployment feel
// custom-built in minutes.

import { derivePalette, type ThemeTokens } from "./derive";

export interface ThemePreset {
  key: string;
  name: string;
  description: string;
  mode: "dark" | "light";
  /** Swatch hexes shown on the preset card. */
  swatch: { accent: string; surface: string };
  font_display: string;
  font_body: string;
  theme: ThemeTokens;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: "midnight-luxury",
    name: "Midnight Luxury",
    description: "Warm black, antique gold — the original.",
    mode: "dark",
    swatch: { accent: "#C9A86C", surface: "#0A0908" },
    font_display: "Cormorant Garamond",
    font_body: "Montserrat",
    // Exact original palette, not derived — pixel-faithful for Orika.
    theme: {
      "brand-black": "10 9 8",
      "brand-charcoal": "26 24 20",
      "brand-graphite": "42 37 32",
      "brand-ink": "58 52 46",
      "brand-cream": "240 234 224",
      "brand-cloud": "200 194 184",
      "brand-smoke": "106 101 96",
      "brand-stone": "158 152 145",
      "brand-accent": "201 168 108",
      "brand-accent-dim": "138 106 48",
      "brand-accent-glow": "217 188 135",
      accent2: "139 157 119",
      "accent2-dim": "111 126 94",
      "accent2-glow": "168 184 148",
      accent3: "183 110 121",
      "accent3-dim": "149 88 98",
      "accent3-glow": "208 142 151",
      "surface-light": "240 234 224",
      "surface-light-soft": "230 223 211",
      "surface-light-deep": "217 208 194",
      "state-success": "139 157 119",
      "state-warn": "217 167 65",
      "state-danger": "199 91 91",
      "state-info": "122 143 168",
    },
  },
  {
    key: "noir-emeraude",
    name: "Noir Émeraude",
    description: "Deep green-black with polished emerald.",
    mode: "dark",
    swatch: { accent: "#2F9E78", surface: "#0B1210" },
    font_display: "Playfair Display",
    font_body: "Inter",
    theme: derivePalette({
      accent: "#2F9E78",
      accent2: "#C9A86C",
      accent3: "#7A8FA8",
      mode: "dark",
      base: "#15201B",
    }),
  },
  {
    key: "royal-indigo",
    name: "Royal Indigo",
    description: "Midnight blue with champagne highlights.",
    mode: "dark",
    swatch: { accent: "#8FA8D9", surface: "#0B0E16" },
    font_display: "Marcellus",
    font_body: "Work Sans",
    theme: derivePalette({
      accent: "#8FA8D9",
      accent2: "#C9A86C",
      accent3: "#B76E79",
      mode: "dark",
      base: "#1B2233",
    }),
  },
  {
    key: "porcelain",
    name: "Porcelain",
    description: "Light, airy, gallery-white with ink text.",
    mode: "light",
    swatch: { accent: "#9C6B3C", surface: "#F7F4EF" },
    font_display: "Libre Baskerville",
    font_body: "Nunito Sans",
    theme: derivePalette({
      accent: "#9C6B3C",
      accent2: "#6F7E5E",
      accent3: "#955862",
      mode: "light",
      base: "#B9A88F",
    }),
  },
  {
    key: "warm-boutique",
    name: "Warm Boutique",
    description: "Espresso brown with burnished copper.",
    mode: "dark",
    swatch: { accent: "#C77E4F", surface: "#140E0A" },
    font_display: "DM Serif Display",
    font_body: "Manrope",
    theme: derivePalette({
      accent: "#C77E4F",
      accent2: "#8B9D77",
      accent3: "#C9A86C",
      mode: "dark",
      base: "#3A2A1E",
    }),
  },
];

// Curated Google Fonts the picker offers. Anything here can be
// loaded at runtime by the ThemeProvider's font URL builder.
export const DISPLAY_FONTS = [
  "Cormorant Garamond",
  "Playfair Display",
  "Marcellus",
  "Cinzel",
  "Libre Baskerville",
  "DM Serif Display",
  "Fraunces",
];

export const BODY_FONTS = [
  "Montserrat",
  "Inter",
  "Work Sans",
  "Nunito Sans",
  "Manrope",
  "Lato",
  "Source Sans 3",
];

export const MONO_FONTS = ["JetBrains Mono", "IBM Plex Mono", "Fira Code"];
