"use strict";

// ─────────────────────────────────────────────────────────────
// lib/email/colors — brand-aware colour maths for email rendering.
//
// The email layout paints panels (header band, totals box, footer)
// with brand.secondary_colour, which Business Setup allows to be
// ANY colour — Orika Living uses a dark espresso (#2B2820), the
// platform default is a pale cream (#F5F0EB). Text sitting on those
// panels must therefore be computed, never hardcoded: dark ink on a
// light surface, light ink on a dark surface, and accents brightened
// or deepened until they actually read.
//
// Pure functions only — safe to use from templates and scripts.
// ─────────────────────────────────────────────────────────────

/** Parse #rgb / #rrggbb into {r,g,b}, or null when unparseable. */
function parseHex(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) {
    h = h.split("").map((c) => c + c).join("");
  }
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** WCAG relative luminance, 0 (black) → 1 (white). */
function luminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return 1; // treat unknowns as light — dark ink is the safer default
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

/** WCAG contrast ratio between two colours, 1 → 21. */
function contrast(hexA, hexB) {
  const la = luminance(hexA);
  const lb = luminance(hexB);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** True when a surface needs light ink on top of it. */
function isDark(hex) {
  return luminance(hex) < 0.4;
}

/** Linear blend of two colours: t=0 → a, t=1 → b. */
function mix(hexA, hexB, t) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return hexA;
  const k = Math.max(0, Math.min(1, t));
  return toHex({
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  });
}

/** The ink (near-black or white) that reads best on a background. */
function bestInkOn(bg) {
  return contrast("#ffffff", bg) >= contrast("#1c1a17", bg) ? "#ffffff" : "#1c1a17";
}

/**
 * Tonal ink palette for text sitting ON a given surface colour.
 * Tones are mixed from the surface itself toward white/black, so a
 * warm espresso panel gets warm ivory text — not sterile grey.
 *
 *   strong  — headlines, key figures (≈ 12:1)
 *   text    — body copy               (≈ 8:1)
 *   muted   — labels, secondary rows  (≈ 4.5:1)
 *   faint   — legal lines             (≈ 3.5:1)
 *   border  — hairlines that are meant to be seen
 *   divider — hairlines that are meant to whisper
 */
function inkOn(surface) {
  const ink = bestInkOn(surface);
  const tone = (t) => mix(surface, ink, t);
  return isDark(surface)
    ? {
        strong: tone(0.96),
        text: tone(0.85),
        muted: tone(0.66),
        faint: tone(0.52),
        border: tone(0.28),
        divider: tone(0.18),
      }
    : {
        strong: tone(0.9),
        text: tone(0.78),
        muted: tone(0.56),
        faint: tone(0.44),
        border: tone(0.18),
        divider: tone(0.1),
      };
}

/**
 * Nudge an accent colour until it actually reads on a background,
 * preserving its hue. Brand golds (e.g. #8A6A30) vanish on dark
 * espresso panels — this lifts them toward ivory; on white it deepens
 * pale accents toward ink. Returns the first step that clears
 * `minContrast` (default 3.2 — fine for the bold 14px+ we use it on).
 */
function readableOn(accent, bg, minContrast = 3.2) {
  if (!parseHex(accent) || !parseHex(bg)) return accent || bestInkOn(bg);
  if (contrast(accent, bg) >= minContrast) return accent;
  const towards = bestInkOn(bg);
  for (let t = 0.1; t <= 1; t += 0.1) {
    const candidate = mix(accent, towards, t);
    if (contrast(candidate, bg) >= minContrast) return candidate;
  }
  return towards;
}

module.exports = {
  parseHex,
  luminance,
  contrast,
  isDark,
  mix,
  bestInkOn,
  inkOn,
  readableOn,
};
