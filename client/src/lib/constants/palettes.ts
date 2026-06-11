// Curated, on-brand accent palettes for businesses, pipeline stages, etc.
// Hand-picked for luxury — every colour pairs well with cream and black.

export interface SwatchColor {
  name: string;
  hex: string;
  category: "gold" | "rose" | "sage" | "plum" | "midnight" | "neutral";
}

export const BRAND_SWATCHES: SwatchColor[] = [
  // Golds (Orika signature family)
  { name: "Antique Gold", hex: "#C9A86C", category: "gold" },
  { name: "Dim Gold", hex: "#8A6A30", category: "gold" },
  { name: "Champagne", hex: "#D9BC87", category: "gold" },
  // Roses
  { name: "Rose", hex: "#B76E79", category: "rose" },
  { name: "Dusty Rose", hex: "#C49B96", category: "rose" },
  { name: "Garnet", hex: "#7C3340", category: "rose" },
  // Sages (Living family)
  { name: "Living Sage", hex: "#8B9D77", category: "sage" },
  { name: "Olive", hex: "#6F7E5E", category: "sage" },
  { name: "Eucalyptus", hex: "#A8B894", category: "sage" },
  // Midnights & plums
  { name: "Royal Plum", hex: "#5B3E5C", category: "plum" },
  { name: "Midnight Blue", hex: "#2C3E50", category: "midnight" },
  { name: "Indigo", hex: "#3F3D6B", category: "midnight" },
];

// Pipeline stage palette — narrower, signal-rich.
export const STAGE_SWATCHES: SwatchColor[] = [
  { name: "Slate", hex: "#94A3B8", category: "neutral" },
  { name: "Sky", hex: "#60A5FA", category: "midnight" },
  { name: "Amber", hex: "#FBBF24", category: "gold" },
  { name: "Orange", hex: "#F97316", category: "gold" },
  { name: "Emerald", hex: "#34D399", category: "sage" },
  { name: "Rose", hex: "#F87171", category: "rose" },
  { name: "Plum", hex: "#A855F7", category: "plum" },
  { name: "Gold", hex: "#C9A86C", category: "gold" },
];
